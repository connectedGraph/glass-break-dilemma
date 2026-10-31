/** 三档预设在 16 个种子下的胜率、领先秒数分布与时长。npm run balance */
import { simulate, PRESETS } from '../../../shared/src/engine.ts';
for (const [id, p] of Object.entries(PRESETS)) {
  const margins: number[] = [];
  let red = 0, dur = 0;
  for (let s = 0; s < 16; s++) {
    const r = simulate({ ...p.config, seed: 1000 + s * 7919 });
    if (r.winner === 'R2') red++;
    margins.push(r.blue.totalTime - r.red.totalTime);
    dur += Math.max(r.red.totalTime, r.blue.totalTime);
  }
  margins.sort((a, b) => a - b);
  console.log(`${id.padEnd(9)} 红胜 ${String(red).padStart(2)}/16  红领先(s) min ${margins[0].toFixed(2)} 中位 ${margins[8].toFixed(2)} max ${margins[15].toFixed(2)}  时长 ${(dur / 16).toFixed(1)}s`);
}
