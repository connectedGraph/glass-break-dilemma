import { createHash } from 'node:crypto';
import { PRESETS, type EngineConfig, type PresetId } from '../../shared/src/engine.ts';

/**
 * 「每日一局」：日期 + 预设 → 确定的 seed。
 * 所有人当天看到的是同一道题，跑出来也是同一条轨迹，可以互相核对。
 */

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function isPresetId(v: unknown): v is PresetId {
  return typeof v === 'string' && v in PRESETS;
}

/** 服务器本地日期的 YYYY-MM-DD */
export function today(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 距下一天 0 点的毫秒数，前端用来做倒计时 */
export function msUntilTomorrow(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function seedFor(day: string, preset: PresetId): number {
  const h = createHash('sha256').update(`gbd:${day}:${preset}`).digest();
  return h.readUInt32BE(0) % 2_000_000_000;
}

/** 某天的完整配置：预设参数 + 当天 seed */
export function configFor(day: string, preset: PresetId): EngineConfig {
  const base = PRESETS[preset];
  return { ...base.config, seed: seedFor(day, preset) } as EngineConfig;
}

/** 暴露给前端的每日题面（不含 seed，防止前端提前算答案） */
export function publicPuzzle(day: string, preset: PresetId) {
  const p = PRESETS[preset];
  const c = p.config;
  return {
    day,
    preset,
    name: p.name,
    desc: p.desc,
    layers: c.layers,
    values: c.values.slice(0, c.layers),
    startBalls: c.startBalls,
    redMultiplier: c.redMultiplier,
    blueAdd: c.blueAdd,
    gravity: c.gravity,
    maxBalls: c.maxBalls,
    msUntilTomorrow: msUntilTomorrow(),
  };
}

export const ALL_PRESETS = PRESET_IDS.map((id) => ({
  id,
  name: PRESETS[id].name,
  desc: PRESETS[id].desc,
  layers: PRESETS[id].config.layers,
  values: PRESETS[id].config.values.slice(0, PRESETS[id].config.layers),
}));
