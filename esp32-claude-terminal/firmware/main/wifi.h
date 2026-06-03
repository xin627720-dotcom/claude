// WiFi station：连接 menuconfig 里配置的 SSID。连上/断开时投递 app 事件。
#pragma once

// 初始化并开始连接（需先完成 esp_netif_init + 默认 event loop）。
void wifi_start(void);
