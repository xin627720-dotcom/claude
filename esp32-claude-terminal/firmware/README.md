# Firmware —— ESP32-S3 联网终端（ESP-IDF）

ESP32-S3 这端：连 WiFi → 用 `wss://` 连到你的桥接 → 按住说话把麦克风音频流上去 →
把 Claude 的回答显示出来、用扬声器念出来。

> ⚠️ **诚实说明**：本固件按 ESP-IDF 规范编写，但**尚未在真实硬件上编译/烧录验证**（开发环境
> 无 ESP-IDF 工具链）。网络与音频走的都是标准 ESP-IDF API（`esp_wifi`、`esp_websocket_client`、
> `i2s_std`、`cJSON`），但**引脚、麦克风位宽、屏幕驱动**等都与你的具体板子相关，需要你在自己机器上
> `idf.py build` 跑通并按板子微调。下面写了分两步把它点亮的路径。

## 依赖

- ESP-IDF **v5.1+**（含 esp32s3 工具链）
- 托管组件 `espressif/esp_websocket_client`（构建时自动拉取，见 `main/idf_component.yml`）

## 第一步：先打通链路（无需音频/屏幕）

目的：确认 WiFi、`wss://` 连桥接、与 Claude Code 的双向流式都通。

```bash
cd firmware
idf.py set-target esp32s3
idf.py menuconfig
#   Claude 终端配置 →
#     WiFi SSID / 密码
#     桥接 WebSocket 地址 = wss://<你的tunnel>.trycloudflare.com/agent
#     桥接鉴权 token     = 与 bridge .env 的 AUTH_TOKEN 相同
#     取消勾选「启用音频」   ← 先关掉，纯文本链路
idf.py build flash monitor
```

此时设备没有麦克风输入，但你能在串口看到：连上 WiFi → 连上桥接 → 收到 `[就绪]`。
要验证双向，可临时在代码里调用 `net_send_prompt("hello")`，或先用 `bridge` 的 `npm run probe`
确认桥接侧无误。串口会**逐字**打印 Claude 的回答（`💬 …`）。

> `wss://` 依赖内置 CA 证书包（已在 `sdkconfig.defaults` 打开）。Cloudflare 的证书在其中，无需手动配证书。

## 第二步：接上麦克风与扬声器

在 `menuconfig` 勾选「启用音频」，并按你的接线填 I2S 引脚与 PTT 按钮 GPIO：

```
Claude 终端配置 → I2S / 按键 引脚
  按住说话(PTT) 按钮 GPIO   （多数板子 BOOT 键 = 0）
  麦克风 I2S  BCLK / WS / DIN
  扬声器 I2S  BCLK / WS / DOUT
```

接线与常见模组（INMP441 数字麦、MAX98357A 功放）见 [`../docs/HARDWARE.md`](../docs/HARDWARE.md)。
**按住** PTT 按钮说话、**松开**发送；屏幕/串口显示识别文本与回答，扬声器播放 TTS。

## 第三步：上真屏

当前显示走 `hal_console.c`（串口日志）。要上屏，照 `hal.h` 实现一份 HAL（如 `hal_st7789.c`），
在 `main/CMakeLists.txt` 里换掉 `hal_console.c` 即可。推荐 `esp_lcd` + LVGL，
渲染三块：顶部状态行、用户话、流式回答。细节见 `docs/HARDWARE.md`。

## 代码结构

| 文件 | 作用 |
|---|---|
| `main.c` | 初始化，启动各任务 |
| `app.c` | 编排器：事件队列 + 状态机，串起网络/音频/显示 |
| `net.c` | WebSocket 客户端（ws/wss）、JSON 收发、TTS 音频帧路由到播放 |
| `wifi.c` | WiFi station |
| `audio.c` | I2S 麦克风采集（PTT）+ 扬声器播放（环形缓冲），可整体关闭 |
| `hal_console.c` | 显示 HAL 的参考实现（串口）。换屏就换这一个文件 |
| `protocol.h` | 与桥接一致的消息常量/帧头 |
| `Kconfig.projbuild` | menuconfig 配置项 |

## 常见坑

- **`wss` 握手失败**：多为时间/证书或 PSRAM。确认证书包已开；TLS 内存紧张时在 menuconfig 开 PSRAM（注意 quad/octal 要和模组匹配）。
- **麦克风音量很小/全是噪声**：INMP441/ICS-43434 是 24-bit，数据在 32-bit 槽高位。把 `audio.c` 的 mic 槽宽改成 32-bit 再右移取高 16 位（代码里有注释标注位置）。
- **扬声器音调不对**：TTS 采样率由桥接 `tts_begin.rate` 决定（OpenAI 通常 24000），固件会据此切 I2S TX 时钟；若你的功放固定时钟，改用桥接重采样到 16000。
