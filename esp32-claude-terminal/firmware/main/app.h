// app：编排器。一个 FreeRTOS 任务消费事件队列，驱动显示/音频/网络的状态机。
#pragma once

typedef enum {
    APP_EV_WIFI_UP,
    APP_EV_WIFI_DOWN,
    APP_EV_NET_CONNECTED,
    APP_EV_NET_DISCONNECTED,
    APP_EV_NET_READY,       // text = session id
    APP_EV_STT,             // text = 识别出的用户语句
    APP_EV_STATUS,          // i0 = app_status_t, text = 细节(可空)
    APP_EV_DELTA,           // text = 回答增量
    APP_EV_MESSAGE,         // text = 完整回答（兜底）
    APP_EV_RESULT,          // text = 可选汇总
    APP_EV_ERROR,           // text = 错误信息
    APP_EV_TTS_BEGIN,       // i0 = 采样率
    APP_EV_TTS_END,
    APP_EV_BUTTON_DOWN,     // 按住说话：按下
    APP_EV_BUTTON_UP,       // 按住说话：松开
} app_ev_type_t;

typedef enum {
    APP_STATUS_THINKING,
    APP_STATUS_TOOL,
    APP_STATUS_IDLE,
} app_status_t;

// 启动 app 任务。
void app_start(void);

// 投递事件到 app 任务。text 会被内部复制（可为 NULL），i0 为附带整数。
// 可从任意任务/上下文（非 ISR）调用。
void app_post(app_ev_type_t type, const char *text, int i0);
