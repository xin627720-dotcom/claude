// 硬件抽象层（仅显示）。换一块屏只需实现这一组函数（见 hal_console.c 为参考实现）。
// 音频走标准 I2S，统一在 audio.c 里处理，不放 HAL。
#pragma once

typedef enum {
    HAL_UI_BOOT,
    HAL_UI_WIFI_CONNECTING,
    HAL_UI_BRIDGE_CONNECTING,
    HAL_UI_READY,
    HAL_UI_LISTENING,
    HAL_UI_THINKING,
    HAL_UI_TOOL,
    HAL_UI_SPEAKING,
    HAL_UI_ERROR,
} hal_ui_state_t;

void hal_init(void);

// 顶部状态行（detail 可为 NULL，如工具名/错误信息）
void hal_display_status(hal_ui_state_t st, const char *detail);

// 显示“用户说的话”
void hal_display_user(const char *text);

// 一条新助手回答：begin 清屏 → append 流式追加 → end 收尾
void hal_display_response_begin(void);
void hal_display_response_append(const char *text);
void hal_display_response_end(void);
