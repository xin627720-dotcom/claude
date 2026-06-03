#include "ota.h"

#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "esp_https_ota.h"
#include "esp_http_client.h"
#include "esp_ota_ops.h"
#include "esp_crt_bundle.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "ota";

static void ota_task(void *arg)
{
    char *url = (char *)arg;
    ESP_LOGW(TAG, "OTA 开始: %s", url);

    esp_http_client_config_t http = {
        .url = url,
        .crt_bundle_attach = esp_crt_bundle_attach, // https 用内置 CA；http(局域网) 时忽略
        .timeout_ms = 30000,
        .keep_alive_enable = true,
    };
    esp_https_ota_config_t cfg = { .http_config = &http };

    esp_err_t e = esp_https_ota(&cfg);
    free(url);
    if (e == ESP_OK) {
        ESP_LOGW(TAG, "OTA 成功，重启进入新固件");
        esp_restart();
    } else {
        ESP_LOGE(TAG, "OTA 失败: %s", esp_err_to_name(e));
    }
    vTaskDelete(NULL);
}

void ota_start(const char *url)
{
    if (!url || !url[0]) return;
    char *dup = strdup(url);
    if (!dup) return;
    xTaskCreate(ota_task, "ota", 8192, dup, 5, NULL);
}

void ota_mark_valid(void)
{
    const esp_partition_t *run = esp_ota_get_running_partition();
    esp_ota_img_states_t st;
    if (esp_ota_get_state_partition(run, &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY) {
        esp_ota_mark_app_valid_cancel_rollback();
        ESP_LOGI(TAG, "当前固件标记为有效（取消回滚）");
    }
}
