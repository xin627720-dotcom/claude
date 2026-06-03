// 应用宿主（A 路线·轻量即时加载）：动态 import 一个 Claude 写的游戏/应用模块，
// 每帧调用它的 update/draw，把"绘制指令(ops)"通过中枢推给设备渲染；按键事件回灌给它。
// 重逻辑跑在主机（Claude 擅长写、可即时改），设备端只做轻量渲染 —— 不重刷、不重启、随时换。
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

export type Op = Array<string | number>;

export interface Gfx {
  clear(color: number): void;
  rect(x: number, y: number, w: number, h: number, color: number): void;
  text(x: number, y: number, color: number, s: string): void;
}

export interface AppModule {
  meta: { name: string; w: number; h: number; fps?: number };
  init(): unknown;
  update(state: never, input: Record<string, boolean>, dt: number): void;
  draw(state: never, g: Gfx): void;
}

// 应用目录：默认用 bridge 自带的 apps/（含示例 mario）。Claude 可写新游戏到这里或用 APPS_DIR 指定。
const APPS_DIR = process.env.APPS_DIR || fileURLToPath(new URL("../apps", import.meta.url));

class Recorder implements Gfx {
  ops: Op[] = [];
  clear(c: number) { this.ops.push(["clr", c | 0]); }
  rect(x: number, y: number, w: number, h: number, c: number) {
    this.ops.push(["rect", x | 0, y | 0, w | 0, h | 0, c | 0]);
  }
  text(x: number, y: number, c: number, s: string) {
    this.ops.push(["txt", x | 0, y | 0, c | 0, String(s)]);
  }
}

export interface AppCallbacks {
  onOpen(m: { name: string; w: number; h: number }): void;
  onFrame(ops: Op[]): void;
  onClose(): void;
  onError(msg: string): void;
}

export class AppHost {
  private timer: ReturnType<typeof setInterval> | null = null;
  private mod: AppModule | null = null;
  private state: unknown;
  private input: Record<string, boolean> = {};
  private last = 0;
  running = false;
  name = "";

  constructor(private cb: AppCallbacks) {}

  async start(name: string): Promise<void> {
    this.stop();
    const file = name.endsWith(".js") || name.endsWith(".mjs") ? name : name + ".js";
    const url = pathToFileURL(resolve(APPS_DIR, file)).href + `?t=${Date.now()}`; // 加时间戳绕过模块缓存，可热更
    const mod = (await import(url)) as AppModule;
    if (!mod?.meta || !mod.init || !mod.update || !mod.draw) {
      throw new Error("应用格式不对：需导出 meta / init / update / draw");
    }
    this.mod = mod;
    this.name = mod.meta.name || name;
    this.state = mod.init();
    this.input = {};
    this.running = true;
    this.cb.onOpen({ name: this.name, w: mod.meta.w, h: mod.meta.h });
    const fps = Math.min(Math.max(mod.meta.fps || 20, 1), 30);
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), Math.round(1000 / fps));
  }

  private tick(): void {
    if (!this.mod || !this.running) return;
    const now = Date.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    try {
      this.mod.update(this.state as never, this.input, dt);
      const r = new Recorder();
      this.mod.draw(this.state as never, r);
      this.cb.onFrame(r.ops);
    } catch (e) {
      this.cb.onError(`应用运行出错: ${e instanceof Error ? e.message : String(e)}`);
      this.stop();
    }
  }

  setButton(code: string, down: boolean): void {
    this.input[code] = down;
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.running) { this.running = false; this.cb.onClose(); }
    this.mod = null;
  }
}
