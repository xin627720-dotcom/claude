#pragma once
#include "sdkconfig.h"

// 固件版本（握手时上报）
#define APP_FW_VERSION "0.1.0"

#ifdef CONFIG_APP_AUDIO_SAMPLE_RATE
#define APP_AUDIO_SAMPLE_RATE CONFIG_APP_AUDIO_SAMPLE_RATE
#else
#define APP_AUDIO_SAMPLE_RATE 16000
#endif

// 麦克风每帧 20ms，平衡延迟与帧开销
#define APP_MIC_FRAME_SAMPLES (APP_AUDIO_SAMPLE_RATE / 50)
#define APP_MIC_FRAME_BYTES   (APP_MIC_FRAME_SAMPLES * 2)

// 扬声器播放环形缓冲
#define APP_TTS_RINGBUF_BYTES (32 * 1024)

// 一次录音的最长时长（防止忘记松手把内存吃光），单位秒
#define APP_MAX_UTTERANCE_SEC 30
