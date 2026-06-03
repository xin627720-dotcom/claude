// 与桥接的 WebSocket 连接。支持 ws:// 与 wss://（内置 CA 校验）。
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

void net_start(void);          // 创建客户端并连接（连接信息来自 menuconfig）
bool net_is_connected(void);

void net_send_hello(void);
void net_send_prompt(const char *text);          // 文本输入
void net_send_audio_begin(int rate);
void net_send_audio_end(void);
void net_send_audio_frame(const uint8_t *pcm, size_t len, bool last); // CH_MIC 麦克风帧
void net_send_image(const uint8_t *jpeg, size_t len);                 // 整张 JPEG（CH_IMG，自动分帧）
void net_send_cancel(void);
