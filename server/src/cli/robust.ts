/** 64 个随机种子下的险胜稳健性；分 4 片并行：npx tsx robust.ts <first> <ratio> <shard> */
import { DEFAULT_CONFIG, simulate } from '../../../shared/src/engine.ts';
const [first, ratio, shard] = process.argv.slice(2).map(Number);
const values = Array.from({ length: 13 }, (_, i) => Math.max(1, Math.round(first * Math.pow(ratio, i))));
const ms: number[] = [];
for (let s = shard; s < 64; s += 4) {
  const r = simulate({ ...DEFAULT_CONFIG, values, seed: (s * 2654435761) >>> 0 });
  ms.push(r.blue.totalTime - r.red.totalTime);
}
console.log(JSON.stringify(ms));
