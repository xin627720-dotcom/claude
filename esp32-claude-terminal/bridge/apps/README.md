# 设备应用 / 游戏（A 路线 · 轻量即时加载）

放在这里的 JS 模块就是"能被 ESP 加载运行的应用"。**逻辑在主机（bridge）跑**，每帧产出一串
绘制指令推给设备渲染；设备把按键事件回传。**不重刷固件、不重启、随时换**——也能直接在网页/手机上玩。

让 Claude 现做一个：对它说「做个贪吃蛇/马里奥小游戏」，让它**按本说明把模块写到这个目录**
（或 `APPS_DIR` 指定的目录），然后在任意聊天框输入 `/play <文件名>` 即可加载运行；`/stop` 退出。

## 模块格式（ES module）

```js
export const meta = { name: "名字", w: 240, h: 240, fps: 30 }; // 屏幕 240x240
export function init() { return { /* 初始状态 */ }; }
export function update(state, input, dt) { /* dt 秒；改 state */ }
export function draw(state, g) { /* 用 g 画这一帧 */ }
```

## 输入 `input`（布尔）

`left` `right` `up` `down` `a` `b` —— 网页方向键/WASD + Z(a)/X(b)/空格(跳)，ESP 用按键/摇杆映射。

## 绘图 `g`（颜色用 0xRRGGBB）

| 方法 | 说明 |
|---|---|
| `g.clear(color)` | 用某色清屏 |
| `g.rect(x, y, w, h, color)` | 实心矩形（精灵/平台/方块都用它拼） |
| `g.text(x, y, color, str)` | 8px 等宽文字（ASCII） |

> 保持每帧指令数适中（几十个以内），ESP 经 WiFi 渲染才跟得上。`fps` 建议 ≤30。
> 复杂/重型应用走 **B 路线（OTA 原生固件）**，不在这里。

参考完整示例：[`mario.js`](mario.js)。
