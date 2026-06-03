# 设备 ↔ 桥接 通信协议 v1

ESP32 固件与 Node 桥接之间用一条 **WebSocket** 连接通信。本文件是**唯一事实来源**，
固件的 `main/protocol.h` 与桥接的 `src/protocol.ts` 都按这里实现，改协议先改这里。

## 传输

- 单条 WebSocket 连接，设备做客户端，桥接做服务端，路径默认 `/agent`。
- **文本帧**：UTF-8 的 JSON 控制/数据消息（见下）。
- **二进制帧**：原始音频（麦克风上行、TTS 下行），带 4 字节帧头。

音频统一格式：**PCM、16-bit 有符号、小端、单声道、16000 Hz**。选 16k/mono 是因为它对
语音识别足够、带宽小（256 kbps）、ESP32 的 I2S 直接吞 PCM 不需要在板上解码。

## JSON 消息

每条 JSON 都是 `{"t": "<类型>", ...}`。未知字段必须忽略（向前兼容）。

### 设备 → 桥接

| `t` | 字段 | 含义 |
|---|---|---|
| `hello` | `fw`(string), `caps`(string[]) | 连接后第一条。声明固件版本与能力，如 `["audio_in","audio_out","display"]`。 |
| `prompt` | `text`(string) | 一条**文本**输入（设备本地打字，或本地已做 STT）。 |
| `audio_begin` | `rate`(int, 默认16000) | 一段语音开始；随后是若干二进制音频帧（channel=MIC）。 |
| `audio_end` | — | 语音结束。桥接此时做 STT，再喂给 Claude。 |
| `cancel` | — | 打断当前 Claude 回合。 |
| `ping` | — | 保活。桥接回 `pong`。 |

### 桥接 → 设备

| `t` | 字段 | 含义 |
|---|---|---|
| `ready` | `session`(string) | 桥接就绪/已建会话，给出 session id。 |
| `stt` | `text`(string) | 对设备上一段语音的识别结果（用于上屏确认）。 |
| `status` | `state`(string), `detail`(string?) | Claude 活动状态：`thinking` / `tool` / `idle`。`detail` 如 “编辑 main.py”“运行测试”。 |
| `delta` | `text`(string) | 助手回答的**增量**文本（逐字/逐块流式上屏）。 |
| `message` | `text`(string) | 一条**完整**助手消息（在拿不到增量时作兜底）。 |
| `tts_begin` | `rate`(int) | TTS 语音开始；随后是若干二进制音频帧（channel=TTS）。 |
| `tts_end` | — | TTS 语音结束。 |
| `result` | `session`(string), `text`(string?), `cost_usd`(number?), `duration_ms`(number?) | 一回合结束汇总。 |
| `error` | `msg`(string) | 出错。 |
| `pong` | — | 对 `ping` 的回应。 |

### 一轮语音对话的消息时序

```
设备 → hello
桥接 → ready {session}
        … 用户按下说话 …
设备 → audio_begin {rate:16000}
设备 → [二进制音频帧 × N] (channel=MIC)
设备 → audio_end
桥接 → stt {text:"帮我修一下登录的 bug"}      // 上屏：你说的话
桥接 → status {state:"thinking"}
桥接 → status {state:"tool", detail:"读取 auth.ts"}
桥接 → delta {text:"我先看一下"} → delta {text:"登录流程…"} …   // 逐字上屏
桥接 → tts_begin {rate:16000}
桥接 → [二进制音频帧 × M] (channel=TTS)        // 扬声器播放
桥接 → tts_end
桥接 → result {session, cost_usd, duration_ms}
```

## 二进制音频帧头（4 字节）

```
偏移  字段      类型    说明
0     magic     u8      固定 0xA5（用于和误发的文本帧区分/做基本校验）
1     channel   u8      0x01 = MIC（设备→桥接）, 0x02 = TTS（桥接→设备）
2     flags     u8      bit0 = 本段最后一帧；其余保留为 0
3     reserved  u8      0
4..   payload   i16[]   PCM s16le 单声道样本；样本数 = (帧长-4)/2
```

每帧建议承载 20–40 ms 音频（16k 下 = 320–640 个样本 = 644–1284 字节含头），
兼顾延迟与帧开销。`flags.bit0=1` 的帧标记一段语音/TTS 的结束，等价于随后的
`audio_end` / `tts_end`（二者都发，便于任一侧只看其中之一）。

## 约定

- **保活**：设备每 15 s 发一次 `ping`；桥接 30 s 没收到任何帧则判定掉线并清理会话。
- **重连**：设备断线后指数退避重连（1→2→4→8 s，封顶 8 s）。重连后重新 `hello`；
  桥接用 `resume` 尽量接回上一个 session（见 `docs/ARCHITECTURE.md` 会话一节）。
- **背压**：设备播放 TTS 的环形缓冲有限；桥接应按实时速率（或略快）发送 TTS 帧，避免冲垮设备。
- **打断**：设备发 `cancel` 后，桥接停止当前 Claude 回合与正在进行的 TTS。
