import { Hono } from 'hono';
import { z } from 'zod';
import { DEFAULT_CONFIG, simulate, type EngineConfig } from '../../../shared/src/engine.ts';

export const simulateRoute = new Hono();

const configSchema = z.object({
  layers: z.number().int().min(3).max(24),
  values: z.array(z.number().min(1).max(1e9)).min(1).max(24),
  startBalls: z.number().min(1).max(64).default(1),
  redMultiplier: z.number().min(1.1).max(4).default(2),
  blueAdd: z.number().min(1).max(200).default(15),
  gravity: z.number().min(200).max(8000).default(DEFAULT_CONFIG.gravity),
  bounceLo: z.number().min(0.1).max(1).default(DEFAULT_CONFIG.bounceLo),
  bounceHi: z.number().min(0.1).max(1).default(DEFAULT_CONFIG.bounceHi),
  ballCollisions: z.boolean().default(DEFAULT_CONFIG.ballCollisions),
  jitter: z.number().min(0).max(0.5).default(DEFAULT_CONFIG.jitter),
  maxBalls: z.number().int().min(8).max(1024).default(DEFAULT_CONFIG.maxBalls),
  timeLimit: z.number().min(10).max(300).default(DEFAULT_CONFIG.timeLimit),
  step: z.number().min(1 / 480).max(1 / 30).default(DEFAULT_CONFIG.step),
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(DEFAULT_CONFIG.seed),
});

/**
 * 任意参数对局。用于「实验室」页：改层数 / 血量曲线 / 球速，
 * 立刻看谁赢、什么时候反超。
 */
simulateRoute.post('/simulate', async (c) => {
  const cfg = configSchema.parse(await c.req.json()) as EngineConfig;
  const r = simulate(cfg);
  return c.json(r);
});

/** 数学层面直接对比：第 n 次破镜后双方的球数 */
simulateRoute.get('/curve', (c) => {
  const n = Math.min(Math.max(Number(c.req.query('n') ?? 14), 1), 40);
  return c.json({
    breaks: Array.from({ length: n + 1 }, (_, i) => i),
    red: Array.from({ length: n + 1 }, (_, i) => Math.pow(2, i)),
    blue: Array.from({ length: n + 1 }, (_, i) => 1 + 15 * i),
  });
});
