import { Hono } from 'hono';
import { z } from 'zod';
import { configFor, isPresetId, today } from '../daily.ts';
import { recentVotes, recordMatch, recordVote, statsFor } from '../db.ts';
import { simulate } from '../../../shared/src/engine.ts';

/**
 * 每日竞猜的投票。
 * 注意：提交时服务端自己算一遍再做对错判定，绝不信客户端说的 winner。
 */
export const votes = new Hono();

const body = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preset: z.string(),
  guess: z.enum(['R2', 'B15']),
  /** 客户端从出题到提交的耗时，用于后续分析 */
  ms: z.number().int().min(0).max(3_600_000).default(0),
});

votes.post('/votes', async (c) => {
  const input = body.parse(await c.req.json());
  if (!isPresetId(input.preset)) return c.json({ error: 'unknown_preset' }, 400);

  const cfg = configFor(input.day, input.preset);
  const match = simulate(cfg);
  recordMatch({
    seed: cfg.seed,
    preset: input.preset,
    winner: match.winner,
    redMs: match.red.totalTime * 1000,
    blueMs: match.blue.totalTime * 1000,
  });

  const correct = match.winner === input.guess ? 1 : 0;
  const saved = recordVote({
    day: input.day,
    preset: input.preset,
    seed: cfg.seed,
    guess: input.guess,
    winner: match.winner,
    correct: correct as 0 | 1,
    ms: input.ms,
  });

  return c.json({
    vote: {
      id: saved.id,
      guess: saved.guess,
      correct: Boolean(correct),
      createdAt: saved.created_at,
    },
    result: {
      winner: match.winner,
      reason: match.reason,
      red: { breaks: match.red.breaks, balls: match.red.finalBalls, ms: Math.round(match.red.totalTime * 1000) },
      blue: { breaks: match.blue.breaks, balls: match.blue.finalBalls, ms: Math.round(match.blue.totalTime * 1000) },
    },
    crowd: statsFor(input.day, input.preset),
    recent: recentVotes(8),
  });
});

/** 当天已经投过没有？（前端在同一天刷新时用来恢复状态） */
votes.get('/votes/today', (c) => {
  const day = c.req.query('day') ?? today();
  return c.json(statsFor(day, c.req.query('preset') ?? 'standard'));
});
