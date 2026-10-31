import {
  POS_SCALE,
  type EngineConfig,
  type FrameMeta,
  type LaneResult,
  type MatchResult,
  type Track,
} from '@shared/index.ts';
import type { Burst, LaneView, RenderState } from '../render/LaneRenderer.ts';

/** Worker 返回的一局完整模拟 */
export interface SimOutput {
  ms: number;
  result: MatchResult;
  duration: number;
  tracks: { red: Track; blue: Track };
}

/**
 * 回放播放器。
 *
 * 浏览器里已经用 Worker 跑完了整局物理（和服务端同一份引擎），
 * 录像里存着每 1/30 秒**全部**球的坐标。这里只做两件事：
 * 按时间找到相邻两帧、做线性插值。拖进度条是一次查找，不需要重算。
 */
export class Playback {
  readonly layers: number;
  readonly duration: number;
  readonly result: MatchResult;
  readonly config: EngineConfig;

  private readonly red: LaneTrack;
  private readonly blue: LaneTrack;

  state = { t: 0, speed: 1, playing: false };

  constructor(sim: SimOutput) {
    this.result = sim.result;
    this.config = sim.result.config;
    this.layers = this.config.layers;
    this.duration = sim.duration;
    this.red = new LaneTrack(sim.tracks.red, sim.result.red, this.config);
    this.blue = new LaneTrack(sim.tracks.blue, sim.result.blue, this.config);
    this.seek(0);
  }

  seek(t: number) {
    const next = Math.max(0, Math.min(t, this.duration));
    // 往回拖时清空 pop 记录，否则会从「未来」的数值弹回来
    if (next < this.state.t) {
      this.red.reset();
      this.blue.reset();
    }
    this.state.t = next;
    this.red.sample(next);
    this.blue.sample(next);
  }

  advance(dtSec: number): RenderState {
    if (this.state.playing) {
      const next = this.state.t + dtSec * this.state.speed;
      if (next >= this.duration) {
        this.seek(this.duration);
        this.state.playing = false;
      } else {
        this.seek(next);
      }
    }
    return this.snapshot();
  }

  /** 当前时刻两边的球数 / 破镜数（给顶部计数用） */
  counters() {
    return {
      ballsRed: this.red.frame.balls,
      ballsBlue: this.blue.frame.balls,
      breaksRed: this.red.frame.breaks,
      breaksBlue: this.blue.frame.breaks,
    };
  }

  snapshot(): RenderState {
    const t = this.state.t;
    const over = t >= Math.max(this.result.red.totalTime, this.result.blue.totalTime);
    return {
      layers: this.layers,
      red: this.red.view('R2', t, over ? this.result.winner === 'R2' : null),
      blue: this.blue.view('B15', t, over ? this.result.winner === 'B15' : null),
      t,
      finished: over,
      winner: over ? this.result.winner : null,
    };
  }
}

class LaneTrack {
  private readonly frames: FrameMeta[];
  private readonly pos: Uint16Array;
  private readonly lane: LaneResult;
  private readonly maxHp: number[];
  private cursor = 0;

  frame: FrameMeta;
  private bx = new Float32Array(0);
  private by = new Float32Array(0);
  private count = 0;
  private hp: number[];
  private pops = new Map<number, number>();

  constructor(track: Track, lane: LaneResult, cfg: EngineConfig) {
    this.frames = track.frames;
    this.pos = track.pos;
    this.lane = lane;
    this.maxHp = cfg.values.slice(0, cfg.layers);
    this.hp = this.maxHp.slice();
    this.frame = this.frames[0];
  }

  reset() {
    this.pops.clear();
    this.hp = this.maxHp.slice();
    this.cursor = 0;
  }

  /** 找到 t 所在的帧区间并插值出每颗球的位置 */
  sample(t: number) {
    const frames = this.frames;
    let i = this.cursor;
    if (frames[i].t > t) i = 0;
    while (i + 1 < frames.length && frames[i + 1].t <= t) i++;
    this.cursor = i;

    const a = frames[i];
    const b = frames[Math.min(i + 1, frames.length - 1)];
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    // 血量 / 球数 / 破镜数取左帧：这些是离散事件，插值没有意义
    this.frame = a;

    // 球只增不减，同一个下标在相邻帧里指同一颗球；刚生成的球插值过半才画出来
    const n = b.count > a.count && k < 0.5 ? a.count : b.count;
    if (this.bx.length < n) {
      this.bx = new Float32Array(n);
      this.by = new Float32Array(n);
    }
    const pos = this.pos;
    for (let j = 0; j < n; j++) {
      const pb = (b.offset + j) * 2;
      if (j < a.count) {
        const pa = (a.offset + j) * 2;
        this.bx[j] = (pos[pa] + (pos[pb] - pos[pa]) * k) / POS_SCALE;
        this.by[j] = (pos[pa + 1] + (pos[pb + 1] - pos[pa + 1]) * k) / POS_SCALE;
      } else {
        this.bx[j] = pos[pb] / POS_SCALE;
        this.by[j] = pos[pb + 1] / POS_SCALE;
      }
    }
    this.count = n;

    // 逐层血量：已破的为 0，当前层用帧里记录的剩余血量，其余满血
    for (let tier = 0; tier < this.maxHp.length; tier++) {
      const v = tier < a.breaks ? 0 : tier === a.breaks ? a.hp : this.maxHp[tier];
      if (v < this.hp[tier]) this.pops.set(tier, t);
      this.hp[tier] = v;
    }
  }

  view(team: 'R2' | 'B15', t: number, won: boolean | null): LaneView {
    const bursts: Burst[] = [];
    for (const b of this.lane.breaksAt) {
      const age = t - b.t;
      if (age < 0 || age > 0.6) continue;
      bursts.push({ x: b.x, y: b.y, tier: b.tier, life: 1 - age / 0.6 });
    }
    return {
      team,
      balls: this.frame.balls,
      bx: this.bx,
      by: this.by,
      count: this.count,
      hp: this.hp,
      maxHp: this.maxHp,
      breaks: this.frame.breaks,
      bursts,
      pops: this.pops,
      t,
      finishTime: this.lane.finished ? this.lane.totalTime : null,
      won,
    };
  }
}
