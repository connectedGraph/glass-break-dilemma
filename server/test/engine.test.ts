import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_CONFIG,
  BLITZ_CONFIG,
  MARATHON_CONFIG,
  LANE,
  simulate,
  simulateWithTracks,
  createLane,
  runLane,
  judge,
  brickRect,
} from '../../shared/src/engine.ts';
import { POS_SCALE, type LaneResult } from '../../shared/src/physics.ts';

const quick = { ...DEFAULT_CONFIG, layers: 6, values: [3, 5, 8, 12, 18, 27] };

/* ── 确定性 ───────────────────────────────── */

test('同 seed 两次模拟结果逐位一致', () => {
  const a = simulate({ ...quick, seed: 12345 });
  const b = simulate({ ...quick, seed: 12345 });
  assert.deepEqual(a.red, b.red);
  assert.deepEqual(a.blue, b.blue);
});

test('录像不影响物理：带录像的结算 = 不带录像的结算', () => {
  const plain = simulate({ ...quick, seed: 99 });
  const rec = simulateWithTracks({ ...quick, seed: 99 }).result;
  assert.deepEqual(rec.red, plain.red);
  assert.deepEqual(rec.blue, plain.blue);
});

test('引擎热路径不用 Math.sin / Math.cos（跨浏览器逐位一致的前提）', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../../shared/src/engine.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/Math\.(sin|cos|tan|exp|log|pow)\(/.test(code), false);
});

/* ── 规则真的读配置 ───────────────────────── */

test('改红方倍率，红方结果必须变', () => {
  const base = simulate({ ...quick, seed: 7 });
  const slow = simulate({ ...quick, seed: 7, redMultiplier: 1.5 });
  assert.notEqual(base.red.totalTime, slow.red.totalTime);
  assert.equal(base.blue.totalTime, slow.blue.totalTime, '蓝方不该受影响');
});

test('改蓝方加成，蓝方结果必须变', () => {
  const base = simulate({ ...quick, seed: 7 });
  const fast = simulate({ ...quick, seed: 7, blueAdd: 30 });
  assert.notEqual(base.blue.totalTime, fast.blue.totalTime);
  assert.equal(base.red.totalTime, fast.red.totalTime, '红方不该受影响');
});

test('红方球数只会翻倍，蓝方只会加 15', () => {
  const r = simulate({ ...quick, seed: 5 });
  for (const b of r.red.breaksAt) assert.equal(b.ballsAfter, b.ballsBefore * 2);
  for (const b of r.blue.breaksAt) assert.equal(b.ballsAfter, b.ballsBefore + 15);
});

/* ── 球-球碰撞 ────────────────────────────── */

test('球与球之间真的在碰撞', () => {
  const r = simulate({ ...DEFAULT_CONFIG, seed: 3 });
  assert.ok(r.red.ballCollisions > 50000, `标准局红方只碰了 ${r.red.ballCollisions} 次`);
  assert.ok(r.blue.ballCollisions > 10000, `标准局蓝方只碰了 ${r.blue.ballCollisions} 次`);
});

test('关掉碰撞，结果会变（碰撞参与了物理，不是摆设）', () => {
  const on = simulate({ ...quick, seed: 3 });
  const off = simulate({ ...quick, seed: 3, ballCollisions: false });
  assert.equal(off.red.ballCollisions, 0);
  assert.notEqual(on.red.totalTime, off.red.totalTime);
});

/* ── 录像 ─────────────────────────────────── */

test('打穿的那一刻有一帧：血量归零、时间等于结算时间', () => {
  const { result, tracks } = simulateWithTracks({ ...quick, seed: 11 });
  for (const [lane, track] of [
    [result.red, tracks.red],
    [result.blue, tracks.blue],
  ] as const) {
    const f = track.frames.find((x) => x.breaks === quick.layers);
    assert.ok(f, `${lane.team} 没有打穿帧`);
    assert.equal(f.t, lane.totalTime);
    assert.equal(f.hp, 0);
  }
});

test('先打穿的一方不会定格：两边录像都录到对局结束之后', () => {
  const { tracks, duration } = simulateWithTracks({ ...quick, seed: 11 });
  assert.ok(tracks.red.frames.at(-1)!.t >= duration - 0.05);
  assert.ok(tracks.blue.frames.at(-1)!.t >= duration - 0.05);
});

test('录像里每一颗球都在通道内，且能弹到顶板附近', () => {
  const { tracks } = simulateWithTracks({ ...quick, seed: 21 });
  let minY = Infinity;
  for (const tr of [tracks.red, tracks.blue]) {
    for (const f of tr.frames) {
      for (let j = 0; j < f.count; j++) {
        const x = tr.pos[(f.offset + j) * 2] / POS_SCALE;
        const y = tr.pos[(f.offset + j) * 2 + 1] / POS_SCALE;
        assert.ok(x >= LANE.left - 0.1 && x <= LANE.right + 0.1, `x=${x}`);
        assert.ok(y >= LANE.top - 0.1 && y <= LANE.bottom + 0.1, `y=${y}`);
        minY = Math.min(minY, y);
      }
    }
  }
  assert.ok(minY - LANE.top < 20, `球最高只到距顶板 ${(minY - LANE.top).toFixed(1)}px`);
});

test('录像每帧记的是场上全部球（不抽样）', () => {
  const { tracks } = simulateWithTracks({ ...quick, seed: 21 });
  const last = tracks.red.frames.at(-1)!;
  assert.equal(last.count, Math.min(last.balls, quick.maxBalls));
});

/* ── 几何 ─────────────────────────────────── */

test('玻璃层与层之间无缝，铺到通道底', () => {
  const n = 13;
  for (let i = 1; i < n; i++) assert.equal(brickRect(i - 1, n).bottom, brickRect(i, n).top);
  assert.ok(Math.abs(brickRect(n - 1, n).bottom - LANE.bottom) < 1e-9);
});

/* ── 判胜 ─────────────────────────────────── */

const mk = (team: 'R2' | 'B15', t: number, finished = true, breaks = 13): LaneResult => ({
  team,
  breaks,
  hits: 0,
  finalBalls: 1,
  tierTimes: [],
  tierHits: [],
  totalTime: t,
  finished,
  outcome: finished ? 'allBroken' : 'timeout',
  ballHistory: [],
  breaksAt: [],
  ballCollisions: 0,
});

test('都打穿时用时短的赢', () => {
  assert.equal(judge(mk('R2', 28.5), mk('B15', 30.1)).winner, 'R2');
  assert.equal(judge(mk('R2', 31), mk('B15', 30.1)).winner, 'B15');
});

test('只有一方打穿时那一方赢', () => {
  assert.equal(judge(mk('R2', 120, false, 10), mk('B15', 50)).winner, 'B15');
});

/* ── 平衡：标准局要的是视频那种险胜 ───────── */

test('标准局：红方险胜（16 个种子全赢，领先都不超过 2 秒）', () => {
  for (let s = 0; s < 16; s++) {
    const r = simulate({ ...DEFAULT_CONFIG, seed: 1000 + s * 7919 });
    const margin = r.blue.totalTime - r.red.totalTime;
    assert.equal(r.winner, 'R2', `seed ${s} 蓝方赢了`);
    assert.ok(margin > 0 && margin < 2, `seed ${s} 领先 ${margin.toFixed(2)}s，不算险胜`);
  }
});

test('同一条血量曲线：少 3 层蓝方赢，多 3 层红方赢', () => {
  assert.equal(simulate(BLITZ_CONFIG).winner, 'B15');
  assert.equal(simulate(MARATHON_CONFIG).winner, 'R2');
});

test('超时会停下并判为未打穿', () => {
  const r = runLane(createLane('R2', { ...quick, values: [1e6, 1, 1, 1, 1, 1], timeLimit: 2 }));
  assert.equal(r.finished, false);
  assert.equal(r.outcome, 'timeout');
});
