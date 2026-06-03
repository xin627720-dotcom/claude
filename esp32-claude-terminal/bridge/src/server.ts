// 多端聊天中枢：ESP32 / 网页 / 其他客户端都连到这里，共享同一个 Claude 会话；
// 任意端的输入喂给 Claude，回复广播给所有在线端（你在手机网页发一句，ESP32 屏幕也同步）。
// 同一个 HTTP 服务既提供网页聊天 UI，也承载 WebSocket；公网由 cloudflared 转成 https/wss。
import { createServer, type IncomingMessage } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import * as proto from "./protocol.js";
import { chunkPcm } from "./audio.js";
import { ClaudeSession } from "./claude.js";
import { AppHost } from "./apphost.js";
import { transcribe } from "./stt.js";
import { synthesize } from "./tts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_INDEX = join(__dirname, "..", "web", "index.html");
const FIRMWARE_DIR = resolve(config.firmwareDir); // OTA .bin 目录

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------- 单个客户端连接 ----------------
let nextId = 1;
class Client {
  id = nextId++;
  caps: string[] = [];
  micChunks: Buffer[] = [];
  imgChunks: Buffer[] = [];
  constructor(public ws: WebSocket) {}
  get wantsAudio(): boolean {
    return this.caps.includes("audio_out");
  }
  sendJson(m: proto.ServerMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  sendBin(buf: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(buf, { binary: true });
  }
}

// ---------------- 中枢：一个共享 Claude 会话，多端 ----------------
class Hub {
  private clients = new Set<Client>();
  private claude: ClaudeSession;
  private ttsTextBuf = "";
  private ttsChain: Promise<void> = Promise.resolve();
  private pendingImage: { b64: string; at: number } | null = null;
  private app: AppHost;
  sessionId = "";

  constructor() {
    this.claude = new ClaudeSession({
      onSessionId: (id) => {
        this.sessionId = id;
        this.broadcast({ t: "ready", session: id });
      },
      onStatus: (state, detail) => this.broadcast({ t: "status", state, detail }),
      onTextDelta: (text) => {
        this.broadcast({ t: "delta", text });
        this.feedTts(text);
      },
      onResult: (r) => {
        this.flushTts();
        this.broadcast({
          t: "result",
          session: this.sessionId,
          text: r.text,
          cost_usd: r.cost_usd,
          duration_ms: r.duration_ms,
        });
      },
      onError: (msg) => this.broadcast({ t: "error", msg }),
    });
    this.claude.ensureStarted();

    this.app = new AppHost({
      onOpen: (m) => this.broadcast({ t: "app_open", name: m.name, w: m.w, h: m.h }),
      onFrame: (ops) => this.broadcast({ t: "app_frame", ops }),
      onClose: () => this.broadcast({ t: "app_close" }),
      onError: (msg) => this.broadcast({ t: "error", msg }),
    });
  }

  button(code: string, down: boolean): void {
    this.app.setButton(code, down);
  }

  add(c: Client): void {
    this.clients.add(c);
    if (this.sessionId) c.sendJson({ t: "ready", session: this.sessionId });
  }
  remove(c: Client): void {
    this.clients.delete(c);
  }

  private broadcast(m: proto.ServerMsg, filter?: (c: Client) => boolean): void {
    for (const c of this.clients) if (!filter || filter(c)) c.sendJson(m);
  }

  /** 任意端来的一轮用户输入（文字）。会回显给所有端，并附带最近的摄像头帧。 */
  userTurn(text: string, from: string): void {
    if (!text) return;
    const cmd = text.trim();
    if (cmd === "/stop") { this.app.stop(); return; }
    if (cmd.startsWith("/play ")) {
      this.broadcast({ t: "user", text: cmd, from });
      this.app
        .start(cmd.slice(6).trim())
        .catch((e) => this.broadcast({ t: "error", msg: `加载应用失败: ${errMsg(e)}` }));
      return;
    }
    if (cmd.startsWith("/ota ")) {
      const arg = cmd.slice(5).trim();
      const base = config.publicUrl || `http://${config.host}:${config.port}`;
      const url = /^https?:\/\//.test(arg) ? arg : `${base}/firmware/${encodeURIComponent(arg)}`;
      this.broadcast({ t: "user", text: cmd, from });
      this.broadcast({ t: "ota", url }); // 设备下载该固件并重启进入（B 路线）
      return;
    }
    this.broadcast({ t: "user", text, from }); // 回显到所有显示端（含 ESP32 聊天框）
    const img =
      this.pendingImage && Date.now() - this.pendingImage.at < 15000 ? this.pendingImage : null;
    this.pendingImage = null;
    if (img) this.claude.sendImage(text, img.b64);
    else this.claude.send(text);
  }

  cancel(): void {
    this.claude.interrupt();
  }

  /** 设备上传的一帧 JPEG：缓存给下一轮提问，并把预览推给网页端。 */
  onImage(jpeg: Buffer): void {
    if (jpeg.length === 0) return;
    const b64 = jpeg.toString("base64");
    this.pendingImage = { b64, at: Date.now() };
    this.broadcast({ t: "frame", data: b64 }, (c) => !c.wantsAudio); // 网页端看预览（ESP32 本地自带预览）
  }

  /** 设备一段语音收完：STT → 回显 → 喂 Claude。 */
  async onAudioUtterance(pcm: Buffer): Promise<void> {
    if (pcm.length === 0) return;
    try {
      const text = await transcribe(pcm, config.audioRate);
      if (!text) {
        this.broadcast({ t: "status", state: "idle", detail: "没听清" });
        return;
      }
      this.broadcast({ t: "stt", text });
      this.userTurn(text, "voice");
    } catch (e) {
      this.broadcast({ t: "error", msg: `STT 失败: ${errMsg(e)}` });
    }
  }

  // ---- TTS 按句流水线；音频只发给声明了 audio_out 的端（ESP32）----
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
        const audioClients = [...this.clients].filter((c) => c.wantsAudio);
        if (audioClients.length === 0) return;
        const { pcm, rate } = await synthesize(sentence);
        if (pcm.length === 0) return;
        for (const c of audioClients) c.sendJson({ t: "tts_begin", rate });
        const spf = Math.round(rate * 0.03);
        const frames = [...chunkPcm(pcm, spf)];
        for (let i = 0; i < frames.length; i++) {
          const last = i === frames.length - 1;
          const buf = proto.encodeAudioFrame(proto.CH_TTS, frames[i], last);
          for (const c of audioClients) c.sendBin(buf);
        }
        for (const c of audioClients) c.sendJson({ t: "tts_end" });
      })
      .catch((e) => this.broadcast({ t: "error", msg: `TTS 失败: ${errMsg(e)}` }));
  }
}

const hub = new Hub();

// ---------------- 连接与消息分发 ----------------
function authorized(req: IncomingMessage): boolean {
  if (!config.authToken) return true;
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

function flushMic(c: Client): void {
  const pcm = Buffer.concat(c.micChunks);
  c.micChunks = [];
  void hub.onAudioUtterance(pcm);
}
function flushImg(c: Client): void {
  const jpeg = Buffer.concat(c.imgChunks);
  c.imgChunks = [];
  hub.onImage(jpeg);
}

function onClientMessage(c: Client, data: Buffer, isBinary: boolean): void {
  if (isBinary) {
    const f = proto.decodeAudioFrame(data);
    if (!f) return;
    if (f.channel === proto.CH_MIC) {
      c.micChunks.push(f.payload);
      if (f.last) flushMic(c);
    } else if (f.channel === proto.CH_IMG) {
      c.imgChunks.push(f.payload);
      if (f.last) flushImg(c);
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
      c.caps = Array.isArray(m.caps) ? m.caps : [];
      break;
    case "prompt":
      if (m.text) hub.userTurn(String(m.text), "text");
      break;
    case "audio_begin":
      c.micChunks = [];
      break;
    case "audio_end":
      flushMic(c);
      break;
    case "image_begin":
      c.imgChunks = [];
      break;
    case "image_end":
      flushImg(c);
      break;
    case "cancel":
      hub.cancel();
      break;
    case "btn":
      hub.button(String(m.code), !!m.down);
      break;
    case "ping":
      c.sendJson({ t: "pong" });
      break;
  }
}

// ---------------- HTTP（网页 UI）+ WebSocket ----------------
const webIndex = existsSync(WEB_INDEX)
  ? readFileSync(WEB_INDEX)
  : Buffer.from("<h1>web/index.html 缺失</h1>");

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(webIndex);
  } else if (path.startsWith("/firmware/")) {
    // 提供 OTA 固件 .bin（设备据此下载）。basename + 前缀校验，防目录穿越。
    const name = basename(path.slice("/firmware/".length));
    const file = resolve(FIRMWARE_DIR, name);
    if (name && file.startsWith(FIRMWARE_DIR) && existsSync(file)) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(readFileSync(file));
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

const wss = new WebSocketServer({ server, path: config.wsPath });
wss.on("connection", (ws, req) => {
  if (!authorized(req)) {
    ws.close(1008, "unauthorized");
    return;
  }
  const c = new Client(ws);
  hub.add(c);
  ws.on("message", (data: Buffer, isBinary) => onClientMessage(c, data, isBinary));
  ws.on("close", () => hub.remove(c));
  ws.on("error", () => hub.remove(c));
});

server.listen(config.port, config.host, () => {
  console.log(`[bridge] 网页聊天 http://${config.host}:${config.port}/`);
  console.log(`[bridge] WebSocket ws://${config.host}:${config.port}${config.wsPath}`);
  console.log(`[bridge] 工作目录 ${config.workspaceDir}  权限 ${config.permissionMode}  STT=${config.stt.provider} TTS=${config.tts.provider}`);
  if (!config.authToken) console.warn("[bridge] ⚠ 未设置 AUTH_TOKEN —— 公网暴露前务必设置！");
});
