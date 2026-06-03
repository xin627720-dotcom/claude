// app_main：初始化系统，启动编排器 + 音频 + WiFi。
// 网络连上后由 app 状态机自动连接桥接（见 app.c 的 APP_EV_WIFI_UP）。
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_netif.h"

#include "hal.h"
#include "app.h"
#include "audio.h"
#include "wifi.h"

void app_main(void)
{
    esp_err_t r = nvs_flash_init();
    if (r == ESP_ERR_NVS_NO_FREE_PAGES || r == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        r = nvs_flash_init();
    }
    ESP_ERROR_CHECK(r);

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    hal_init();
    hal_display_status(HAL_UI_BOOT, NULL);

    app_start();    // 先建事件队列（音频按键任务会往里投递）
    audio_init();

    hal_display_status(HAL_UI_WIFI_CONNECTING, NULL);
    wifi_start();   // 联网成功 → 自动连接桥接
}
