// HAL 实现①：CONSOLE —— 没有屏幕，所有显示都打到串口日志/标准输出。
// 用途：先把 WiFi + WSS + Claude 链路打通。要上真屏，照此实现一份 hal_xxx.c 即可
// （建议用 esp_lcd + LVGL；见 docs/HARDWARE.md）。
#include "hal.h"
#include "sdkconfig.h"
#if CONFIG_APP_HAL_CONSOLE
#include <stdio.h>
#include "esp_log.h"

static const char *TAG = "ui";

static const char *state_name(hal_ui_state_t s)
{
    switch (s) {
    case HAL_UI_BOOT:               return "启动";
    case HAL_UI_WIFI_CONNECTING:    return "连WiFi";
    case HAL_UI_BRIDGE_CONNECTING:  return "连桥接";
    case HAL_UI_READY:              return "就绪";
    case HAL_UI_LISTENING:          return "聆听";
    case HAL_UI_THINKING:           return "思考";
    case HAL_UI_TOOL:               return "工具";
    case HAL_UI_SPEAKING:           return "朗读";
    case HAL_UI_ERROR:              return "错误";
    default:                        return "?";
    }
}

void hal_init(void)
{
    ESP_LOGI(TAG, "CONSOLE HAL（无屏幕，输出到串口）");
}

void hal_display_status(hal_ui_state_t st, const char *detail)
{
    if (detail && detail[0]) ESP_LOGI(TAG, "[%s] %s", state_name(st), detail);
    else                     ESP_LOGI(TAG, "[%s]", state_name(st));
}

void hal_display_user(const char *text)
{
    ESP_LOGI(TAG, "🗣  %s", text ? text : "");
}

void hal_display_response_begin(void)
{
    printf("\n💬 ");
    fflush(stdout);
}

void hal_display_response_append(const char *text)
{
    if (text) printf("%s", text);
    fflush(stdout);
}

void hal_display_response_end(void)
{
    printf("\n");
    fflush(stdout);
}

#endif // CONFIG_APP_HAL_CONSOLE
