/** 在险胜点附近细调：16 个种子，看红胜率与领先秒数的分布 */
import { DEFAULT_CONFIG, simulate } from '../../../shared/src/engine.ts';
const curve = (n: number, f: number, r: number) => Array.from({ length: n }, (_, i) => Math.max(1, Math.round(f * Math.pow(r, i))));
const [first, ratio] = process.argv.slice(2).map(Number);
const margins: number[] = [];
let red = 0, dur = 0;
for (let s = 0; s < 16; s++) {
  const r = simulate({ ...DEFAULT_CONFIG, layers: 13, values: curve(13, first, ratio), maxBalls: 512, seed: 50000 + s * 104729 });
  if (r.winner === 'R2') red++;
  margins.push(+(r.blue.totalTime - r.red.totalTime).toFixed(2));
  dur += r.red.totalTime;
}
margins.sort((a, b) => a - b);
console.log(`首层${first} ×${ratio}: 红胜 ${red}/16  领先 min ${margins[0]} 中位 ${margins[8]} max ${margins[15]}  红方均时 ${(dur / 16).toFixed(1)}s`);
