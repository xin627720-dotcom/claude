// HAL 实现②：ST7789 1.54寸 240x240 SPI 彩屏（GOOUUU 套件那块）。
// esp_lcd 初始化面板 + esp_lvgl_port 跑 LVGL，三块：状态行 / 你说的话 / 流式回答。
// 同时把文本打到串口，便于调试（以及未配中文字体时仍能在串口看到内容）。
//
// ⚠️ 未在硬件上编译验证。两个易变点已注释：面板色序字段名随 IDF 版本不同；中文需自备 CJK 字体。
#include "hal.h"
#include "sdkconfig.h"
#if CONFIG_APP_HAL_ST7789

#include <string.h>
#include <stdio.h>
#include "esp_log.h"
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

static const char *TAG = "ui";

#define LCD_HOST   SPI2_HOST
#define LCD_H      CONFIG_APP_LCD_H_RES
#define LCD_V      CONFIG_APP_LCD_V_RES
#define PIN_BLK    CONFIG_APP_LCD_BLK

static lv_obj_t *s_status_lbl;
static lv_obj_t *s_user_lbl;
static lv_obj_t *s_resp_lbl;
static char s_resp[1024];

static const char *state_name(hal_ui_state_t s)
{
    switch (s) {
    case HAL_UI_BOOT:              return "BOOT";
    case HAL_UI_WIFI_CONNECTING:  return "WiFi...";
    case HAL_UI_BRIDGE_CONNECTING:return "Bridge...";
    case HAL_UI_READY:            return "READY";
    case HAL_UI_LISTENING:        return "LISTENING";
    case HAL_UI_THINKING:         return "THINKING";
    case HAL_UI_TOOL:             return "TOOL";
    case HAL_UI_SPEAKING:         return "SPEAKING";
    case HAL_UI_ERROR:            return "ERROR";
    default:                      return "?";
    }
}

static void build_ui(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, lv_color_black(), 0);

    s_status_lbl = lv_label_create(scr);
    lv_obj_set_style_text_color(s_status_lbl, lv_color_hex(0x00ff88), 0);
    lv_obj_align(s_status_lbl, LV_ALIGN_TOP_LEFT, 4, 2);
    lv_label_set_text(s_status_lbl, "BOOT");

    s_user_lbl = lv_label_create(scr);
    lv_obj_set_style_text_color(s_user_lbl, lv_color_hex(0x88ccff), 0);
    lv_label_set_long_mode(s_user_lbl, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_user_lbl, LCD_H - 8);
    lv_obj_align(s_user_lbl, LV_ALIGN_TOP_LEFT, 4, 24);
    lv_label_set_text(s_user_lbl, "");

    s_resp_lbl = lv_label_create(scr);
    lv_obj_set_style_text_color(s_resp_lbl, lv_color_white(), 0);
    lv_label_set_long_mode(s_resp_lbl, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s_resp_lbl, LCD_H - 8);
    lv_obj_align(s_resp_lbl, LV_ALIGN_TOP_LEFT, 4, 56);
    lv_label_set_text(s_resp_lbl, "");
    // 中文显示：LVGL 内置 Montserrat 只含 ASCII。要显示中文，需用 lv_font_conv 生成
    // 一个 CJK 字体并 lv_obj_set_style_text_font() 设上去（见 docs/HARDWARE.md）。
}

void hal_init(void)
{
    gpio_config_t bk = {
        .pin_bit_mask = 1ULL << PIN_BLK,
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&bk);
    gpio_set_level(PIN_BLK, 0); // 初始化期间关背光

    spi_bus_config_t bus = {
        .sclk_io_num = CONFIG_APP_LCD_SCLK,
        .mosi_io_num = CONFIG_APP_LCD_MOSI,
        .miso_io_num = -1,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = LCD_H * 80 * (int)sizeof(uint16_t),
    };
    ESP_ERROR_CHECK(spi_bus_initialize(LCD_HOST, &bus, SPI_DMA_CH_AUTO));

    esp_lcd_panel_io_handle_t io = NULL;
    esp_lcd_panel_io_spi_config_t io_cfg = {
        .dc_gpio_num = CONFIG_APP_LCD_DC,
        .cs_gpio_num = CONFIG_APP_LCD_CS,
        .pclk_hz = 40 * 1000 * 1000,
        .lcd_cmd_bits = 8,
        .lcd_param_bits = 8,
        .spi_mode = 0,
        .trans_queue_depth = 10,
    };
    ESP_ERROR_CHECK(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)LCD_HOST, &io_cfg, &io));

    esp_lcd_panel_handle_t panel = NULL;
    esp_lcd_panel_dev_config_t pcfg = {
        .reset_gpio_num = CONFIG_APP_LCD_RST,
        .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB, // 老版 IDF 为 .color_space = ESP_LCD_COLOR_SPACE_RGB
        .bits_per_pixel = 16,
    };
    ESP_ERROR_CHECK(esp_lcd_new_panel_st7789(io, &pcfg, &panel));
    ESP_ERROR_CHECK(esp_lcd_panel_reset(panel));
    ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
    ESP_ERROR_CHECK(esp_lcd_panel_invert_color(panel, true)); // IPS 通常需反色
    ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(panel, true));

    lvgl_port_cfg_t pc = ESP_LVGL_PORT_INIT_CONFIG();
    ESP_ERROR_CHECK(lvgl_port_init(&pc));

    lvgl_port_display_cfg_t dc = {
        .io_handle = io,
        .panel_handle = panel,
        .buffer_size = LCD_H * 40,
        .double_buffer = true,
        .hres = LCD_H,
        .vres = LCD_V,
        .monochrome = false,
        .rotation = { .swap_xy = false, .mirror_x = false, .mirror_y = false },
    };
    lvgl_port_add_disp(&dc);

    if (lvgl_port_lock(0)) {
        build_ui();
        lvgl_port_unlock();
    }
    gpio_set_level(PIN_BLK, 1); // 开背光
    ESP_LOGI(TAG, "ST7789 %dx%d 就绪", LCD_H, LCD_V);
}

void hal_display_status(hal_ui_state_t st, const char *detail)
{
    if (detail && detail[0]) ESP_LOGI(TAG, "[%s] %s", state_name(st), detail);
    else                     ESP_LOGI(TAG, "[%s]", state_name(st));
    if (!s_status_lbl) return;
    if (lvgl_port_lock(0)) {
        if (detail && detail[0]) lv_label_set_text_fmt(s_status_lbl, "%s · %s", state_name(st), detail);
        else                     lv_label_set_text(s_status_lbl, state_name(st));
        lvgl_port_unlock();
    }
}

void hal_display_user(const char *text)
{
    ESP_LOGI(TAG, "🗣  %s", text ? text : "");
    if (!s_user_lbl) return;
    if (lvgl_port_lock(0)) {
        lv_label_set_text(s_user_lbl, text ? text : "");
        lvgl_port_unlock();
    }
}

void hal_display_response_begin(void)
{
    s_resp[0] = '\0';
    printf("\n💬 ");
    fflush(stdout);
    if (s_resp_lbl && lvgl_port_lock(0)) {
        lv_label_set_text(s_resp_lbl, "");
        lvgl_port_unlock();
    }
}

void hal_display_response_append(const char *text)
{
    if (!text) return;
    printf("%s", text);
    fflush(stdout);
    strncat(s_resp, text, sizeof(s_resp) - strlen(s_resp) - 1);
    if (s_resp_lbl && lvgl_port_lock(0)) {
        lv_label_set_text(s_resp_lbl, s_resp); // LVGL 复制字符串，安全
        lvgl_port_unlock();
    }
}

void hal_display_response_end(void)
{
    printf("\n");
    fflush(stdout);
}

#endif // CONFIG_APP_HAL_ST7789
