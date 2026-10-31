/** 看球群在活动窗口里的竖直分布：多少比例的球在窗口上半部分（理想是接近一半，说明在上下弹） */
import { DEFAULT_CONFIG, simulateWithTracks, LANE, brickRect } from '../../../shared/src/engine.ts';
import { POS_SCALE } from '../../../shared/src/physics.ts';
const out = simulateWithTracks({ ...DEFAULT_CONFIG, seed: 1747533174 });
for (const [name, tr] of [['RED', out.tracks.red], ['BLUE', out.tracks.blue]] as const) {
  const row: string[] = [];
  for (const T of [5, 10, 15, 20, 25, 28]) {
    const f = tr.frames.find((x) => x.t >= T)!;
    const floor = f.breaks < DEFAULT_CONFIG.layers ? brickRect(f.breaks, DEFAULT_CONFIG.layers).top : LANE.bottom;
    const mid = (LANE.top + floor) / 2;
    let upper = 0;
    for (let j = 0; j < f.count; j++) if (tr.pos[(f.offset + j) * 2 + 1] / POS_SCALE < mid) upper++;
    row.push(`${T}s:${f.count}球 上半${((upper / Math.max(1, f.count)) * 100).toFixed(0)}%`);
  }
  console.log(name.padEnd(5), row.join('  '));
}
console.log(`红 ${out.result.red.totalTime.toFixed(2)}s  蓝 ${out.result.blue.totalTime.toFixed(2)}s`);
