// 用 Claude Agent SDK 驱动“真正的 Claude Code”。
// 采用「长连接 + 流式输入」模式：进程起一次，语音指令逐条喂进同一个会话，
// 助手回答逐字流出（含工具使用状态），全程保持上下文。
import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";

// 流式输入要 yield 的用户消息形状（见 Agent SDK 的 SDKUserMessage）。
type UserMsg = {
  type: "user";
  message: { role: "user"; content: string | object[] };
  parent_tool_use_id: null;
};

/** 一个可被异步迭代、又能随时 push 新值的队列，作为 query() 的流式输入。 */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(v: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value: v, done: false });
    else this.items.push(v);
  }
  close(): void {
    this.closed = true;
    let w: ((r: IteratorResult<T>) => void) | undefined;
    while ((w = this.waiters.shift())) w({ value: undefined as never, done: true });
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((res) => this.waiters.push(res));
      },
    };
  }
}

export interface ClaudeCallbacks {
  onSessionId?(id: string): void;
  onStatus?(state: "thinking" | "tool" | "idle", detail?: string): void;
  onTextDelta?(text: string): void;
  onResult?(r: { text?: string; cost_usd?: number; duration_ms?: number; isError: boolean }): void;
  onError?(msg: string): void;
}

// 让助手知道自己是在一个语音终端上工作：回答要简短、可朗读。
const VOICE_SYSTEM_APPEND =
  "You are operating through a hands-free voice terminal on a small device. " +
  "The user HEARS your replies via text-to-speech and reads them on a tiny screen. " +
  "Keep answers concise, conversational, and easy to speak aloud; avoid long code blocks, " +
  "tables, or markdown unless explicitly asked. When you take actions (editing files, running " +
  "commands), briefly state what you did in one sentence.";

export class ClaudeSession {
  private input = new AsyncQueue<UserMsg>();
  private runner: AsyncIterable<unknown> & { interrupt?: () => unknown } = null as never;
  private started = false;
  sessionId = "";

  constructor(private cb: ClaudeCallbacks) {}

  /** 提前启动会话（拿到 session_id 上报 ready，无需等用户先说话）。 */
  ensureStarted(): void {
    if (this.started) return;
    this.started = true;

    const options: Record<string, unknown> = {
      cwd: config.workspaceDir,
      permissionMode: config.permissionMode,
      includePartialMessages: true, // 开启 token 级流式（stream_event）
      maxTurns: config.maxTurns,
      systemPrompt: { type: "preset", preset: "claude_code", append: VOICE_SYSTEM_APPEND },
    };
    if (config.claudeModel) options.model = config.claudeModel;
    if (config.claudeExecutable) options.pathToClaudeCodeExecutable = config.claudeExecutable;

    const runner = (query as Any)({ prompt: this.input, options }) as AsyncIterable<unknown> & {
      interrupt?: () => unknown;
    };
    this.runner = runner;
    this.consume(runner).catch((e) => this.cb.onError?.(errMsg(e)));
  }

  /** 喂一条用户输入（一轮新的对话）。 */
  send(text: string): void {
    this.ensureStarted();
    this.cb.onStatus?.("thinking");
    this.input.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
  }

  /** 喂一条带图片的用户输入（图片 + 可选文字），用于摄像头识别。 */
  sendImage(text: string, base64: string, mediaType = "image/jpeg"): void {
    this.ensureStarted();
    this.cb.onStatus?.("thinking");
    const content: object[] = [];
    if (text) content.push({ type: "text", text });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
    this.input.push({ type: "user", message: { role: "user", content }, parent_tool_use_id: null });
  }

  /** 打断当前回合。 */
  interrupt(): void {
    try {
      this.runner?.interrupt?.();
    } catch {
      /* ignore */
    }
  }

  /** 关闭会话（设备断开时）。 */
  close(): void {
    this.input.close();
  }

  private async consume(runner: AsyncIterable<unknown>): Promise<void> {
    for await (const raw of runner) {
      const msg = raw as Any;
      switch (msg?.type) {
        case "system":
          if (msg.subtype === "init" && msg.session_id) {
            this.sessionId = msg.session_id;
            this.cb.onSessionId?.(msg.session_id);
          }
          break;

        case "stream_event": {
          const ev = msg.event as Any;
          if (!ev) break;
          if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            this.cb.onStatus?.("tool", ev.content_block.name);
          } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            this.cb.onTextDelta?.(ev.delta.text ?? "");
          }
          break;
        }

        case "result": {
          const isError = msg.subtype === "error" || msg.is_error === true;
          this.cb.onResult?.({
            text: typeof msg.result === "string" ? msg.result : undefined,
            cost_usd: msg.total_cost_usd ?? msg.cost_usd,
            duration_ms: msg.duration_ms,
            isError,
          });
          this.cb.onStatus?.("idle");
          break;
        }
      }
    }
  }
}

// 对 SDK 的消息/入参用宽松别名，靠运行时收窄，避免与具体 SDK 版本的导出类型强耦合。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
