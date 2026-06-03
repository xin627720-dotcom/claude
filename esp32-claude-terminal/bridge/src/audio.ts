// 音频工具：PCM(s16le) <-> WAV 容器互转，以及把 PCM 切成定长帧。
// 设备侧用裸 PCM；STT/TTS 的 HTTP 接口多用 WAV，故在边界处转换。

/** 给裸 PCM(s16le) 套一个 44 字节 WAV 头。 */
export function pcmToWav(pcm: Buffer, rate: number, channels = 1, bits = 16): Buffer {
  const blockAlign = channels * (bits >> 3);
  const byteRate = rate * blockAlign;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); // fmt chunk 大小
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** 从 WAV 里取出 PCM 负载和采样率。非 RIFF 时按裸 PCM@24k 处理。 */
export function wavToPcm(wav: Buffer): { pcm: Buffer; rate: number } {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF") {
    return { pcm: wav, rate: 24000 };
  }
  let rate = 24000;
  let offset = 12; // 跳过 RIFF + size + WAVE
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      rate = wav.readUInt32LE(body + 4);
    } else if (id === "data") {
      return { pcm: wav.subarray(body, body + size), rate };
    }
    offset = body + size + (size & 1); // chunk 按偶数字节对齐
  }
  return { pcm: wav.subarray(44), rate };
}

/** 把 PCM 切成每帧 samplesPerFrame 个样本（s16le → 每样本 2 字节）。 */
export function* chunkPcm(pcm: Buffer, samplesPerFrame: number): Generator<Buffer> {
  const bytesPerFrame = samplesPerFrame * 2;
  for (let i = 0; i < pcm.length; i += bytesPerFrame) {
    yield pcm.subarray(i, Math.min(i + bytesPerFrame, pcm.length));
  }
}
