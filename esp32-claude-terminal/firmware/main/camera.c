#include "camera.h"
#include "sdkconfig.h"

#if CONFIG_APP_ENABLE_CAMERA

#include "net.h"
#include "esp_camera.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

static const char *TAG = "cam";
static SemaphoreHandle_t s_trig;

// GOOUUU ESP32-S3-CAM 的 OV3660 引脚（与 ESP32-S3-EYE 摄像头映射一致）。换板子改这里。
static camera_config_t make_cfg(void)
{
    camera_config_t c = {
        .pin_pwdn = -1,
        .pin_reset = 14,
        .pin_xclk = 15,
        .pin_sccb_sda = 4,
        .pin_sccb_scl = 5,
        .pin_d7 = 16, .pin_d6 = 17, .pin_d5 = 18, .pin_d4 = 12,
        .pin_d3 = 10, .pin_d2 = 8,  .pin_d1 = 9,  .pin_d0 = 11,
        .pin_vsync = 6, .pin_href = 7, .pin_pclk = 13,
        .xclk_freq_hz = 20000000,
        .ledc_timer = LEDC_TIMER_0,
        .ledc_channel = LEDC_CHANNEL_0,
        .pixel_format = PIXFORMAT_JPEG,
        .frame_size = FRAMESIZE_VGA, // 640x480；想更清晰/更省可调
        .jpeg_quality = 12,          // 数值越小越清晰、越大越省
        .fb_count = 2,
        .fb_location = CAMERA_FB_IN_PSRAM, // 需开启 PSRAM
        .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
    };
    return c;
}

static void camera_task(void *arg)
{
    for (;;) {
        xSemaphoreTake(s_trig, portMAX_DELAY);
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) {
            ESP_LOGI(TAG, "抓帧 %u 字节，上传", (unsigned)fb->len);
            net_send_image(fb->buf, fb->len);
            esp_camera_fb_return(fb);
        } else {
            ESP_LOGW(TAG, "抓帧失败");
        }
    }
}

void camera_init(void)
{
    camera_config_t c = make_cfg();
    esp_err_t e = esp_camera_init(&c);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "esp_camera_init 失败 0x%x（需开 PSRAM、查引脚）", e);
        return;
    }
    s_trig = xSemaphoreCreateBinary();
    xTaskCreate(camera_task, "cam", 4096, NULL, 5, NULL);
    ESP_LOGI(TAG, "摄像头就绪 (OV3660)");
}

void camera_request_capture(void)
{
    if (s_trig) xSemaphoreGive(s_trig);
}

#else // ===== 未启用摄像头 =====

void camera_init(void) {}
void camera_request_capture(void) {}

#endif
