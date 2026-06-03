# Bridge —— 在你电脑上驱动真正的 Claude Code

这个 Node 服务把一条 WebSocket 连接的设备（ESP32）接到**本机的 Claude Code**上：
设备发来文本/语音 → 这里做 STT、喂给 Claude Code、把逐字回答和合成语音流回设备。

```
ESP32 ──wss──▶ cloudflared ──ws──▶ 本服务 ──Agent SDK──▶ claude（Claude Code）
                (公网 TLS)        (127.0.0.1:8787)        在 WORKSPACE_DIR 里干活
```

## 前置条件

- Node ≥ 18（建议 20/22）
- 本机已安装并能用 `claude`（Claude Code）：`claude --version` 能输出版本
- `ANTHROPIC_API_KEY`（Agent SDK 用它鉴权）
- STT/TTS 凭据：默认用 OpenAI（`OPENAI_API_KEY`），也可换本地 whisper.cpp / Piper（见 `.env.example`）

## 跑起来

```bash
npm install
cp .env.example .env
#   编辑 .env：AUTH_TOKEN（必填）、ANTHROPIC_API_KEY、WORKSPACE_DIR、OPENAI_API_KEY
npm run dev
```

生成一个强 token：

```bash
openssl rand -hex 32        # 把输出填进 .env 的 AUTH_TOKEN
```

## 不接硬件先测链路

`probe` 是个命令行“假设备”，验证「桥接 ↔ Claude Code」整条链路（文本进、流式回答出）：

```bash
npm run probe -- "看看这个仓库，用一句话说它是干嘛的"
```

能看到逐字回答 + 工具状态 + 结束统计，就说明电脑这端通了。

## 暴露成公网 wss（Cloudflare Tunnel）

设备在外面要靠公网连进来。装 [`cloudflared`](https://developers.cloudflare.com/cloudflare-tunnel/downloads/) 后：

**A. 临时测试（零配置，URL 每次都变）**

```bash
cloudflared tunnel --url http://localhost:8787
#   输出一个 https://<随机>.trycloudflare.com
#   设备连：wss://<随机>.trycloudflare.com/agent?token=<你的AUTH_TOKEN>
```

**B. 固定地址（需要一个挂在 Cloudflare 的域名，长期用推荐）**

```bash
cloudflared tunnel login
cloudflared tunnel create esp32-claude
cloudflared tunnel route dns esp32-claude claude.yourdomain.com
cloudflared tunnel run --url http://localhost:8787 esp32-claude
#   设备连：wss://claude.yourdomain.com/agent?token=<你的AUTH_TOKEN>
```

> Cloudflare 默认支持 WebSocket，无需额外开关。TLS 由 Cloudflare 终止，所以本服务自身只跑明文
> `ws://127.0.0.1:8787` 即可——**但正因为它将经公网到达，`AUTH_TOKEN` 必须设置**。

把上面的 `wss://.../agent?token=...` 填进固件 `menuconfig` 的 Bridge URL（见 `../firmware`）。

## 配置项

全部在 `.env`（含中文注释见 `.env.example`）。要点：

| 变量 | 作用 |
|---|---|
| `AUTH_TOKEN` | 设备鉴权 token。**公网必填**。 |
| `WORKSPACE_DIR` | Claude Code 的工作目录（它在这里读写文件、跑命令）。 |
| `PERMISSION_MODE` | `acceptEdits`（推荐，自动批准改文件）/ `bypassPermissions`（全自动，慎用）/ `default`（每步问，但设备端没法交互批准）/ `plan`（只读）。 |
| `STT_PROVIDER` / `TTS_PROVIDER` | `openai`（默认）、本地 `whispercpp`/`piper`、或 `none`（关掉语音，纯文本）。 |

## 安全

- 一定设 `AUTH_TOKEN`；它走在 TLS(wss) 之内，但仍是“唯一的门”，越长越好。
- `WORKSPACE_DIR` 指向**你信任**的目录；`bypassPermissions` 等于让远端语音可驱动本机执行命令，务必清楚风险。
- 想再加固：用 Cloudflare Access（服务令牌/mTLS）挡在隧道前；或把 `WORKSPACE_DIR` 放进容器/沙箱。

## 实现说明

- `claude.ts` 用 Agent SDK 的**流式输入**保持一个长会话，逐字（`stream_event`/`text_delta`）输出。
- `server.ts` 把助手文本**按句**切开、边到边合成 TTS 下发，让扬声器尽早出声，而不是等整段说完。
- 协议见 [`../docs/PROTOCOL.md`](../docs/PROTOCOL.md)，与固件 `protocol.h` 一致。
