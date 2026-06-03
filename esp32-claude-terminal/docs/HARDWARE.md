# 硬件与接线 —— GOOUUU ESP32-S3-CAM 套件

你的套件：**GOOUUU ESP32-S3-CAM** 主控 + **OV3660** 摄像头 + **INMP441** 麦克风 +
**MAX98357** 功放 + 喇叭 + **1.54" ST7789 240×240 SPI** 屏 + 面包板/杜邦线。
固件默认值已经按这套硬件配好了。

## ⚠️ 先说一个硬约束：摄像头和「语音+屏幕」抢引脚

这块板子的 OV3660 走 **DVP 并口**，占掉 **GPIO 4–18 共 15 个脚**：

| 摄像头信号 | GPIO | | 摄像头信号 | GPIO |
|---|---|---|---|---|
| XCLK | 15 | | D4 | 12 |
| SIOD(SDA) | 4 | | D5 | 18 |
| SIOC(SCL) | 5 | | D6 | 17 |
| D0 | 11 | | D7 | 16 |
| D1 | 9 | | VSYNC | 6 |
| D2 | 8 | | HREF | 7 |
| D3 | 10 | | PCLK | 13 |
| RESET | 14 | | PWDN | 不接 |

而 flash/PSRAM 又占了 **GPIO 26–37**。于是真正空闲、引到排针的脚只剩：
**0,1,2,3,19,20,21,43,44,45,46,47,48**（其中 19/20=USB、43/44=串口、45/46=strapping、0=BOOT）。

> 小智标准接线用的音频脚（麦 4/5/6、功放 7/15/16）**全都落在摄像头的 4–18 里**。
> 所以**摄像头 + 语音 + 屏幕三者没法同时用默认接线**。结论：
>
> - **第一阶段（推荐先做）：语音终端，不插摄像头排线。** 4–18 全空出来，用下面这套经过验证的标准接线。
> - **第二阶段：加视觉。** 需要把音频/屏幕挪到剩余空闲脚，较紧张，见文末。

---

## 第一阶段接线表（语音终端 · 不插摄像头）

固件 `menuconfig` 默认值就是这一套，照接即可。

### INMP441 麦克风 → ESP32-S3（I2S0）

| INMP441 | ESP32-S3 |
|---|---|
| VDD | 3V3 |
| GND | GND |
| L/R | GND（左声道） |
| WS  | **GPIO4** |
| SCK | **GPIO5** |
| SD  | **GPIO6** |

### MAX98357 功放 → ESP32-S3（I2S1）+ 喇叭

| MAX98357 | ESP32-S3 / 喇叭 |
|---|---|
| VIN | 5V（接 USB 的 5V，别用 3V3 带喇叭） |
| GND | GND |
| DIN | **GPIO7** |
| BCLK | **GPIO15** |
| LRC | **GPIO16** |
| GAIN | 悬空（默认 9dB） |
| SD | 悬空或接 3V3（使能） |
| +  / − | 接喇叭两端 |

### 1.54" ST7789 屏 → ESP32-S3（SPI，全用空闲脚）

| ST7789 | ESP32-S3 |
|---|---|
| GND | GND |
| VDD | 3V3 |
| SCL(SCLK) | **GPIO47** |
| SDA(MOSI) | **GPIO48** |
| RES(RST) | **GPIO1** |
| DC | **GPIO21** |
| CS | **GPIO2** |
| BLK(背光) | **GPIO3**（或直接接 3V3 常亮） |

### 按住说话(PTT)

直接用**板载 BOOT 键 = GPIO0**，无需接线。按住录音、松开发送。

> 这些值都写进了 `Kconfig` 默认；要改在 `menuconfig → Claude 终端配置` 里调。

---

## 几个要点

- **麦克风音量偏小**：INMP441 是 24-bit，数据在 32-bit 槽高位。`audio.c` 的 `mic_init()`
  注释处把槽宽改 `I2S_DATA_BIT_WIDTH_32BIT` 读 int32、右移取高 16 位即可。
- **屏幕花屏/偏色/镜像**：ST7789 各家模组差异在「反色、起始偏移、镜像」。`hal_st7789.c` 里
  已 `invert_color(true)`；若显示异常，调 `esp_lcd_panel_mirror/ swap_xy / set_gap`。
- **屏幕显示中文**：LVGL 内置字体只含 ASCII，中文会显示成方块。需要用 `lv_font_conv`
  生成一份 CJK 字体（或用 esp_lvgl_port 的字体示例），再 `lv_obj_set_style_text_font()` 设上。
  在配好字体前，**回答内容靠扬声器 TTS 朗读 + 串口打印**照样完整。
- **供电**：喇叭电流尖峰大，MAX98357 的 VIN 走 USB 5V；整机供电用质量好的 USB 口或电源。
- **PSRAM**：纯语音终端（无摄像头）不强制开 PSRAM；要加摄像头/大缓冲再在 menuconfig 开
  （这板子多为 N16R8 = **octal** PSRAM，别选成 quad，否则启动失败）。

---

## 第二阶段：加摄像头做视觉（进阶）

桥接侧已具备条件：Claude Agent SDK 的用户消息支持 **image 内容块**，所以「拍一张 → 上传桥接 →
作为图片喂给 Claude → 它能看图」这条路是通的（需要在 `bridge` 里把图片透传给 SDK，固件加一条
`image` 上行消息）。

难点在固件引脚：插上摄像头后 4–18 被占，音频和屏幕得挪到剩下的
{1,2,3,21,38,39,40,41,42,45,46,47,48} 里（还要避开 USB/串口/strapping），并把两路 I2S 合成
**一条共享 BCLK/WS 的全双工 I2S** 以省脚。能做，但属于定制布线。

**想做视觉就告诉我**，我据此重排引脚、加 `esp32-camera` 采集 + 桥接图片透传。建议先把第一阶段
语音终端跑通，再上视觉。

---

### 来源

- [GOOUUU_ESP32-S3-CAM 引脚（profharris）](https://github.com/profharris/GOOUUU_ESP32-S3-CAM)
- [小智 ESP32-S3 面包板接线教程](https://xiaozhi.me/xz-docs/docs/tutorial-basics/esp32-s3-bread-board-diy-wiring/)
- [keyes 小智 LCD1.54 套件文档](https://www.keyesrobot.cn/projects/xiaozhi/zh-cn/latest/)
