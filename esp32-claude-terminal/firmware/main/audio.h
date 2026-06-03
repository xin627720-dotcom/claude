// 音频：I2S 麦克风采集（按住说话）+ I2S 扬声器播放（TTS）。标准 ESP-IDF i2s_std。
// 关闭 CONFIG_APP_ENABLE_AUDIO 时全部为空实现（纯文本链路）。
#pragma once
#include <stdint.h>
#include <stddef.h>

void audio_init(void);

// 麦克风：开始/停止把 PCM 帧流式发往桥接（CH_MIC）。
void audio_capture_start(void);
void audio_capture_stop(void);

// 扬声器：一段 TTS 的开始（按 rate 配置 I2S TX 时钟）/ 写入 / 结束。
void audio_play_begin(int rate);
void audio_play_write(const uint8_t *pcm, size_t len);
void audio_play_end(void);
