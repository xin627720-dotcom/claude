# 让 ESP 加载/运行 Claude 做的东西

两条机制，按复杂度选：**简单的用 A（秒加载），复杂的用 B（OTA 原生）**。两者都已在仓库里。

---

## A 路线 · 脚本应用（即时加载，不重刷）

游戏/应用逻辑在**主机（bridge）**跑，每帧把"绘制指令"推给设备渲染，设备把按键发回。
**不重刷、不重启、随时换**，而且同一套画面在 **ESP 屏和手机网页上都能跑**。适合小游戏、小工具、表情/动画。

**怎么用**
1. 让 Claude 照 [`../bridge/apps/README.md`](../bridge/apps/README.md) 的小 API，把应用写成 `bridge/apps/<名字>.js`
   （或 `APPS_DIR` 指定目录）。例如："做个贪吃蛇，写到 apps/snake.js"。
2. 在任意聊天框（ESP/网页）输入 `/play <名字>`；`/stop` 退出。
3. 网页端直接可玩（方向键/空格、手机触摸按钮），ESP 端在屏上渲染同一画面。

示例：`bridge/apps/mario.js`。绘制指令很小（clear/rect/text），ESP 经 WiFi 也跟得上（建议 ≤30fps）。

> 当前 ESP 屏的应用渲染端（消费 `app_frame` 画到 ST7789）属固件待完善项；网页端已完整可玩，
> 证明这套指令流是通的，ESP 端按同样的 ops 渲染即可。

---

## B 路线 · OTA 原生固件（全性能）

复杂/重型应用：Claude 写**真正的 ESP-IDF 程序**，在你电脑上**编译成 `.bin`**，OTA 推给设备，
重启进入。性能拉满、几乎什么都能做；代价是每个应用是一整份固件、要重启、占 flash。

**前置**：你电脑装了 ESP-IDF（`idf.py` 可用）；固件分区已是双 OTA（`partitions.csv`），带回滚防砖。

**怎么用**
1. 让 Claude（Claude Code 在你电脑上）写一个独立的 ESP-IDF 应用工程（如一个原生马里奥），
   目标 `esp32s3`，分区表与本项目一致（双 OTA）。
2. 编译并把产物拷到投放目录：
   ```bash
   idf.py set-target esp32s3 && idf.py build
   cp build/<工程名>.bin  <本仓库>/bridge/firmware-bin/mario-native.bin
   ```
3. `.env` 里设 `PUBLIC_URL=https://<你的隧道>`（设备据此下载）。
4. 聊天框输入 `/ota mario-native.bin`（或 `/ota https://完整/固件.bin`）。
   设备下载 → 写入另一 OTA 分区 → 重启进入新应用。
5. 想换回语音终端：再 `/ota` 推回本项目的固件 `.bin` 即可。

**安全/防砖**：新固件首启会等 `ota_mark_valid()`（本固件在 `app_main` 里调用）；若新应用启动就崩、
没标记有效，bootloader 会**自动回滚**到上一版。给 Claude 写的原生应用建议也调用一次
`esp_ota_mark_app_valid_cancel_rollback()`。

---

## 选哪条？

| | A 脚本应用 | B OTA 原生 |
|---|---|---|
| 加载速度 | 秒级、热切换 | 编译+下载+重启 |
| 重刷固件 | 不需要 | 每个应用一份固件 |
| 性能/能力 | 受限（简单 2D） | 全性能、全硬件 |
| 主机要求 | 无 | 需 ESP-IDF 工具链 |
| 也能在手机/网页玩 | ✅ | ❌ |
| 适合 | 小游戏/小工具 | 复杂游戏/重应用 |
