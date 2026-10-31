import { Hono } from 'hono';
import { z } from 'zod';
import { configFor, isPresetId, publicPuzzle, today } from '../daily.ts';
import { simulate } from '../../../shared/src/engine.ts';

export const daily = new Hono();

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query = z.object({ day: daySchema.optional(), preset: z.string().optional() });

/** 当天题面：只给“题”——层数、血量、双方规则、球速；不给 seed，所以前端算不出答案 */
daily.get('/daily', (c) => {
  const q = query.parse(c.req.query());
  const day = q.day ?? today();
  const preset = q.preset ?? 'standard';
  if (!isPresetId(preset)) return c.json({ error: 'unknown_preset', preset }, 400);
  return c.json(publicPuzzle(day, preset));
});

/**
 * 揭晓：服务端跑完整模拟，返回配置（含 seed）和结算。
 * 不传轨迹——浏览器拿配置自己跑同一份引擎，再和这份结算逐位比对。
 * 客户端拿这份数据纯回放，不需要自己算物理。
 */
daily.get('/daily/reveal', (c) => {
  const q = query.parse(c.req.query());
  const day = q.day ?? today();
  const preset = q.preset ?? 'standard';
  if (!isPresetId(preset)) return c.json({ error: 'unknown_preset', preset }, 400);

  const cfg = configFor(day, preset);
  const r = simulate(cfg);
  return c.json(
    {
      day,
      preset,
      seed: cfg.seed,
      config: cfg,
      winner: r.winner,
      reason: r.reason,
      red: r.red,
      blue: r.blue,
    },
    200,
    { 'cache-control': 'public, max-age=60' },
  );
});
