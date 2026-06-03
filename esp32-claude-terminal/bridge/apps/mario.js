// 示例：极简马里奥式平台跳跃。也是 Claude 写设备游戏的模板（见本目录 README.md）。
// 逻辑在主机跑，每帧产出绘制指令(ops)推给 ESP/网页渲染。
export const meta = { name: "Mario", w: 240, h: 240, fps: 30 };

const W = 240, H = 240, GROUND = 200, WORLDW = 480;
const platforms = [
  { x: 60, y: 160, w: 48, h: 8 },
  { x: 150, y: 124, w: 48, h: 8 },
  { x: 250, y: 150, w: 60, h: 8 },
  { x: 360, y: 112, w: 48, h: 8 },
];
const GOAL = { x: 444, y: GROUND - 40, w: 4, h: 40 };

export function init() {
  return { x: 16, y: GROUND - 16, vx: 0, vy: 0, onground: true, cam: 0, won: false };
}

export function update(s, input, dt) {
  if (s.won) { if (input.a || input.up) Object.assign(s, init()); return; }
  const SPEED = 120, JUMP = -270, GRAV = 950;
  s.vx = (input.right ? SPEED : 0) - (input.left ? SPEED : 0);
  if ((input.up || input.a) && s.onground) { s.vy = JUMP; s.onground = false; }
  s.vy += GRAV * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  s.onground = false;
  if (s.y >= GROUND - 16) { s.y = GROUND - 16; s.vy = 0; s.onground = true; }
  for (const p of platforms) {
    if (s.x + 12 > p.x && s.x < p.x + p.w && s.y + 16 >= p.y && s.y + 16 <= p.y + 14 && s.vy >= 0) {
      s.y = p.y - 16; s.vy = 0; s.onground = true;
    }
  }
  if (s.x < 0) s.x = 0;
  if (s.x > WORLDW - 12) s.x = WORLDW - 12;
  if (s.y > H + 40) Object.assign(s, init()); // 掉下去重来
  if (s.x + 12 > GOAL.x) s.won = true;
  s.cam = Math.max(0, Math.min(WORLDW - W, s.x - W / 2));
}

export function draw(s, g) {
  const c = Math.round(s.cam);
  g.clear(0x5c94fc);                       // 天空
  g.rect(0, GROUND, W, H - GROUND, 0x7c4a1e); // 泥土
  g.rect(0, GROUND, W, 6, 0x3aa83a);          // 草皮
  for (const p of platforms) g.rect(p.x - c, p.y, p.w, p.h, 0x9c5a2e);
  g.rect(GOAL.x - c, GOAL.y, 3, GOAL.h, 0xffffff);     // 旗杆
  g.rect(GOAL.x - c + 3, GOAL.y, 14, 9, 0xff2020);     // 旗
  const px = Math.round(s.x - c), py = Math.round(s.y);
  g.rect(px, py, 12, 10, 0xe52521);        // 身体（红）
  g.rect(px, py + 10, 12, 6, 0x2030c0);    // 裤子（蓝）
  g.text(6, 6, 0xffffff, "<- -> move   A/^ jump");
  if (s.won) g.text(78, 108, 0xffff00, "YOU WIN!");
}
