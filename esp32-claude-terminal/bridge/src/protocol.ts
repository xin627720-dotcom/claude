// 设备 ↔ 桥接 通信协议 v1 —— 与 firmware/main/protocol.h 和 docs/PROTOCOL.md 保持一致。

export const WS_PROTOCOL_VERSION = 1;

// 二进制音频帧头（4 字节）
export const AUDIO_MAGIC = 0xa5;
export const CH_MIC = 0x01; // 设备 → 桥接（麦克风音频）
export const CH_TTS = 0x02; // 桥接 → 设备（TTS 音频）
export const CH_IMG = 0x03; // 设备 → 桥接（摄像头 JPEG）
export const FLAG_LAST = 0x01; // flags bit0：本段最后一帧

// ---- 设备 → 桥接 ----
export type DeviceMsg =
  | { t: "hello"; fw?: string; caps?: string[] }
  | { t: "prompt"; text: string }
  | { t: "audio_begin"; rate?: number }
  | { t: "audio_end" }
  | { t: "image_begin"; fmt?: string }
  | { t: "image_end" }
  | { t: "cancel" }
  | { t: "btn"; code: string; down: boolean }
  | { t: "ping" };

// ---- 桥接 → 设备 ----
export type ServerMsg =
  | { t: "ready"; session: string }
  | { t: "stt"; text: string }
  | { t: "status"; state: "thinking" | "tool" | "idle"; detail?: string }
  | { t: "delta"; text: string }
  | { t: "message"; text: string }
  | { t: "tts_begin"; rate: number }
  | { t: "tts_end" }
  | { t: "result"; session: string; text?: string; cost_usd?: number; duration_ms?: number }
  | { t: "user"; text: string; from?: string }
  | { t: "frame"; data: string }
  | { t: "app_open"; name: string; w: number; h: number }
  | { t: "app_frame"; ops: Array<Array<string | number>> }
  | { t: "app_close" }
  | { t: "error"; msg: string }
  | { t: "pong" };

/** 构造一个二进制音频帧：4 字节头 + PCM(s16le) 负载。 */
export function encodeAudioFrame(channel: number, pcm: Buffer, last: boolean): Buffer {
  const head = Buffer.alloc(4);
  head[0] = AUDIO_MAGIC;
  head[1] = channel;
  head[2] = last ? FLAG_LAST : 0;
  head[3] = 0;
  return Buffer.concat([head, pcm]);
}

/** 解析一个二进制音频帧。magic 不符返回 null。 */
export function decodeAudioFrame(
  buf: Buffer
): { channel: number; last: boolean; payload: Buffer } | null {
  if (buf.length < 4 || buf[0] !== AUDIO_MAGIC) return null;
  return {
    channel: buf[1],
    last: (buf[2] & FLAG_LAST) !== 0,
    payload: buf.subarray(4),
  };
}
