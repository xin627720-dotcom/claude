#include "audio.h"
#include "sdkconfig.h"

#if CONFIG_APP_ENABLE_AUDIO

#include "app.h"
#include "net.h"
#include "app_config.h"

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/ringbuf.h"
#include "freertos/semphr.h"
#include "driver/i2s_std.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "audio";

static i2s_chan_handle_t s_rx;   // 麦克风
static i2s_chan_handle_t s_tx;   // 扬声器
static RingbufHandle_t   s_ring; // TTS 播放缓冲
static SemaphoreHandle_t s_tx_mux;
static int  s_tx_rate;
static volatile bool s_capturing;

// ---------------- I2S 初始化 ----------------
static void mic_init(void)
{
    i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    ESP_ERROR_CHECK(i2s_new_channel(&cc, NULL, &s_rx));
    i2s_std_config_t std = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(APP_AUDIO_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = CONFIG_APP_I2S_MIC_BCK,
            .ws   = CONFIG_APP_I2S_MIC_WS,
            .dout = I2S_GPIO_UNUSED,
            .din  = CONFIG_APP_I2S_MIC_DIN,
        },
    };
    ESP_ERROR_CHECK(i2s_channel_init_std_mode(s_rx, &std));
    ESP_ERROR_CHECK(i2s_channel_enable(s_rx));
    // 注意：INMP441 / ICS-43434 等 24-bit I2S 麦克风的数据位于 32-bit 槽的高位，
    // 用 16-bit 槽直接读音量会偏小。届时改 I2S_DATA_BIT_WIDTH_32BIT 读 int32，
    // 再右移取高 16 位即可。先用 16-bit 作为通用起点。
}

static void spk_init(void)
{
    i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
    ESP_ERROR_CHECK(i2s_new_channel(&cc, &s_tx, NULL));
    i2s_std_config_t std = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(APP_AUDIO_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = CONFIG_APP_I2S_SPK_BCK,
            .ws   = CONFIG_APP_I2S_SPK_WS,
            .dout = CONFIG_APP_I2S_SPK_DOUT,
            .din  = I2S_GPIO_UNUSED,
        },
    };
    ESP_ERROR_CHECK(i2s_channel_init_std_mode(s_tx, &std));
    ESP_ERROR_CHECK(i2s_channel_enable(s_tx));
    s_tx_rate = APP_AUDIO_SAMPLE_RATE;
}

// ---------------- 麦克风采集任务 ----------------
static void mic_task(void *arg)
{
    uint8_t buf[APP_MIC_FRAME_BYTES];
    int frames = 0;
    const int max_frames = APP_MAX_UTTERANCE_SEC * (APP_AUDIO_SAMPLE_RATE / APP_MIC_FRAME_SAMPLES);
    for (;;) {
        if (!s_capturing) {
            frames = 0;
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        size_t n = 0;
        if (i2s_channel_read(s_rx, buf, sizeof(buf), &n, pdMS_TO_TICKS(200)) == ESP_OK && n > 0) {
            if (s_capturing) net_send_audio_frame(buf, n, false);
        }
        if (s_capturing && ++frames >= max_frames) {
            ESP_LOGW(TAG, "录音超时，自动结束");
            audio_capture_stop();
            app_post(APP_EV_BUTTON_UP, NULL, 0); // 让 app 走结束流程
        }
    }
}

// ---------------- 扬声器播放任务 ----------------
static void spk_task(void *arg)
{
    for (;;) {
        size_t n = 0;
        void *item = xRingbufferReceiveUpTo(s_ring, &n, pdMS_TO_TICKS(100), 1024);
        if (item) {
            size_t w = 0;
            xSemaphoreTake(s_tx_mux, portMAX_DELAY);
            i2s_channel_write(s_tx, item, n, &w, pdMS_TO_TICKS(1000));
            xSemaphoreGive(s_tx_mux);
            vRingbufferReturnItem(s_ring, item);
        }
    }
}

// ---------------- 按住说话(PTT) 按钮任务 ----------------
static void ptt_task(void *arg)
{
    gpio_config_t io = {
        .pin_bit_mask = 1ULL << CONFIG_APP_PTT_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io);
    int last = 1; // 上拉，未按为高
    for (;;) {
        int lvl = gpio_get_level(CONFIG_APP_PTT_GPIO);
        if (lvl != last) {
            vTaskDelay(pdMS_TO_TICKS(20)); // 去抖
            lvl = gpio_get_level(CONFIG_APP_PTT_GPIO);
            if (lvl != last) {
                last = lvl;
                app_post(lvl == 0 ? APP_EV_BUTTON_DOWN : APP_EV_BUTTON_UP, NULL, 0);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

// ---------------- 对外接口 ----------------
void audio_init(void)
{
    s_tx_mux = xSemaphoreCreateMutex();
    s_ring = xRingbufferCreate(APP_TTS_RINGBUF_BYTES, RINGBUF_TYPE_BYTEBUF);
    mic_init();
    spk_init();
    xTaskCreate(mic_task, "mic", 4096, NULL, 6, NULL);
    xTaskCreate(spk_task, "spk", 4096, NULL, 6, NULL);
    xTaskCreate(ptt_task, "ptt", 2560, NULL, 5, NULL);
    ESP_LOGI(TAG, "音频就绪：采样率 %d，PTT=GPIO%d", APP_AUDIO_SAMPLE_RATE, CONFIG_APP_PTT_GPIO);
}

void audio_capture_start(void) { s_capturing = true; }

void audio_capture_stop(void)
{
    if (s_capturing) {
        s_capturing = false;
        net_send_audio_frame(NULL, 0, true); // 末帧（last 标记）
    }
}

void audio_play_begin(int rate)
{
    if (rate <= 0) rate = APP_AUDIO_SAMPLE_RATE;
    xSemaphoreTake(s_tx_mux, portMAX_DELAY);
    if (rate != s_tx_rate) {
        i2s_channel_disable(s_tx);
        i2s_std_clk_config_t c = I2S_STD_CLK_DEFAULT_CONFIG(rate);
        i2s_channel_reconfig_std_clock(s_tx, &c);
        i2s_channel_enable(s_tx);
        s_tx_rate = rate;
    }
    xSemaphoreGive(s_tx_mux);
}

void audio_play_write(const uint8_t *pcm, size_t len)
{
    if (s_ring && len) xRingbufferSend(s_ring, pcm, len, pdMS_TO_TICKS(100));
}

void audio_play_end(void) { /* 缓冲自然放完即可 */ }

#else // ===== CONFIG_APP_ENABLE_AUDIO 关闭：空实现 =====

void audio_init(void) {}
void audio_capture_start(void) {}
void audio_capture_stop(void) {}
void audio_play_begin(int rate) { (void)rate; }
void audio_play_write(const uint8_t *pcm, size_t len) { (void)pcm; (void)len; }
void audio_play_end(void) {}

#endif
