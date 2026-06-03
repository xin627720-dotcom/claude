#include "net.h"
#include "app.h"
#include "audio.h"
#include "protocol.h"
#include "app_config.h"

#include <string.h>
#include <stdio.h>
#include "esp_log.h"
#include "esp_crt_bundle.h"
#include "esp_websocket_client.h"
#include "cJSON.h"

static const char *TAG = "net";
static esp_websocket_client_handle_t s_client;
static volatile bool s_connected;

static void send_text(const char *json)
{
    if (s_client && s_connected) {
        esp_websocket_client_send_text(s_client, json, strlen(json), pdMS_TO_TICKS(2000));
    }
}

void net_send_hello(void)
{
#if CONFIG_APP_ENABLE_CAMERA
    send_text("{\"t\":\"hello\",\"fw\":\"" APP_FW_VERSION
              "\",\"caps\":[\"audio_in\",\"audio_out\",\"display\",\"camera\"]}");
#else
    send_text("{\"t\":\"hello\",\"fw\":\"" APP_FW_VERSION
              "\",\"caps\":[\"audio_in\",\"audio_out\",\"display\"]}");
#endif
}

void net_send_prompt(const char *text)
{
    cJSON *o = cJSON_CreateObject();
    cJSON_AddStringToObject(o, "t", "prompt");
    cJSON_AddStringToObject(o, "text", text ? text : "");
    char *s = cJSON_PrintUnformatted(o);
    if (s) { send_text(s); cJSON_free(s); }
    cJSON_Delete(o);
}

void net_send_audio_begin(int rate)
{
    char buf[48];
    snprintf(buf, sizeof(buf), "{\"t\":\"audio_begin\",\"rate\":%d}", rate);
    send_text(buf);
}

void net_send_audio_end(void) { send_text("{\"t\":\"audio_end\"}"); }
void net_send_cancel(void)    { send_text("{\"t\":\"cancel\"}"); }

void net_send_audio_frame(const uint8_t *pcm, size_t len, bool last)
{
    if (!s_client || !s_connected) return;
    if (len > APP_MIC_FRAME_BYTES) len = APP_MIC_FRAME_BYTES;
    uint8_t buf[AUDIO_HEADER_LEN + APP_MIC_FRAME_BYTES];
    audio_header_write(buf, CH_MIC, last);
    if (len) memcpy(buf + AUDIO_HEADER_LEN, pcm, len);
    esp_websocket_client_send_bin(s_client, (const char *)buf,
                                  AUDIO_HEADER_LEN + len, pdMS_TO_TICKS(2000));
}

// 整张 JPEG 自动切成 ~1KB 的 CH_IMG 帧上传；末帧打 last 标记。
void net_send_image(const uint8_t *jpeg, size_t len)
{
    if (!s_client || !s_connected || !jpeg || len == 0) return;
    send_text("{\"t\":\"image_begin\",\"fmt\":\"jpeg\"}");
    enum { CHUNK = 1024 };
    uint8_t buf[AUDIO_HEADER_LEN + CHUNK];
    size_t off = 0;
    while (off < len) {
        size_t n = (len - off > CHUNK) ? CHUNK : (len - off);
        int last = (off + n >= len);
        audio_header_write(buf, CH_IMG, last);
        memcpy(buf + AUDIO_HEADER_LEN, jpeg + off, n);
        esp_websocket_client_send_bin(s_client, (const char *)buf,
                                      AUDIO_HEADER_LEN + n, pdMS_TO_TICKS(3000));
        off += n;
    }
    send_text("{\"t\":\"image_end\"}");
}

bool net_is_connected(void) { return s_connected; }

// ---- 收到的文本帧：解析 JSON 并转成 app 事件 ----
static void on_json(const char *data, int len)
{
    cJSON *root = cJSON_ParseWithLength(data, len);
    if (!root) return;
    const cJSON *jt = cJSON_GetObjectItemCaseSensitive(root, "t");
    if (cJSON_IsString(jt)) {
        const char *t = jt->valuestring;
        const cJSON *x;
        if (!strcmp(t, "ready")) {
            x = cJSON_GetObjectItem(root, "session");
            app_post(APP_EV_NET_READY, cJSON_IsString(x) ? x->valuestring : "", 0);
        } else if (!strcmp(t, "stt")) {
            x = cJSON_GetObjectItem(root, "text");
            app_post(APP_EV_STT, cJSON_IsString(x) ? x->valuestring : "", 0);
        } else if (!strcmp(t, "status")) {
            const cJSON *st = cJSON_GetObjectItem(root, "state");
            const cJSON *de = cJSON_GetObjectItem(root, "detail");
            const char *ss = cJSON_IsString(st) ? st->valuestring : "";
            int en = APP_STATUS_IDLE;
            if (!strcmp(ss, "thinking")) en = APP_STATUS_THINKING;
            else if (!strcmp(ss, "tool")) en = APP_STATUS_TOOL;
            app_post(APP_EV_STATUS, cJSON_IsString(de) ? de->valuestring : NULL, en);
        } else if (!strcmp(t, "delta")) {
            x = cJSON_GetObjectItem(root, "text");
            if (cJSON_IsString(x)) app_post(APP_EV_DELTA, x->valuestring, 0);
        } else if (!strcmp(t, "message")) {
            x = cJSON_GetObjectItem(root, "text");
            if (cJSON_IsString(x)) app_post(APP_EV_MESSAGE, x->valuestring, 0);
        } else if (!strcmp(t, "result")) {
            x = cJSON_GetObjectItem(root, "text");
            app_post(APP_EV_RESULT, cJSON_IsString(x) ? x->valuestring : NULL, 0);
        } else if (!strcmp(t, "error")) {
            x = cJSON_GetObjectItem(root, "msg");
            app_post(APP_EV_ERROR, cJSON_IsString(x) ? x->valuestring : "error", 0);
        } else if (!strcmp(t, "tts_begin")) {
            x = cJSON_GetObjectItem(root, "rate");
            app_post(APP_EV_TTS_BEGIN, NULL, cJSON_IsNumber(x) ? x->valueint : APP_AUDIO_SAMPLE_RATE);
        } else if (!strcmp(t, "tts_end")) {
            app_post(APP_EV_TTS_END, NULL, 0);
        }
        // "pong" 等忽略
    }
    cJSON_Delete(root);
}

static void on_data(esp_websocket_event_data_t *d)
{
    // 假设单帧不超过 buffer_size（见下方配置），故 data_ptr/data_len 即完整负载。
    if (d->op_code == 0x02) { // 二进制：音频帧
        if (d->data_len >= AUDIO_HEADER_LEN && (uint8_t)d->data_ptr[0] == AUDIO_MAGIC) {
            uint8_t ch = (uint8_t)d->data_ptr[1];
            if (ch == CH_TTS) {
                audio_play_write((const uint8_t *)d->data_ptr + AUDIO_HEADER_LEN,
                                 d->data_len - AUDIO_HEADER_LEN);
            }
        }
    } else if (d->op_code == 0x01) { // 文本：JSON
        if (d->data_len > 0) on_json(d->data_ptr, d->data_len);
    }
}

static void on_ws_event(void *arg, esp_event_base_t base, int32_t id, void *event_data)
{
    esp_websocket_event_data_t *d = (esp_websocket_event_data_t *)event_data;
    switch (id) {
    case WEBSOCKET_EVENT_CONNECTED:
        s_connected = true;
        ESP_LOGI(TAG, "已连接桥接");
        net_send_hello();
        app_post(APP_EV_NET_CONNECTED, NULL, 0);
        break;
    case WEBSOCKET_EVENT_DISCONNECTED:
        s_connected = false;
        ESP_LOGW(TAG, "桥接断开");
        app_post(APP_EV_NET_DISCONNECTED, NULL, 0);
        break;
    case WEBSOCKET_EVENT_DATA:
        on_data(d);
        break;
    case WEBSOCKET_EVENT_ERROR:
        ESP_LOGE(TAG, "websocket 错误");
        break;
    default:
        break;
    }
}

void net_start(void)
{
    if (s_client) {
        esp_websocket_client_start(s_client);
        return;
    }

    // 组装 URI：非空 token 作为 ?token= 附加（cloudflared 透传）。
    static char uri[256];
    snprintf(uri, sizeof(uri), "%s", CONFIG_APP_BRIDGE_URI);
    if (strlen(CONFIG_APP_BRIDGE_TOKEN) > 0) {
        char sep = strchr(uri, '?') ? '&' : '?';
        size_t l = strlen(uri);
        snprintf(uri + l, sizeof(uri) - l, "%ctoken=%s", sep, CONFIG_APP_BRIDGE_TOKEN);
    }
    ESP_LOGI(TAG, "连接 %s", CONFIG_APP_BRIDGE_URI);

    esp_websocket_client_config_t cfg = {
        .uri = uri,
        .buffer_size = 2048,             // 容纳单个 TTS 音频帧，避免分片
        .reconnect_timeout_ms = 2000,
        .network_timeout_ms = 10000,
        .ping_interval_sec = 15,         // WS 层保活
        .crt_bundle_attach = esp_crt_bundle_attach, // wss:// 用内置 CA；ws:// 时忽略
    };
    s_client = esp_websocket_client_init(&cfg);
    esp_websocket_register_events(s_client, WEBSOCKET_EVENT_ANY, on_ws_event, NULL);
    esp_websocket_client_start(s_client);
}
