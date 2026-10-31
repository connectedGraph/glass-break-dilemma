/** 单局：双方破镜时刻、球数、碰撞次数、胜负、耗时。npm run sim -- [seed] */
import { DEFAULT_CONFIG, simulate } from '../../../shared/src/engine.ts';
const seed = Number(process.argv[2] ?? DEFAULT_CONFIG.seed);
const t0 = performance.now();
const r = simulate({ ...DEFAULT_CONFIG, seed });
console.log(`seed ${seed}  计算耗时 ${(performance.now() - t0).toFixed(0)}ms`);
for (const l of [r.red, r.blue]) {
  console.log(
    `${l.team.padEnd(4)} 破${l.breaks}/${DEFAULT_CONFIG.layers} 撞${String(l.hits).padStart(5)} ` +
      `终球${String(l.finalBalls).padStart(4)} 球-球碰撞${String(l.ballCollisions).padStart(7)} 用时${l.totalTime.toFixed(2)}s`,
  );
  console.log('   破镜时刻', l.tierTimes.map((t) => (t === null ? '  -  ' : t.toFixed(1).padStart(5))).join(' '));
}
console.log(`胜者 ${r.winner}  ${r.reason}`);
