/**
 * 玻璃对撞引擎 —— 纯 TypeScript 内核，不依赖 DOM、不依赖 Node。
 *
 * ── 玩法（对照原视频）──────────────────────────────
 * 一条竖直通道，上面一段空窗，下面叠着若干块玻璃，从上到下越来越厚。
 * 每颗球在「最上面那块存活玻璃」和顶板之间上下弹，
 * 每次落到玻璃上扣 1 点血；血空就碎，空窗往下延伸一层。
 *
 * 双方唯一的差别，是每破一块玻璃后**球的数量**怎么变：
 *   RED  ×2     1 → 2 → 4 → 8 → 16 → 32 …      复利
 *   BLUE +15    1 → 16 → 31 → 46 → 61 …        线性
 *
 * ── 物理 ─────────────────────────────────────────
 * 每颗球独立积分（重力、侧壁、顶板、玻璃顶面），球与球之间做真实的
 * 等质量弹性碰撞（均匀网格做宽相，逐对解算法向冲量 + 位置分离）。
 *
 * 玻璃顶面是「弹力地板」：球落上去后按当前空窗高度反弹，
 * 刚好能回到顶板附近。这是视频里那种球一直上下弹的效果；
 * 球-球碰撞损失的能量也在这里补回来，否则球会越堆越低最后趴在玻璃上。
 *
 * ── 确定性 ───────────────────────────────────────
 * 热路径只用 + − × ÷ 和 Math.sqrt（IEEE 754 规定结果唯一），
 * 角度扰动用多项式而不是 Math.sin / Math.cos（不同 JS 引擎的三角函数实现
 * 可以差最后一位，而多球物理是混沌系统，差一位最后就会差一个胜负）。
 * 所以 Node 里服务端算出的结果和任意浏览器里重算的结果逐位一致。
 */
import {
  FIELD,
  PHYSICS,
  POS_SCALE,
  type BreakEvent,
  type Brick,
  type FrameMeta,
  type LaneResult,
  type Team,
  type Track,
} from './physics.ts';

export interface EngineConfig {
  /** 玻璃层数 */
  layers: number;
  /** 每层玻璃血量，index 0 = 最上面一块 */
  values: number[];
  /** 开局球数 */
  startBalls: number;
  /** 红方每破一块的球数倍率 */
  redMultiplier: number;
  /** 蓝方每破一块的球数加成 */
  blueAdd: number;
  /** 重力加速度（像素/秒²） */
  gravity: number;
  /** 弹力地板把球送回的高度占空窗高度的比例区间 [lo, hi] */
  bounceLo: number;
  bounceHi: number;
  /** 每次落地反弹的角度扰动（弧度上限） */
  jitter: number;
  /** 通道容量：场上最多同时存在多少颗球（双方相同） */
  maxBalls: number;
  /** 是否计算球与球之间的碰撞 */
  ballCollisions: boolean;
  /** 单局时间上限（秒） */
  timeLimit: number;
  /** 固定物理步长（秒） */
  step: number;
  seed: number;
}

/**
 * 血量曲线：第 i 块（0 = 最上面）的血量 = round(first × ratioⁱ)。
 * 三档预设和实验室的默认值都从这里生成，只有这一处。
 */
export const DEFAULT_CURVE = { first: 6, ratio: 1.56 } as const;

export function valueCurve(layers: number, first: number = DEFAULT_CURVE.first, ratio: number = DEFAULT_CURVE.ratio): number[] {
  // 用连乘而不是 Math.pow：乘法结果由 IEEE 754 唯一确定，Math.pow 各引擎可以差最后一位
  const out: number[] = [];
  let v = first;
  for (let i = 0; i < layers; i++) {
    out.push(Math.max(1, Math.round(v)));
    v *= ratio;
  }
  return out;
}

/**
 * 默认「标准局」。参数由 server/src/cli/sweep.ts 扫出来：
 * 目标是视频那种效果——红方前期被碾压，后期复利追上，险胜。
 * 改任何一个参数都要重跑 `npm run balance`。
 */
export const DEFAULT_CONFIG: EngineConfig = {
  layers: 13,
  // 6 × 1.56ⁱ。64 个随机种子红方全胜，领先 0.29–1.47s，中位 0.91s——视频那种险胜
  values: valueCurve(13),
  startBalls: 1,
  redMultiplier: 2,
  blueAdd: 15,
  gravity: 2600,
  bounceLo: 0.82,
  bounceHi: 0.98,
  jitter: 0.18,
  maxBalls: 512,
  ballCollisions: true,
  timeLimit: 120,
  step: 1 / 120,
  seed: 20261031,
};

/** 同一条血量曲线，多叠 3 层：红方复利完全展开 */
export const MARATHON_CONFIG: EngineConfig = {
  ...DEFAULT_CONFIG,
  layers: 16,
  values: valueCurve(16),
  timeLimit: 180,
  seed: 7717,
};

/** 同一条血量曲线，少 3 层：红方来不及滚起来 */
export const BLITZ_CONFIG: EngineConfig = {
  ...DEFAULT_CONFIG,
  layers: 10,
  values: valueCurve(10),
  timeLimit: 60,
  seed: 4451,
};

export const PRESETS = {
  standard: { id: 'standard', name: '标准局', desc: '13 层 · 红方险胜', config: DEFAULT_CONFIG },
  marathon: { id: 'marathon', name: '马拉松', desc: '16 层 · 复利展开', config: MARATHON_CONFIG },
  blitz: { id: 'blitz', name: '闪击', desc: '10 层 · 蓝方先手', config: BLITZ_CONFIG },
} as { [k: string]: { id: string; name: string; desc: string; config: EngineConfig } };

export type PresetId = 'standard' | 'marathon' | 'blitz';

/* ───────────────────────── 几何 ───────────────────────── */

export const LANE = (() => {
  const left = (FIELD.width - FIELD.channelWidth) / 2;
  const right = left + FIELD.channelWidth;
  return {
    left,
    right,
    /** 顶板 */
    top: FIELD.launcherHeight,
    bottom: FIELD.height,
    centerX: (left + right) / 2,
  } as const;
})();

/** 开局时顶板到第一块玻璃的空窗高度 */
export const PLAY_HEIGHT = 300;

/** 玻璃堆顶（第 0 层上沿） */
export function stackTop(_layers?: number): number {
  return LANE.top + PLAY_HEIGHT;
}

/** 第 tier 层（0 = 最上面）玻璃的矩形；整堆铺满空窗以下的通道 */
export function brickRect(tier: number, layers: number) {
  const h = (LANE.bottom - stackTop()) / layers;
  const st = stackTop();
  return { left: LANE.left, right: LANE.right, top: st + tier * h, bottom: st + (tier + 1) * h };
}

/* ───────────────────────── 随机与数学 ───────────────────────── */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 小角度 cos / sin 的 5 阶多项式（|a| ≤ 0.3 时误差 < 1e-7），只用四则运算，跨引擎逐位一致 */
function cosSmall(a: number) {
  const a2 = a * a;
  return 1 - a2 / 2 + (a2 * a2) / 24;
}
function sinSmall(a: number) {
  const a2 = a * a;
  return a - (a * a2) / 6 + (a * a2 * a2) / 120;
}

export function createBricks(cfg: EngineConfig): Brick[] {
  return Array.from({ length: cfg.layers }, (_, tier) => {
    const value = cfg.values[tier] ?? (cfg.values[cfg.values.length - 1] ?? 8) * 2;
    return { id: tier, tier, value, hp: value, maxHp: value };
  });
}

export function topAlive(bricks: Brick[]): Brick | undefined {
  for (const b of bricks) if (b.hp > 0) return b;
  return undefined;
}

/* ───────────────────────── 赛道 ───────────────────────── */

export interface LaneOptions {
  /** 录像：每隔多少秒录一帧全部球坐标（只在浏览器里开） */
  frameStep?: number;
}

export class Lane {
  readonly team: Team;
  readonly cfg: EngineConfig;
  readonly bricks: Brick[];

  balls: number;
  count = 0;
  bx: Float64Array;
  by: Float64Array;
  bvx: Float64Array;
  bvy: Float64Array;

  t = 0;
  hits = 0;
  breaks = 0;
  ballCollisions = 0;
  tierTimes: (number | null)[];
  tierHits: number[];
  ballHistory: number[] = [];
  breaksAt: BreakEvent[] = [];

  /** 打穿整堆的时刻；打穿后赛道仍可继续推进（只为了画面里的球继续弹） */
  finishTime: number | null = null;
  timedOut = false;
  /** 打穿 / 超时那一刻的结算快照；之后为了画面继续推进也不会再变 */
  private frozen: LaneResult | null = null;

  /** 录像 */
  frames: FrameMeta[] = [];
  private pos: number[] = [];
  private frameStep: number;
  private nextFrame = 0;
  private nextSample = 0;

  private rnd: () => number;
  private floor: number;
  private target: Brick | undefined;

  // 宽相网格
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private cellStart: Int32Array;
  private cellItems: Int32Array;
  private cellOf: Int32Array;

  constructor(team: Team, cfg: EngineConfig, opts: LaneOptions = {}) {
    this.team = team;
    this.cfg = cfg;
    this.bricks = createBricks(cfg);
    this.balls = cfg.startBalls;
    this.tierTimes = Array.from({ length: cfg.layers }, () => null);
    this.tierHits = Array.from({ length: cfg.layers }, () => 0);
    this.rnd = mulberry32(cfg.seed + (team === 'R2' ? 0x9e37 : 0x5f21));
    this.frameStep = opts.frameStep ?? 0;

    const cap = Math.max(1, cfg.maxBalls);
    this.bx = new Float64Array(cap);
    this.by = new Float64Array(cap);
    this.bvx = new Float64Array(cap);
    this.bvy = new Float64Array(cap);

    this.cell = PHYSICS.ballRadius * 2;
    this.cols = Math.ceil((LANE.right - LANE.left) / this.cell) + 1;
    this.rows = Math.ceil((LANE.bottom - LANE.top) / this.cell) + 1;
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.cellItems = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);

    this.target = topAlive(this.bricks);
    this.floor = this.target ? brickRect(this.target.tier, cfg.layers).top : LANE.bottom;

    this.ballHistory.push(this.balls);
    if (this.frameStep > 0) this.record();
  }

  get finished(): boolean {
    return this.finishTime !== null || this.timedOut;
  }

  get maxHp(): number[] {
    return this.bricks.map((b) => b.maxHp);
  }

  /** 推进一个物理步长 */
  step(): void {
    const cfg = this.cfg;
    const dt = cfg.step;
    this.t += dt;

    if (this.finishTime === null && !this.timedOut && this.t >= cfg.timeLimit) {
      this.timedOut = true;
      this.frozen = this.snapshot();
    }

    this.spawn();
    this.integrate(dt);
    if (cfg.ballCollisions && this.count > 1) this.collide();

    if (this.t >= this.nextSample) {
      this.ballHistory.push(this.balls);
      this.nextSample += 1;
    }
    if (this.frameStep > 0 && this.t >= this.nextFrame) this.record();
  }

  /** 场上球数不足时从顶板下方补发；每步最多补 4 颗，看起来像一串串落下 */
  private spawn(): void {
    const want = Math.min(this.balls, this.cfg.maxBalls);
    if (this.count >= want) return;
    const r = PHYSICS.ballRadius;
    const span = LANE.right - LANE.left - r * 4;
    const n = Math.min(want - this.count, 4);
    for (let k = 0; k < n; k++) {
      const i = this.count++;
      this.bx[i] = LANE.left + r * 2 + this.rnd() * span;
      this.by[i] = LANE.top + r + 1 + this.rnd() * 12;
      this.bvx[i] = (this.rnd() * 2 - 1) * 180;
      this.bvy[i] = 60 + this.rnd() * 120;
    }
  }

  private integrate(dt: number): void {
    const cfg = this.cfg;
    const g = cfg.gravity;
    const r = PHYSICS.ballRadius;
    const left = LANE.left + r;
    const right = LANE.right - r;
    const top = LANE.top + r;
    const rnd = this.rnd;

    for (let i = 0; i < this.count; i++) {
      let x = this.bx[i];
      let y = this.by[i];
      let vx = this.bvx[i];
      let vy = this.bvy[i] + g * dt;
      x += vx * dt;
      y += vy * dt;

      if (x < left) {
        x = left + (left - x);
        vx = -vx;
      } else if (x > right) {
        x = right - (x - right);
        vx = -vx;
      }
      if (y < top) {
        y = top + (top - y);
        if (vy < 0) vy = -vy;
      }

      const floor = this.floor;
      if (y + r >= floor && vy > 0) {
        const impact = vy;
        y = floor - r - (y + r - floor);
        if (y < top) y = top;
        // 弹力地板：按空窗高度反弹，回到顶板附近
        const h = (floor - r - top) * (cfg.bounceLo + (cfg.bounceHi - cfg.bounceLo) * rnd());
        vy = -Math.sqrt(2 * g * (h > 1 ? h : 1));
        // 横向扰动：旋转速度向量，然后把竖直分量拉回目标值
        const a = (rnd() * 2 - 1) * cfg.jitter;
        const c = cosSmall(a);
        const s = sinSmall(a);
        const nvx = vx * c - vy * s;
        vx = nvx * 0.9;
        if (impact >= PHYSICS.minHitSpeed) this.hit(x);
      }

      this.bx[i] = x;
      this.by[i] = y;
      this.bvx[i] = vx;
      this.bvy[i] = vy;
    }
  }

  /** 球-球碰撞：均匀网格宽相 + 逐对法向冲量 */
  private collide(): void {
    const n = this.count;
    const r = PHYSICS.ballRadius;
    const d0 = r * 2;
    const d02 = d0 * d0;
    const e = PHYSICS.ballRestitution;
    const { cell, cols, rows } = this;
    const start = this.cellStart;
    const items = this.cellItems;
    const cellOf = this.cellOf;
    const bx = this.bx;
    const by = this.by;
    const vx = this.bvx;
    const vy = this.bvy;

    // 计数排序建格子
    start.fill(0);
    for (let i = 0; i < n; i++) {
      let cx = Math.floor((bx[i] - LANE.left) / cell);
      let cy = Math.floor((by[i] - LANE.top) / cell);
      if (cx < 0) cx = 0;
      else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0;
      else if (cy >= rows) cy = rows - 1;
      const c = cy * cols + cx;
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cols * rows);
    for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;

    let collisions = 0;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i];
      const cx = c % cols;
      const cy = (c - cx) / cols;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy;
        if (yy < 0 || yy >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox;
          if (xx < 0 || xx >= cols) continue;
          const cc = yy * cols + xx;
          for (let k = start[cc]; k < start[cc + 1]; k++) {
            const j = items[k];
            if (j <= i) continue;
            let dx = bx[j] - bx[i];
            let dy = by[j] - by[i];
            let dist2 = dx * dx + dy * dy;
            if (dist2 >= d02) continue;
            if (dist2 === 0) {
              // 完全重合：沿固定方向错开，保证确定性
              dx = 0.01;
              dy = 0;
              dist2 = 0.0001;
            }
            const dist = Math.sqrt(dist2);
            const nx = dx / dist;
            const ny = dy / dist;
            // 位置分离
            const push = (d0 - dist) / 2;
            bx[i] -= nx * push;
            by[i] -= ny * push;
            bx[j] += nx * push;
            by[j] += ny * push;
            // 相向运动才交换法向动量（等质量）
            const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
            if (vn < 0) {
              const imp = (-(1 + e) * vn) / 2;
              vx[i] -= imp * nx;
              vy[i] -= imp * ny;
              vx[j] += imp * nx;
              vy[j] += imp * ny;
            }
            collisions++;
          }
        }
      }
    }
    this.ballCollisions += collisions;

    // 分离可能把球推出边界或推进玻璃，夹回来
    const left = LANE.left + r;
    const right = LANE.right - r;
    const top = LANE.top + r;
    const floorY = this.floor - r;
    for (let i = 0; i < n; i++) {
      if (bx[i] < left) bx[i] = left;
      else if (bx[i] > right) bx[i] = right;
      if (by[i] < top) by[i] = top;
      else if (by[i] > floorY) by[i] = floorY;
    }
  }

  /** 一次有效撞击：扣 1 点血，碎了就按规则改球数 */
  private hit(x: number): void {
    const target = this.target;
    if (!target || this.finishTime !== null) return;
    this.hits++;
    this.tierHits[target.tier]++;
    target.hp--;
    if (target.hp > 0) return;

    const before = this.balls;
    const raw = this.team === 'R2' ? before * this.cfg.redMultiplier : before + this.cfg.blueAdd;
    this.balls = Math.min(Math.round(raw), this.cfg.maxBalls);
    this.breaks++;
    this.tierTimes[target.tier] = this.t;
    this.breaksAt.push({ t: this.t, tier: target.tier, x, y: this.floor, ballsBefore: before, ballsAfter: this.balls });

    this.target = topAlive(this.bricks);
    if (this.target) {
      this.floor = brickRect(this.target.tier, this.cfg.layers).top;
    } else {
      this.floor = LANE.bottom;
      this.finishTime = this.t;
      this.frozen = this.snapshot();
      // 打穿的那一刻必须录一帧，否则回放会停在最后一块的残血上
      if (this.frameStep > 0) this.record();
    }
  }

  private record(): void {
    const offset = this.pos.length / 2;
    for (let i = 0; i < this.count; i++) {
      this.pos.push(Math.round(this.bx[i] * POS_SCALE), Math.round(this.by[i] * POS_SCALE));
    }
    this.frames.push({
      t: this.t,
      balls: this.balls,
      breaks: this.breaks,
      hp: this.target ? this.target.hp : 0,
      offset,
      count: this.count,
    });
    this.nextFrame = this.t + this.frameStep;
  }

  track(): Track {
    return { frames: this.frames, pos: Uint16Array.from(this.pos) };
  }

  toResult(): LaneResult {
    return this.frozen ?? this.snapshot();
  }

  private snapshot(): LaneResult {
    return {
      team: this.team,
      breaks: this.breaks,
      hits: this.hits,
      finalBalls: this.balls,
      tierTimes: this.tierTimes.slice(),
      tierHits: this.tierHits.slice(),
      totalTime: this.finishTime ?? this.cfg.timeLimit,
      finished: this.finishTime !== null,
      outcome: this.finishTime !== null ? 'allBroken' : 'timeout',
      ballHistory: this.ballHistory.slice(),
      breaksAt: this.breaksAt.slice(),
      ballCollisions: this.ballCollisions,
    };
  }
}

export function createLane(team: Team, cfg: EngineConfig, opts: LaneOptions = {}): Lane {
  return new Lane(team, cfg, opts);
}

/** 一口气跑到打穿或超时 */
export function runLane(lane: Lane): LaneResult {
  while (!lane.finished) lane.step();
  return lane.toResult();
}

/* ───────────────────────── 判胜 ───────────────────────── */

export function judge(red: LaneResult, blue: LaneResult): { winner: Team | 'tie'; reason: string; margin: number } {
  if (red.finished !== blue.finished) {
    const w = red.finished ? 'R2' : 'B15';
    return { winner: w, reason: '只有一方打穿', margin: Infinity };
  }
  if (!red.finished) {
    if (red.breaks === blue.breaks) return { winner: 'tie', reason: '都没打穿，层数相同', margin: 0 };
    return {
      winner: red.breaks > blue.breaks ? 'R2' : 'B15',
      reason: `都没打穿，破镜 ${Math.max(red.breaks, blue.breaks)} : ${Math.min(red.breaks, blue.breaks)}`,
      margin: Math.abs(red.breaks - blue.breaks),
    };
  }
  const d = red.totalTime - blue.totalTime;
  if (Math.abs(d) < 1e-9) return { winner: 'tie', reason: '同一帧打穿', margin: 0 };
  return {
    winner: d < 0 ? 'R2' : 'B15',
    reason: `领先 ${Math.abs(d).toFixed(2)}s 打穿`,
    margin: Math.abs(d),
  };
}

export interface MatchResult {
  red: LaneResult;
  blue: LaneResult;
  winner: Team | 'tie';
  reason: string;
  margin: number;
  config: EngineConfig;
}

export function simulate(cfg: EngineConfig = DEFAULT_CONFIG): MatchResult {
  const red = runLane(createLane('R2', cfg));
  const blue = runLane(createLane('B15', cfg));
  return { red, blue, ...judge(red, blue), config: cfg };
}

/**
 * 带录像的完整对局（浏览器 Worker 里用）。
 * 先跑到双方都打穿，再多跑 1.5 秒让画面收尾；先打穿的一方后面球继续弹，不会定格。
 */
export function simulateWithTracks(cfg: EngineConfig, frameStep = 1 / 30) {
  const red = createLane('R2', cfg, { frameStep });
  const blue = createLane('B15', cfg, { frameStep });
  while (!(red.finished && blue.finished)) {
    red.step();
    blue.step();
  }
  const end = Math.max(red.t, blue.t) + 1.5;
  while (red.t < end) red.step();
  while (blue.t < end) blue.step();
  const r = red.toResult();
  const b = blue.toResult();
  return {
    result: { red: r, blue: b, ...judge(r, b), config: cfg } as MatchResult,
    tracks: { red: red.track(), blue: blue.track() },
    duration: end,
  };
}
