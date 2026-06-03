# 按所选显示 HAL 编译对应源文件 + 拉对应依赖。
if(CONFIG_APP_HAL_ST7789)
    set(HAL_SRC "hal_st7789.c")
else()
    set(HAL_SRC "hal_console.c")
endif()

set(APP_REQUIRES
    "nvs_flash"
    "esp_wifi"
    "esp_netif"
    "esp_event"
    "esp_timer"
    "driver"
    "json"
    "esp-tls"
    "mbedtls"
    "esp_websocket_client"
    "esp_https_ota"
    "app_update"
    "esp_http_client"
)
if(CONFIG_APP_HAL_ST7789)
    list(APPEND APP_REQUIRES "esp_lcd" "esp_lvgl_port")
endif()
if(CONFIG_APP_ENABLE_CAMERA)
    list(APPEND APP_REQUIRES "esp32_camera")
endif()

idf_component_register(
    SRCS
        "main.c"
        "app.c"
        "wifi.c"
        "net.c"
        "audio.c"
        "camera.c"
        "ota.c"
        ${HAL_SRC}
    INCLUDE_DIRS "."
    REQUIRES ${APP_REQUIRES}
)
