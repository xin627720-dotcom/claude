// 命令行“假设备”：连上桥接，发一条文本 prompt，把流式回答打印出来。
// 用于不接硬件就验证「桥接 ↔ Claude Code」整条链路。
//   npm run probe -- "用一句话介绍这个仓库"
import { WebSocket } from "ws";
import { config } from "./config.js";

const prompt = process.argv.slice(2).join(" ") || "用一句话说明你能帮我做什么";
const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
const url =
  `ws://${host}:${config.port}${config.wsPath}` +
  (config.authToken ? `?token=${encodeURIComponent(config.authToken)}` : "");

let ttsBytes = 0;
let attempts = 0;
const MAX_ATTEMPTS = 20; // 启动竞态：连不上就重试（node 定时器，非 shell sleep）

function connect(): void {
  const ws = new WebSocket(url);
  let opened = false;

  ws.on("open", () => {
    opened = true;
    ws.send(JSON.stringify({ t: "hello", fw: "probe", caps: [] }));
    ws.send(JSON.stringify({ t: "prompt", text: prompt }));
    process.stdout.write(`\n> ${prompt}\n\n`);
  });

  ws.on("message", (data: Buffer, isBinary) => {
    if (isBinary) {
      ttsBytes += Math.max(0, data.length - 4);
      return;
    }
    const m = JSON.parse(data.toString("utf8"));
    switch (m.t) {
      case "ready":
        process.stderr.write(`[session ${m.session}]\n`);
        break;
      case "stt":
        process.stdout.write(`(识别) ${m.text}\n`);
        break;
      case "status":
        process.stderr.write(`  · ${m.state}${m.detail ? ": " + m.detail : ""}\n`);
        break;
      case "delta":
      case "message":
        process.stdout.write(m.text);
        break;
      case "result":
        process.stdout.write(
          `\n\n[完成] TTS 音频 ${ttsBytes} 字节` +
            (m.cost_usd ? ` · $${m.cost_usd}` : "") +
            (m.duration_ms ? ` · ${m.duration_ms}ms` : "") +
            "\n"
        );
        ws.close();
        process.exit(0);
        break;
      case "error":
        process.stderr.write(`\n[error] ${m.msg}\n`);
        break;
    }
  });

  ws.on("error", (e: Error & { code?: string }) => {
    if (!opened && attempts < MAX_ATTEMPTS) {
      attempts++;
      setTimeout(connect, 500);
      return;
    }
    console.error("probe 连接失败:", e.message);
    process.exit(1);
  });
}

connect();
