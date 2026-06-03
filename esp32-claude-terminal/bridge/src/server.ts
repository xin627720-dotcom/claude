// 桥接 WebSocket 服务：设备连上来后，把语音/文本喂给 Claude Code，
// 把逐字回答 + 合成语音流回设备。本地只监听 ws://，公网由 cloudflared 提供 wss://。
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { config } from "./config.js";
import * as proto from "./protocol.js";
import { chunkPcm } from "./audio.js";
import { ClaudeSession } from "./claude.js";
import { transcribe } from "./stt.js";
import { synthesize } from "./tts.js";

const wss = new WebSocketServer({ host: config.host, port: config.port, path: config.wsPath });

wss.on("connection", (ws, req) => {
  if (!authorized(req)) {
    ws.close(1008, "unauthorized");
    return;
  }
  new DeviceSession(ws);
});

function authorized(req: IncomingMessage): boolean {
  if (!config.authToken) return true; // 未配置 token：仅限本机调试
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth === `Bearer ${config.authToken}`) return true;
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.searchParams.get("token") === config.authToken) return true;
  } catch {
    /* ignore */
  }
  return false;
}

class DeviceSession {
  private claude: ClaudeSession;
  private micChunks: Buffer[] = [];
  private ttsTextBuf = ""; // 累积助手文本，按句切分送 TTS
  private ttsChain: Promise<void> = Promise.resolve(); // 串行化 TTS 播放顺序
  private alive = true;

  constructor(private ws: WebSocket) {
    this.claude = new ClaudeSession({
      onSessionId: (id) => this.send({ t: "ready", session: id }),
      onStatus: (state, detail) => this.send({ t: "status", state, detail }),
      onTextDelta: (text) => {
        this.send({ t: "delta", text });
        this.feedTts(text);
      },
      onResult: (r) => {
        this.flushTts();
        this.send({
          t: "result",
          session: this.claude.sessionId,
          text: r.text,
          cost_usd: r.cost_usd,
          duration_ms: r.duration_ms,
        });
      },
      onError: (msg) => this.send({ t: "error", msg }),
    });

    ws.on("message", (data: Buffer, isBinary) => this.onMessage(data, isBinary));
    ws.on("close", () => {
      this.alive = false;
      this.claude.close();
    });
    ws.on("error", () => {
      /* 交给 close 清理 */
    });

    // 提前启动，尽快拿到 session_id 回 ready。
    this.claude.ensureStarted();
  }

  private onMessage(data: Buffer, isBinary: boolean): void {
    if (isBinary) {
      const frame = proto.decodeAudioFrame(data);
      if (frame && frame.channel === proto.CH_MIC) {
        this.micChunks.push(frame.payload);
        if (frame.last) void this.finishAudio();
      }
      return;
    }
    let m: proto.DeviceMsg;
    try {
      m = JSON.parse(data.toString("utf8")) as proto.DeviceMsg;
    } catch {
      return;
    }
    switch (m.t) {
      case "hello":
        break; // 可在此记录 caps
      case "prompt":
        if (m.text) this.claude.send(String(m.text));
        break;
      case "audio_begin":
        this.micChunks = [];
        break;
      case "audio_end":
        void this.finishAudio();
        break;
      case "cancel":
        this.claude.interrupt();
        break;
      case "ping":
        this.send({ t: "pong" });
        break;
    }
  }

  /** 一段语音收完：STT → 上屏确认 → 喂给 Claude。 */
  private async finishAudio(): Promise<void> {
    if (this.micChunks.length === 0) return;
    const pcm = Buffer.concat(this.micChunks);
    this.micChunks = [];
    try {
      const text = await transcribe(pcm, config.audioRate);
      if (!text) {
        this.send({ t: "status", state: "idle", detail: "没听清" });
        return;
      }
      this.send({ t: "stt", text });
      this.claude.send(text);
    } catch (e) {
      this.send({ t: "error", msg: `STT 失败: ${errMsg(e)}` });
    }
  }

  // ---------- TTS 按句流水线：凑齐一句就合成并下发，边说边出声 ----------
  private feedTts(text: string): void {
    if (config.tts.provider === "none") return;
    this.ttsTextBuf += text;
    const re = /[^。．.!?！？\n]*[。．.!?！？\n]/g;
    let consumed = 0;
    let mt: RegExpExecArray | null;
    while ((mt = re.exec(this.ttsTextBuf)) !== null) {
      const sentence = mt[0].trim();
      consumed = re.lastIndex;
      if (sentence) this.enqueueTts(sentence);
    }
    if (consumed) this.ttsTextBuf = this.ttsTextBuf.slice(consumed);
  }

  private flushTts(): void {
    const rest = this.ttsTextBuf.trim();
    this.ttsTextBuf = "";
    if (rest) this.enqueueTts(rest);
  }

  private enqueueTts(sentence: string): void {
    if (config.tts.provider === "none") return;
    this.ttsChain = this.ttsChain
      .then(async () => {
        if (!this.alive) return;
        const { pcm, rate } = await synthesize(sentence);
        if (!this.alive || pcm.length === 0) return;
        this.send({ t: "tts_begin", rate });
        const samplesPerFrame = Math.round(rate * 0.03); // ~30ms/帧
        const frames = [...chunkPcm(pcm, samplesPerFrame)];
        for (let i = 0; i < frames.length; i++) {
          if (!this.alive) return;
          const last = i === frames.length - 1;
          this.sendBinary(proto.encodeAudioFrame(proto.CH_TTS, frames[i], last));
        }
        this.send({ t: "tts_end" });
      })
      .catch((e) => this.send({ t: "error", msg: `TTS 失败: ${errMsg(e)}` }));
  }

  private send(msg: proto.ServerMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  private sendBinary(buf: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(buf, { binary: true });
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

console.log(`[bridge] 监听 ws://${config.host}:${config.port}${config.wsPath}`);
console.log(`[bridge] 工作目录 ${config.workspaceDir}  权限模式 ${config.permissionMode}`);
console.log(`[bridge] STT=${config.stt.provider}  TTS=${config.tts.provider}`);
if (!config.authToken) {
  console.warn("[bridge] ⚠ 未设置 AUTH_TOKEN —— 公网暴露前务必在 .env 里设一个长随机 token！");
}
