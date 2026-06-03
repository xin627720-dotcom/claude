// 语音转文字（STT）。可插拔：OpenAI Whisper / 本地 whisper.cpp / 关闭。
import { config } from "./config.js";
import { pcmToWav } from "./audio.js";

/** 把一段 PCM(s16le,mono) 转成文字。太短的（<0.2s）直接忽略。 */
export async function transcribe(pcm: Buffer, rate: number): Promise<string> {
  if (pcm.length < rate * 2 * 0.2) return "";
  switch (config.stt.provider) {
    case "openai":
      return openaiSTT(pcm, rate);
    case "whispercpp":
      return whisperCppSTT(pcm, rate);
    default:
      throw new Error("STT_PROVIDER=none：未配置语音识别");
  }
}

async function openaiSTT(pcm: Buffer, rate: number): Promise<string> {
  if (!config.stt.openaiKey) throw new Error("缺少 OPENAI_API_KEY");
  const form = new FormData();
  form.append("file", new Blob([pcmToWav(pcm, rate)], { type: "audio/wav" }), "audio.wav");
  form.append("model", config.stt.model);
  form.append("response_format", "json");
  const res = await fetch(`${config.stt.openaiBase}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.stt.openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { text?: string };
  return (j.text ?? "").trim();
}

// whisper.cpp 的 server 例：./server -m model.bin --port 8081，接口 POST /inference
async function whisperCppSTT(pcm: Buffer, rate: number): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([pcmToWav(pcm, rate)], { type: "audio/wav" }), "audio.wav");
  form.append("response_format", "json");
  const res = await fetch(config.stt.whisperUrl, { method: "POST", body: form });
  if (!res.ok) throw new Error(`whisper.cpp STT ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { text?: string };
  return (j.text ?? "").trim();
}
