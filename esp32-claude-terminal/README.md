# ESP32-S3 ↔ Claude Code 语音终端

把一台 **ESP32-S3（屏幕 + 麦克风 + 扬声器）** 变成一个能**说话**的 Claude Code 终端：
对着它说出你的需求 → 它通过 WiFi 把音频发给一台跑着**真正的 Claude Code** 的电脑 →
Claude Code 干活（读写文件、跑命令、改代码）→ 结果**实时显示在屏幕上**，并用**扬声器念出来**。

```
   你说话                      WiFi (WebSocket)                 真正的 Claude Code
 ┌─────────┐   音频/文本    ┌──────────────────┐   prompt   ┌────────────────────┐
 │ ESP32-S3│ ─────────────▶ │   Bridge 桥接服务  │ ─────────▶ │  Claude Agent SDK   │
 │ 屏幕/麦克 │ ◀───────────── │ (Node.js, 跑在电脑) │ ◀───────── │  → claude CLI       │
 │ 风/扬声器 │   文本/语音     └──────────────────┘   流式输出   └────────────────────┘
 └─────────┘                   │  STT 语音转文字
                               │  TTS 文字转语音
```

## 为什么是这个架构？

**Claude Code 跑不在 ESP32 上。** 它是个 Node.js 程序，需要完整操作系统、文件系统、几百 MB
内存；ESP32-S3 只有几百 KB RAM。所以本项目把职责拆成两半：

| | 跑在哪 | 干什么 |
|---|---|---|
| **Firmware（固件）** | ESP32-S3 | 采集麦克风音频、显示文字、播放语音、维持与桥接的长连接。一个**联网终端**。 |
| **Bridge（桥接）** | 你的电脑 / 一台常开的主机 | 启动并驱动**真正的 Claude Code**（通过 Claude Agent SDK），做语音转文字(STT)和文字转语音(TTS)。 |

这样 ESP32 只做它擅长的（实时 IO + 联网），重活留给电脑上的 Claude Code —— 你照样能用上
Claude Code 的**全部能力**：读写你的代码仓库、跑测试、用 MCP 工具等等。

## 目录结构

```
esp32-claude-terminal/
├── README.md                 ← 你在这
├── docs/
│   ├── ARCHITECTURE.md       ← 详细设计、线程模型、数据流
│   ├── PROTOCOL.md           ← 设备 ↔ 桥接 的 WebSocket 消息协议（双方都按这个实现）
│   └── HARDWARE.md           ← 目标板子、接线、引脚表、音频编解码
├── bridge/                   ← Node.js 桥接服务（跑在电脑上）
│   ├── src/
│   │   ├── server.ts         ← WebSocket 服务 + 会话管理
│   │   ├── claude.ts         ← 用 Claude Agent SDK 驱动 Claude Code（流式）
│   │   ├── stt.ts            ← 语音转文字（可插拔：OpenAI Whisper / 本地 whisper.cpp）
│   │   ├── tts.ts            ← 文字转语音（可插拔：OpenAI TTS / 本地 Piper）
│   │   ├── protocol.ts       ← 消息类型定义（与固件 protocol.h 对应）
│   │   └── config.ts         ← 环境变量配置
│   ├── package.json
│   └── .env.example
└── firmware/                 ← ESP-IDF 工程（烧进 ESP32-S3）
    ├── main/
    │   ├── main.c            ← app_main：初始化 + 启动
    │   ├── app.c/.h          ← 编排器：状态机，串起网络/UI/音频
    │   ├── net.c/.h          ← WebSocket 客户端 + 消息收发
    │   ├── wifi.c/.h         ← WiFi station 连接
    │   ├── ui.c/.h           ← 屏幕 UI 状态机
    │   ├── audio.c/.h        ← 麦克风采集 + 扬声器播放（I2S）
    │   ├── hal.h             ← 硬件抽象层接口（屏幕/音频）
    │   ├── hal_console.c     ← HAL 实现①：纯串口日志（链路调试用）
    │   ├── hal_st7789.c      ← HAL 实现②：1.54" ST7789 240x240 彩屏（默认，GOOUUU 套件）
    │   ├── protocol.h        ← 消息类型（与 bridge protocol.ts 对应）
    │   ├── app_config.h      ← 音频参数等编译期配置
    │   ├── Kconfig.projbuild ← menuconfig 选项（WiFi、桥接地址、HAL 选择）
    │   └── idf_component.yml ← 托管组件依赖
    ├── CMakeLists.txt
    ├── sdkconfig.defaults
    └── partitions.csv
```

## 快速开始

> 建议**分两步走**：先让“电脑这端”跑起来并能驱动 Claude Code，再让“ESP32 那端”连上来。
> 固件提供了一个 **CONSOLE HAL**（纯串口、无屏幕/音频），方便你**先打通网络链路**，
> 确认能和 Claude Code 对话后，再切到 **ESP-BOX HAL** 上屏幕和语音。

### 1) 桥接服务（电脑端）

```bash
cd bridge
npm install
cp .env.example .env        # 填入：STT/TTS 提供商的 key、工作目录 WORKSPACE_DIR 等
npm run dev                 # 默认监听 ws://0.0.0.0:8787/agent
```

前置条件：这台电脑上已安装并登录 `claude` CLI（`claude --version` 能输出版本）。
桥接通过 Claude Agent SDK 调用它，所以 **Claude Code 的能力 = 这台电脑上 claude 的能力**。

不接硬件也能测：

```bash
npm run probe -- "用一句话介绍这个仓库"   # 一个命令行模拟“设备”，验证桥接↔Claude Code 链路
```

### 2) 固件（ESP32-S3 端）

```bash
cd firmware
idf.py set-target esp32s3
idf.py menuconfig          # 配置 WiFi SSID/密码、桥接地址 ws://<电脑IP>:8787/agent、选择 HAL
idf.py build flash monitor
```

详细接线与板子说明见 [`docs/HARDWARE.md`](docs/HARDWARE.md)。

## 交互流程（语音一轮）

1. 按下（或唤醒）→ 屏幕显示 “🎙 Listening…”，麦克风开始采集，PCM 音频流式上传桥接。
2. 松开 → 桥接做 **STT**，把识别文本回传，屏幕显示你说的话。
3. 桥接把文本喂给 **Claude Code**；Claude 干活时屏幕显示 “🧠 Thinking…/正在编辑 x.py…”。
4. Claude 的回答**逐字**流回设备，实时显示在屏幕上；同时桥接做 **TTS**，把语音流回设备由扬声器播放。
5. 一轮结束，回到待命。会话保持连续，下一句接着上下文聊。

## 当前状态

这是**初始脚手架**。诚实地说明各部分成熟度，见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 末尾的
“实现状态”表。简言之：

- ✅ 协议、整体架构、桥接服务（可在电脑上跑、能驱动 Claude Code）
- 🟡 固件结构完整，但**尚未在真实硬件上编译/烧录验证**（此开发环境没有 ESP-IDF 工具链）
- 🟡 ST7789 屏幕 HAL 已按 GOOUUU 套件写好（esp_lcd+LVGL），但**未在硬件上编译验证**；中文需自备 CJK 字体

## 安全说明

- 桥接驱动的是**真正的 Claude Code**，它能在 `WORKSPACE_DIR` 里读写文件、执行命令。请把
  `WORKSPACE_DIR` 指向一个你信任的工作目录，并理解 `PERMISSION_MODE` 的含义（见 `bridge/.env.example`）。
- 建议桥接只监听**局域网**，或加一个简单 token 鉴权（见 `docs/ARCHITECTURE.md` 的“安全”一节）。
- STT/TTS 若用云服务，你的语音/文本会发给对应第三方。可改用本地 whisper.cpp / Piper 全离线。
