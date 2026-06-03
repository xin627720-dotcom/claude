#include "app.h"
#include "hal.h"
#include "net.h"
#include "audio.h"
#include "camera.h"
#include "app_config.h"

#include <string.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"

static const char *TAG = "app";

typedef struct {
    app_ev_type_t type;
    char *text;
    int i0;
} ev_t;

static QueueHandle_t s_q;
static bool s_responding;     // 当前是否正在输出一条助手回答
static char s_session[64];

void app_post(app_ev_type_t type, const char *text, int i0)
{
    ev_t e = { .type = type, .text = text ? strdup(text) : NULL, .i0 = i0 };
    if (!s_q || xQueueSend(s_q, &e, 0) != pdTRUE) {
        free(e.text); // 队列满或未就绪：丢弃，避免阻塞
    }
}

static void begin_response_if_needed(void)
{
    if (!s_responding) {
        hal_display_response_begin();
        s_responding = true;
    }
}

static void handle(ev_t *e)
{
    switch (e->type) {
    case APP_EV_WIFI_UP:
        hal_display_status(HAL_UI_BRIDGE_CONNECTING, NULL);
        net_start();
        break;
    case APP_EV_WIFI_DOWN:
        hal_display_status(HAL_UI_WIFI_CONNECTING, NULL);
        break;
    case APP_EV_NET_CONNECTED:
        break; // 等桥接发 ready
    case APP_EV_NET_DISCONNECTED:
        s_responding = false;
        hal_display_status(HAL_UI_BRIDGE_CONNECTING, NULL);
        break;
    case APP_EV_NET_READY:
        if (e->text) strncpy(s_session, e->text, sizeof(s_session) - 1);
        hal_display_status(HAL_UI_READY, NULL);
        break;
    case APP_EV_STT:
        s_responding = false;
        hal_display_user(e->text ? e->text : "");
        break;
    case APP_EV_STATUS:
        if (e->i0 == APP_STATUS_THINKING)   hal_display_status(HAL_UI_THINKING, NULL);
        else if (e->i0 == APP_STATUS_TOOL)  hal_display_status(HAL_UI_TOOL, e->text);
        else                                hal_display_status(HAL_UI_READY, NULL);
        break;
    case APP_EV_DELTA:
    case APP_EV_MESSAGE:
        begin_response_if_needed();
        hal_display_response_append(e->text ? e->text : "");
        break;
    case APP_EV_RESULT:
        if (s_responding) { hal_display_response_end(); s_responding = false; }
        hal_display_status(HAL_UI_READY, NULL);
        break;
    case APP_EV_ERROR:
        s_responding = false;
        hal_display_status(HAL_UI_ERROR, e->text);
        break;
    case APP_EV_TTS_BEGIN:
        hal_display_status(HAL_UI_SPEAKING, NULL);
        audio_play_begin(e->i0);
        break;
    case APP_EV_TTS_END:
        audio_play_end();
        break;
    case APP_EV_BUTTON_DOWN:
        if (net_is_connected()) {
            hal_display_status(HAL_UI_LISTENING, NULL);
            net_send_audio_begin(APP_AUDIO_SAMPLE_RATE);
            audio_capture_start();
            camera_request_capture(); // 顺带拍一帧随这轮提问上传（无摄像头时空操作）
        } else {
            ESP_LOGW(TAG, "未连接桥接，忽略 PTT");
        }
        break;
    case APP_EV_BUTTON_UP:
        audio_capture_stop();
        net_send_audio_end();
        hal_display_status(HAL_UI_THINKING, NULL);
        break;
    }
}

static void app_task(void *arg)
{
    ev_t e;
    for (;;) {
        if (xQueueReceive(s_q, &e, portMAX_DELAY) == pdTRUE) {
            handle(&e);
            free(e.text);
        }
    }
}

void app_start(void)
{
    s_q = xQueueCreate(24, sizeof(ev_t));
    xTaskCreate(app_task, "app", 6144, NULL, 5, NULL);
}
