import { Hono } from 'hono';
import { z } from 'zod';
import { isPresetId, today } from '../daily.ts';
import { globalAccuracy, recentVotes, statsFor } from '../db.ts';

export const stats = new Hono();

const query = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  preset: z.string().optional(),
});

/** 当天大众怎么押：红方占比 */
stats.get('/stats', (c) => {
  const q = query.parse(c.req.query());
  const day = q.day ?? today();
  const preset = q.preset ?? 'standard';
  if (!isPresetId(preset)) return c.json({ error: 'unknown_preset', preset }, 400);
  return c.json({ ...statsFor(day, preset), ...globalAccuracy() });
});

/** 最近押注流（匿名，只用于首页滚动） */
stats.get('/votes/recent', (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  return c.json({ votes: recentVotes(Number.isFinite(limit) ? limit : 20) });
});
