# 架构设计

## 拓扑（电脑在别处 + 设备随身用）

```
            你身边                          公网                         你的电脑（在别处）
 ┌───────────────────────────┐                        ┌──────────────────────────────────────┐
 │ ESP32-S3                   │                        │                                        │
 │  WiFi(路由/热点)            │                        │  cloudflared ──ws──▶ bridge(Node)      │
 │  麦克风 ─I2S─▶ 采集         │                        │                       │  STT  (语音→字) │
 │  扬声器 ◀I2S─ 播放          │   wss:// + token       │                       │  Agent SDK      │
 │  屏幕   ◀──── 显示          │ ─────────────────────▶ │  (TLS 由 CF 终止)      │   ▼             │
 │  PTT 按钮                   │ ◀───────────────────── │                       │ claude(Claude   │
 │  net: WebSocket 客户端      │   文本/状态/TTS 音频    │                       │       Code)     │
 └───────────────────────────┘                        │                       │  TTS  (字→语音) │
                                                        └──────────────────────────────────────┘
```

- 设备只做实时 IO + 联网，**不**跑 Claude Code。
- `cloudflared` 把本机 `ws://127.0.0.1:8787` 暴露成公网 `wss://…`，设备从任何网络都能连。
- TLS 由 Cloudflare 终止，所以鉴权靠 **token**（走在 wss 之内）。

## 组件职责

| 组件 | 关键文件 | 职责 |
|---|---|---|
| 固件 · 网络 | `firmware/main/net.c` | ws/wss 长连接；JSON 收发；TTS 二进制帧路由到播放；WS 层保活/自动重连 |
| 固件 · 音频 | `firmware/main/audio.c` | I2S 麦克风采集（PTT 按住说话）、扬声器播放（环形缓冲、按 TTS 采样率切时钟） |
| 固件 · 编排 | `firmware/main/app.c` | 事件队列 + 状态机：聆听 → 思考 → 工具 → 朗读 → 就绪 |
| 固件 · 显示 | `firmware/main/hal_console.c` | 显示 HAL；换屏只改这一个文件 |
| 桥接 · 服务 | `bridge/src/server.ts` | WS 服务、token 鉴权、会话编排、TTS 按句流水线 |
| 桥接 · 大脑 | `bridge/src/claude.ts` | Agent SDK 流式输入/输出驱动真正的 Claude Code |
| 桥接 · 语音 | `bridge/src/stt.ts` / `tts.ts` | 可插拔 STT/TTS（OpenAI / 本地 whisper.cpp·Piper / 关闭） |

## 数据流（一轮语音）

1. 按住 PTT → `app` 发 `audio_begin`，`audio` 把麦克风 PCM 按 20ms 帧（`CH_MIC`）流式上送。
2. 松开 → `audio_end`。桥接拼接 PCM → **STT** → 回 `stt{text}`（上屏确认）。
3. 桥接把文本喂进 `ClaudeSession`（流式输入，保持上下文）。
4. Claude 工作：`stream_event` 里的 `text_delta` → `delta{text}` 逐字回设备；工具调用 → `status{tool}`。
5. 桥接把回答**按句**切分，边到边 **TTS** → `tts_begin` + 若干 `CH_TTS` 音频帧 + `tts_end`，扬声器边收边放。
6. `result` 收尾，回到就绪。会话连续，下一句带着上下文。

## 固件线程模型（FreeRTOS）

| 任务 | 作用 | 通信 |
|---|---|---|
| `app` | 状态机，唯一改“UI/会话状态”的地方 | 消费事件队列 `s_q` |
| `mic` | 采集时读 I2S、发 `CH_MIC` 帧 | 调 `net_send_audio_frame` |
| `spk` | 从环形缓冲读 PCM、写 I2S TX | 由 `net` 写入环形缓冲 |
| `ptt` | 轮询去抖按钮 | 投递 `BUTTON_DOWN/UP` 事件 |
| ws 事件 | 收帧 → 解析 → 投递事件 / 写播放缓冲 | esp_websocket_client 内部任务 |

所有跨任务状态变更都汇聚到 `app` 任务串行处理，避免竞态。音频 PCM 不进事件队列（只传指针/写环形缓冲），避免大数据拷贝。

## 桥接会话模型

用 Agent SDK 的**流式输入**：一个 `query()` 长开，新用户语句作为异步可迭代项逐条 `yield` 进去，
同一会话累积上下文。相对“每轮 `resume` 重开”，延迟更低、控制更细（可 `interrupt` 打断）。
`includePartialMessages: true` 开 token 级流式，从 `content_block_delta`/`text_delta` 取增量。

## 安全

- **token 必设**：公网唯一的门。`openssl rand -hex 32`。
- **工作目录**：`WORKSPACE_DIR` 指向你信任的目录；`PERMISSION_MODE` 控制 Claude 能否自动改文件/跑命令。
  远端语音可驱动本机执行命令——清楚 `bypassPermissions` 的风险。
- **加固选项**：Cloudflare Access（服务令牌/mTLS）挡在隧道前；或把工作目录放进容器/沙箱。
- **隐私**：用云 STT/TTS 时语音/文本会发往第三方；可换本地 whisper.cpp + Piper 全离线。

## 实现状态（诚实版）

| 部分 | 状态 |
|---|---|
| 协议 / 整体架构 | ✅ 定稿 |
| 桥接：WS 服务、鉴权、会话编排、STT/TTS 框架、probe | ✅ 已写，`tsc` 通过；WS 链路 + 会话编排在本地验证（`ready`/`thinking` 流转正确） |
| 桥接 ↔ 真正的 Claude Code | 🟡 代码就绪并按官方 Agent SDK 写；本沙箱禁止嵌套子进程，未能现场跑通最后一步，**在你机器上可正常运行** |
| 固件：WiFi/wss/协议/音频/编排 | 🟡 按 ESP-IDF 规范写完，**未在硬件上编译验证**；标准 API，需你 `idf.py build` 并按板子微调引脚 |
| 固件：真屏 HAL | 🟡 已按 GOOUUU 套件 1.54" ST7789 写好（esp_lcd+LVGL），未在硬件上验证；中文需自备 CJK 字体 |
| 唤醒词 / 回声消除 | 🔴 未做；当前用按住说话(PTT)，最简单可靠 |
