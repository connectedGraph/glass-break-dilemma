import {
  FIELD,
  LANE,
  brickRect,
  stackTop,
  type Team,
} from '@shared/index.ts';
import { PHYSICS } from '@shared/index.ts';

/**
 * 双通道渲染器。
 *
 * 布局：逻辑画布 960×960，左半是红方赛道，右半是蓝方赛道，
 * 两条赛道内部坐标完全一致（都用 LANE / brickRect），只是整体平移。
 *
 * 设计取向：不做拟物写实，做「观测仪器」——
 * 玻璃是半透明带棱的色块，球是发光的小点，破碎有碎屑但不喧闹。
 */

export interface LaneView {
  team: Team;
  /** 球数 */
  balls: number;
  /** 场上每颗球的坐标（两个平行数组，只取前 count 个） */
  bx: Float32Array;
  by: Float32Array;
  count: number;
  /** 每层当前血量 */
  hp: number[];
  maxHp: number[];
  /** 已破层数 */
  breaks: number;
  /** 刚破镜的碎屑 */
  bursts: Burst[];
  /** 数字减少时的 pop 动画：层号 → 触发时刻（秒） */
  pops: Map<number, number>;
  /** 当前渲染时刻（秒），用于算 pop 动画年龄 */
  t: number;
  /** 打穿整堆的时刻；没打穿为 null */
  finishTime: number | null;
  /** 对局结束后：这一侧是否获胜（未结束为 null） */
  won: boolean | null;
}

export interface RenderState {
  layers: number;
  red: LaneView;
  blue: LaneView;
  t: number;
  finished: boolean;
  winner: Team | 'tie' | null;
}

export interface Burst {
  x: number;
  y: number;
  tier: number;
  /** 0..1，1 表示刚生成，随时间衰减到 0 */
  life: number;
}

/** 双屏画布的逻辑尺寸 */
export const STAGE = { width: FIELD.width * 2, height: FIELD.height } as const;

/** 每队一套色：rgb 分量单独存，方便按透明度拼 rgba */
const TINTS: Record<
  Team,
  { core: string; glow: string; line: string; soft: string; rgb: string }
> = {
  R2: {
    core: '#ff5568',
    glow: 'rgba(255,77,99,0.85)',
    line: 'rgba(255,120,140,0.55)',
    soft: 'rgba(255,77,99,0.12)',
    rgb: '255,77,99',
  },
  B15: {
    core: '#5c95ff',
    glow: 'rgba(77,141,255,0.85)',
    line: 'rgba(120,170,255,0.55)',
    soft: 'rgba(77,141,255,0.12)',
    rgb: '77,141,255',
  },
};

/** 玻璃按层染色，从薄到厚 */
const GLASS_COLORS = [
  '#4e7382',
  '#3f8a8a',
  '#43855a',
  '#767f3c',
  '#96673a',
  '#9c4747',
  '#8f3d75',
  '#57419f',
  '#7449b8',
  '#9560cc',
  '#a97ade',
  '#b891e8',
];

const glassColor = (tier: number) => GLASS_COLORS[tier % GLASS_COLORS.length];

export class LaneRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private glassCanvas = document.createElement('canvas');
  private stars: { x: number; y: number; r: number; a: number }[] = [];
  /** 每队一张预渲染的球精灵（光晕 + 白芯），几百颗球也只是几百次 drawImage */
  private sprites: Record<Team, HTMLCanvasElement>;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('需要 Canvas 2D 上下文');
    this.ctx = ctx;
    this.buildStars();
    this.buildGlass();
    this.sprites = { R2: this.buildSprite('R2'), B15: this.buildSprite('B15') };
    this.resize();
  }

  private buildSprite(team: Team): HTMLCanvasElement {
    const r = PHYSICS.ballRadius;
    const S = 8; // 精灵按 8 倍分辨率画，缩放后仍然清晰
    const size = Math.ceil(r * 3.2 * 2 * S);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    const m = size / 2;
    const rgb = TINTS[team].rgb;
    const glow = g.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, `rgba(${rgb},0.55)`);
    glow.addColorStop(0.35, `rgba(${rgb},0.18)`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(m, m, r * S * 0.92, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(${rgb},0.55)`;
    g.beginPath();
    g.arc(m, m, r * S * 0.45, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.canvas.width = Math.max(Math.round(rect.width * dpr), 1);
    this.canvas.height = Math.max(Math.round(rect.height * dpr), 1);
  }

  private buildStars() {
    this.stars = Array.from({ length: 64 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.2,
      a: 0.04 + Math.random() * 0.13,
    }));
  }

  /** 预生成一张玻璃纹理，贴图平铺用 */
  private buildGlass() {
    const c = this.glassCanvas;
    c.width = 96;
    c.height = 96;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 96, 96);
    const lg = g.createLinearGradient(0, 96, 96, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.00)');
    lg.addColorStop(0.36, 'rgba(255,255,255,0.20)');
    lg.addColorStop(0.52, 'rgba(255,255,255,0.03)');
    lg.addColorStop(1, 'rgba(0,0,0,0.20)');
    g.fillStyle = lg;
    g.fillRect(0, 0, 96, 96);
    g.fillStyle = 'rgba(255,255,255,0.055)';
    for (let x = 0; x < 96; x += 11) g.fillRect(x, 0, 1, 96);
  }

  /** 逻辑坐标 → 设备像素 */
  private layout() {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scale = Math.min(cw / STAGE.width, ch / STAGE.height);
    const ox = (cw - STAGE.width * scale) / 2;
    const oy = (ch - STAGE.height * scale) / 2;
    return { scale, ox, oy, cw, ch };
  }

  draw(state: RenderState) {
    const { ctx } = this;
    const { scale, ox, oy, cw, ch } = this.layout();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06070f';
    ctx.fillRect(0, 0, cw, ch);

    for (const s of this.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#cfd6ff';
      ctx.beginPath();
      ctx.arc(s.x * cw, s.y * ch, s.r * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(scale, 0, 0, scale, ox, oy);

    this.drawLane(state.red, state.layers, 0, scale);
    this.drawLane(state.blue, state.layers, FIELD.width, scale);
    this.drawDivider();
  }

  private drawDivider() {
    const { ctx } = this;
    const x = FIELD.width;
    const g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.11)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 34, 0, 68, FIELD.height);
  }

  private drawLane(view: LaneView, layers: number, offsetX: number, scale: number) {
    const { ctx } = this;
    const tint = TINTS[view.team];

    ctx.save();
    ctx.translate(offsetX, 0);

    // 赛道底色
    const bg = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    bg.addColorStop(0, 'rgba(255,255,255,0.012)');
    bg.addColorStop(1, tint.soft);
    ctx.fillStyle = bg;
    ctx.fillRect(LANE.left - 10, 0, LANE.right - LANE.left + 20, FIELD.height);

    // 通道内部
    ctx.fillStyle = 'rgba(5,6,13,0.94)';
    ctx.fillRect(LANE.left, LANE.top, LANE.right - LANE.left, LANE.bottom - LANE.top);

    // 内壁
    ctx.strokeStyle = tint.line;
    ctx.lineWidth = 1.2 / scale;
    ctx.beginPath();
    ctx.moveTo(LANE.left, LANE.top);
    ctx.lineTo(LANE.left, LANE.bottom);
    ctx.moveTo(LANE.right, LANE.top);
    ctx.lineTo(LANE.right, LANE.bottom);
    ctx.stroke();

    // 顶部挡板
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.4 / scale;
    ctx.beginPath();
    ctx.moveTo(LANE.left, LANE.top);
    ctx.lineTo(LANE.right, LANE.top);
    ctx.stroke();

    // 外框
    ctx.strokeStyle = tint.line;
    ctx.lineWidth = 2.2 / scale;
    ctx.strokeRect(LANE.left - 5, LANE.top - 5, LANE.right - LANE.left + 10, FIELD.height - LANE.top + 2);

    // ── 玻璃 ──────────────────────────────
    for (let tier = 0; tier < layers; tier++) {
      const hp = view.hp[tier] ?? 0;
      const maxHp = view.maxHp[tier] ?? 1;
      if (hp <= 0) continue;
      const rect = brickRect(tier, layers);
      const ratio = Math.max(0, Math.min(1, hp / maxHp));

      ctx.save();
      ctx.globalAlpha = 0.62 + ratio * 0.38;
      ctx.fillStyle = glassColor(tier);
      ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.glassCanvas, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.restore();

      // 裂纹
      if (ratio < 0.99) {
        ctx.save();
        ctx.globalAlpha = (1 - ratio) * 0.45;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1 / scale;
        const seed = tier * 37 + 11;
        const cracks = Math.max(1, Math.ceil((1 - ratio) * 4));
        const w = rect.right - rect.left;
        const h = rect.bottom - rect.top;
        for (let i = 0; i < cracks; i++) {
          const sx = rect.left + (((seed * (i + 3) * 41) % 97) / 97) * w;
          ctx.beginPath();
          ctx.moveTo(sx, rect.top + 2);
          ctx.lineTo(sx + (((seed + i) % 7) - 3) * 10, rect.top + h * 0.62);
          ctx.lineTo(sx + (((seed + i * 3) % 9) - 4) * 13, rect.bottom - 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 顶部高光
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(rect.left, rect.top + 0.5);
      ctx.lineTo(rect.right, rect.top + 0.5);
      ctx.stroke();

      // 血条
      if (ratio < 0.999) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(rect.left, rect.bottom - 3, rect.right - rect.left, 3);
        ctx.fillStyle = tint.core;
        ctx.fillRect(rect.left, rect.bottom - 3, (rect.right - rect.left) * ratio, 3);
      }

      // ── 数值：每次减少都弹一下 ──────────
      // 血量每掉 1 都会刷新 pop 时间戳，所以「连着掉」时动画会被不断续上，
      // 视觉上是一段持续的高亮抖动；停止掉血的瞬间再回落。
      const popAt = view.pops.get(tier);
      const age = popAt === undefined ? Infinity : view.t - popAt;
      let size = 26;
      let lift = 0;
      let glow = 0;
      if (age >= 0 && age < 0.22) {
        const k = age / 0.22;
        // 冒头快、回落慢
        const bump = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
        size = 26 + 9 * bump;
        lift = -4 * bump;
        glow = bump;
      }

      ctx.save();
      ctx.font = `800 ${size}px "Inter", "Noto Sans SC", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cy = (rect.top + rect.bottom) / 2 + lift;
      if (glow > 0) {
        ctx.shadowColor = `rgba(255,255,255,${0.6 * glow})`;
        ctx.shadowBlur = 18 * glow;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 5;
      }
      ctx.fillStyle = glow > 0.2 ? '#ffffff' : 'rgba(255,255,255,0.95)';
      ctx.fillText(String(hp), LANE.centerX, cy);
      ctx.restore();
    }

    // ── 球群：全部画出来，不抽样 ──────────
    const { bx, by, count } = view;
    const sprite = this.sprites[view.team];
    const sz = PHYSICS.ballRadius * 3.2 * 2;
    const half = sz / 2;
    for (let i = 0; i < count; i++) {
      ctx.drawImage(sprite, bx[i] - half, by[i] - half, sz, sz);
    }

    // ── 碎屑 ──────────────────────────────
    for (const b of view.bursts) {
      if (b.life <= 0) continue;
      const life = b.life;
      const n = 18;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + b.x * 0.013;
        const dist = (1 - life) * 96 + 6;
        const px = b.x + Math.cos(ang) * dist;
        const py = b.y + Math.sin(ang) * dist * 0.5 + (1 - life) * (1 - life) * 30;
        const size = 3.2 * life + 0.6;
        ctx.globalAlpha = Math.min(1, life * 1.4) * 0.9;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : glassColor(b.tier);
        ctx.beginPath();
        ctx.moveTo(px, py - size);
        ctx.lineTo(px + size, py);
        ctx.lineTo(px, py + size);
        ctx.lineTo(px - size, py);
        ctx.closePath();
        ctx.fill();
      }
      // 中心闪光
      ctx.globalAlpha = life * 0.5;
      const flash = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 70 * (1.3 - life));
      flash.addColorStop(0, 'rgba(255,255,255,0.9)');
      flash.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 70 * (1.3 - life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── 打穿标记：先打穿的一侧不会定格，球继续弹，这里只叠一行字 ──
    if (view.finishTime !== null && view.t >= view.finishTime) {
      const cy = LANE.top + 150;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(6,7,15,0.72)';
      ctx.fillRect(LANE.left + 20, cy - 44, LANE.right - LANE.left - 40, 88);
      ctx.strokeStyle = view.won ? tint.core : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(LANE.left + 20, cy - 44, LANE.right - LANE.left - 40, 88);
      ctx.font = '800 34px "Inter", "Noto Sans SC", system-ui, sans-serif';
      ctx.fillStyle = view.won ? tint.core : '#ffffff';
      ctx.fillText(view.won === true ? 'WIN' : view.won === false ? '打穿' : '打穿', LANE.centerX, cy - 12);
      ctx.font = '600 20px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`${view.finishTime.toFixed(2)}s`, LANE.centerX, cy + 22);
      ctx.restore();
    }

    ctx.restore();

    // 底部层数指示
    this.drawScoreBar(view, layers, offsetX, scale);
  }

  /** 每条赛道底部的一排层数指示点 */
  private drawScoreBar(view: LaneView, layers: number, offsetX: number, scale: number) {
    const { ctx } = this;
    const gap = Math.min(16, (LANE.right - LANE.left - 20) / layers);
    const y = FIELD.height - 13;
    const startX = offsetX + LANE.centerX - ((layers - 1) * gap) / 2;
    const tint = TINTS[view.team];

    for (let i = 0; i < layers; i++) {
      const broken = (view.hp[i] ?? 0) <= 0;
      ctx.beginPath();
      ctx.arc(startX + i * gap, y, 3, 0, Math.PI * 2);
      if (broken) {
        ctx.fillStyle = tint.core;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
    }
  }
}
