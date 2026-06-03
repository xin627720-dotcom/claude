// 文字转语音（TTS）。返回 PCM(s16le,mono) 及其采样率，由设备 I2S 直接播放。
// 可插拔：OpenAI TTS / 本地 Piper / 关闭。
import { config } from "./config.js";
import { wavToPcm } from "./audio.js";

export interface TtsResult {
  pcm: Buffer;
  rate: number; // 设备据此设置 I2S TX 时钟（OpenAI 通常为 24000）
}

export async function synthesize(text: string): Promise<TtsResult> {
  switch (config.tts.provider) {
    case "openai":
      return openaiTTS(text);
    case "piper":
      return piperTTS(text);
    default:
      throw new Error("TTS_PROVIDER=none：未配置语音合成");
  }
}

async function openaiTTS(text: string): Promise<TtsResult> {
  if (!config.tts.openaiKey) throw new Error("缺少 OPENAI_API_KEY");
  const res = await fetch(`${config.tts.openaiBase}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.tts.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.tts.model,
      voice: config.tts.voice,
      input: text,
      response_format: "wav", // 取 WAV，解析出 PCM 与采样率
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
  return wavToPcm(Buffer.from(await res.arrayBuffer()));
}

// Piper HTTP server 例（社区镜像 wsl/piper-http 等）：POST {text} -> audio/wav
async function piperTTS(text: string): Promise<TtsResult> {
  const res = await fetch(config.tts.piperUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Piper TTS ${res.status}: ${await res.text()}`);
  return wavToPcm(Buffer.from(await res.arrayBuffer()));
}
