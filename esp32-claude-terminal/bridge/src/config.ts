import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- 极简 .env 加载器（不引依赖）。已存在的环境变量优先 ---
(function loadDotenv() {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const E = process.env;
function int(v: string | undefined, d: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : d;
}

export const config = {
  host: E.HOST || "127.0.0.1",
  port: int(E.PORT, 8787),
  wsPath: E.WS_PATH || "/agent",
  authToken: E.AUTH_TOKEN || "",
  publicUrl: E.PUBLIC_URL || "", // OTA 固件下载的公网基址（一般是 cloudflared 隧道）
  firmwareDir: E.FIRMWARE_DIR || "firmware-bin",

  workspaceDir: E.WORKSPACE_DIR || process.cwd(),
  permissionMode: E.PERMISSION_MODE || "acceptEdits",
  claudeModel: E.CLAUDE_MODEL || "",
  // 可选：指向已安装的 claude 可执行文件；留空则用 Agent SDK 自带的二进制。
  claudeExecutable: E.CLAUDE_EXECUTABLE || "",
  maxTurns: int(E.MAX_TURNS, 50),

  audioRate: int(E.AUDIO_RATE, 16000),

  stt: {
    provider: (E.STT_PROVIDER || "openai") as "openai" | "whispercpp" | "none",
    model: E.STT_MODEL || "whisper-1",
    openaiKey: E.OPENAI_API_KEY || "",
    openaiBase: E.OPENAI_BASE_URL || "https://api.openai.com/v1",
    whisperUrl: E.WHISPER_URL || "http://127.0.0.1:8081/inference",
  },

  tts: {
    provider: (E.TTS_PROVIDER || "openai") as "openai" | "piper" | "none",
    model: E.TTS_MODEL || "gpt-4o-mini-tts",
    voice: E.TTS_VOICE || "alloy",
    openaiKey: E.OPENAI_API_KEY || "",
    openaiBase: E.OPENAI_BASE_URL || "https://api.openai.com/v1",
    piperUrl: E.PIPER_URL || "http://127.0.0.1:5000",
  },
};
