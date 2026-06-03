# 硬件与接线

固件默认走**通用数字 I2S 方案**（不依赖特定开发板的 BSP），即：数字麦克风 + I2S 功放 + 一个按钮，
屏幕另配。这样最通用、也最容易 `idf.py build` 通过。下面给出推荐元件、接线和引脚配置。

> 你只说了“有屏幕 + 麦克风 + 扬声器”。**如果是某块成品板（如 ESP32-S3-BOX-3），告诉我型号**，
> 我把引脚和音频编解码（ES7210/ES8311）那套按它的 BSP 配好；否则按下面的 DIY 方案接。

## 推荐元件（DIY 方案）

| 部件 | 推荐型号 | 说明 |
|---|---|---|
| 主控 | ESP32-S3（建议带 PSRAM，如 N8R8/N16R8） | wss + 音频缓冲更宽裕 |
| 数字麦克风 | INMP441 / ICS-43434（I2S） | 数字输出，无需 ADC |
| 功放 | MAX98357A（I2S Class-D） | 直推 4–8Ω 小喇叭 |
| 喇叭 | 4Ω/3W 或 8Ω | 配 MAX98357A |
| 按钮 | 板载 BOOT 键或外接轻触 | 按住说话(PTT) |
| 屏幕 | ST7789 240×240 / SSD1306 OLED | 见下「屏幕」 |

## 接线（对应 menuconfig 默认值，可改）

**麦克风 INMP441 → ESP32-S3**（I2S0 RX）

| INMP441 | ESP32-S3 | menuconfig |
|---|---|---|
| SCK (BCLK) | GPIO41 | `麦克风 I2S BCLK` |
| WS  (LRCK) | GPIO42 | `麦克风 I2S WS` |
| SD  (DOUT) | GPIO2  | `麦克风 I2S DIN` |
| L/R | GND（左声道） | — |
| VDD / GND | 3V3 / GND | — |

**功放 MAX98357A → ESP32-S3**（I2S1 TX）

| MAX98357A | ESP32-S3 | menuconfig |
|---|---|---|
| BCLK | GPIO15 | `扬声器 I2S BCLK` |
| LRC  (WS) | GPIO16 | `扬声器 I2S WS` |
| DIN  | GPIO17 | `扬声器 I2S DOUT` |
| GAIN / SD | 见下 | 增益/使能 |
| VIN / GND | 5V/3V3 / GND | — |

**按钮**：一端接 `GPIO0`（menuconfig `PTT GPIO`，默认用 BOOT 键），另一端接 GND；固件开内部上拉，按下为低。

> 这些 GPIO 是**示例**，按你的板子可用脚改。避开 strapping/flash 用脚（S3 上 GPIO26–32 接 flash/PSRAM，USB 用 19/20）。

## 麦克风位宽（重要）

INMP441/ICS-43434 是 **24-bit**，数据落在 32-bit 槽的高位。固件默认用 16-bit 槽（最简单的起点），
**音量可能偏小**。`audio.c` 的 `mic_init()` 处有注释：把槽宽改 `I2S_DATA_BIT_WIDTH_32BIT` 读 `int32`、
再右移取高 16 位，音量与信噪比会正常。

## 功放使能与音量（MAX98357A）

- **SD 脚**：拉高=开。悬空时多数模块默认开；若静音，接 3V3。
- **GAIN 脚**：决定增益（9/12/15dB 等）。先悬空（默认 9dB）够用。
- TTS 采样率由桥接 `tts_begin.rate` 决定（OpenAI 通常 24000Hz），固件会据此切 I2S TX 时钟，
  无需你固定；若你的链路要求固定采样率，改为在桥接重采样到 16000。

## 屏幕

当前显示走 `hal_console.c`（串口）。上真屏 = 照 `hal.h` 实现一份 HAL，渲染三块：
**顶部状态行**（就绪/聆听/思考/工具/朗读/错误）、**用户话**、**流式回答**。

推荐做法：
- **ST7789 / ILI9341 等 SPI 彩屏** → 用 `esp_lcd` + **LVGL**：一个 `label` 滚动显示流式回答，
  顶部一个状态 `label`。`hal_display_response_append()` 里把增量追加到文本缓冲并 `lv_label_set_text`。
- **SSD1306 OLED（I2C，便宜）** → `esp_lcd_panel_ssd1306` + LVGL/u8g2，做个极简三行 UI。

> 告诉我你的屏型号/分辨率/接口（SPI/I2C/QSPI）与引脚，我直接给你 `hal_<屏>.c`。

## 供电

- 麦克风 + 功放 + 屏会有电流尖峰，**别只靠某些板子限流的 3V3**；功放 VIN 建议接 5V（USB），喇叭电流走它。
- 电池便携：一节 18650 + 升压/充电板（如 TP4056 + MT3608）或带电源管理的 S3 板。

## 关于 ESP32-S3-BOX-3 / 其他成品板

成品板（S3-BOX-3、Korvo、T-Deck 等）通常带**音频编解码芯片**（如 ES7210 收音 + ES8311 放音），
需要先用 I2C 初始化编解码器，并用板子的 BSP 固定引脚。本固件的通用 I2S 路径不直接适配这些编解码器。
**给我具体型号**，我把 `audio.c` 的初始化换成对应 BSP（`espressif/esp-box`、`espressif/esp-bsp` 等）即可。
