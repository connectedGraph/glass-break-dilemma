#!/usr/bin/env node
/**
 * 平衡扫参：找「红方前期被碾压、后期追上、险胜」的参数。
 *
 *   npx tsx server/src/cli/sweep.ts --shard 0/12   只跑第 0 片
 *   bash server/src/cli/sweep.sh                    12 片并行 + 汇总
 *
 * 每组参数跑 SEEDS 个种子，输出一行 JSON：红胜率、平均领先秒数（正 = 红领先）、时长。
 */
import { DEFAULT_CONFIG, simulate, type EngineConfig } from '../../../shared/src/engine.ts';

const SEEDS = 8;
const curve = (n: number, first: number, ratio: number) =>
  Array.from({ length: n }, (_, i) => Math.max(1, Math.round(first * Math.pow(ratio, i))));

const grid: { layers: number; first: number; ratio: number; maxBalls: number }[] = [];
for (const layers of [12, 13, 14])
  for (const first of [3, 4, 6, 8])
    for (const ratio of [1.55, 1.6, 1.65, 1.7, 1.75, 1.8])
      for (const maxBalls of [256, 384, 512]) grid.push({ layers, first, ratio, maxBalls });

const arg = process.argv.indexOf('--shard');
const [k, n] = arg >= 0 ? process.argv[arg + 1].split('/').map(Number) : [0, 1];

for (let i = k; i < grid.length; i += n) {
  const p = grid[i];
  let red = 0;
  let marginSum = 0;
  let durSum = 0;
  for (let s = 0; s < SEEDS; s++) {
    const cfg: EngineConfig = {
      ...DEFAULT_CONFIG,
      layers: p.layers,
      values: curve(p.layers, p.first, p.ratio),
      maxBalls: p.maxBalls,
      seed: 1000 + s * 7919,
    };
    const r = simulate(cfg);
    if (r.winner === 'R2') red++;
    marginSum += r.blue.totalTime - r.red.totalTime;
    durSum += Math.max(r.red.totalTime, r.blue.totalTime);
  }
  console.log(JSON.stringify({ ...p, redRate: red / SEEDS, margin: +(marginSum / SEEDS).toFixed(2), duration: +(durSum / SEEDS).toFixed(1) }));
}
