// 设备 ↔ 桥接 协议（与 bridge/src/protocol.ts、docs/PROTOCOL.md 一致）。
#pragma once
#include <stdint.h>

#define WS_PROTOCOL_VERSION 1

// 二进制音频帧头（4 字节）
#define AUDIO_MAGIC      0xA5
#define CH_MIC           0x01  // 设备 → 桥接
#define CH_TTS           0x02  // 桥接 → 设备
#define FLAG_LAST        0x01  // flags bit0：本段最后一帧
#define AUDIO_HEADER_LEN 4

// 把 4 字节帧头写入 buf（buf 长度需 >= AUDIO_HEADER_LEN）
static inline void audio_header_write(uint8_t *buf, uint8_t channel, int last)
{
    buf[0] = AUDIO_MAGIC;
    buf[1] = channel;
    buf[2] = last ? FLAG_LAST : 0;
    buf[3] = 0;
}
