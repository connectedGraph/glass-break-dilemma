/**
 * 后端 API 客户端。故意保持极薄：所有类型从 shared 推导，
 * 服务端和客户端不会各写一套。
 */
import type { EngineConfig, MatchResult } from '@shared/index.ts';

export interface Puzzle {
  day: string;
  preset: string;
  name: string;
  desc: string;
  layers: number;
  values: number[];
  startBalls: number;
  redMultiplier: number;
  blueAdd: number;
  gravity: number;
  /** 场上球数硬上限（题面公开，不影响判定） */
  maxBalls: number;
  msUntilTomorrow: number;
}

export interface PresetInfo {
  id: string;
  name: string;
  desc: string;
  layers: number;
  values: number[];
}

export interface RevealResponse {
  day: string;
  preset: string;
  seed: number;
  config: EngineConfig;
  winner: 'R2' | 'B15' | 'tie';
  reason: string;
  red: MatchResult['red'];
  blue: MatchResult['blue'];
}

export interface VoteResponse {
  vote: { id: number; guess: 'R2' | 'B15'; correct: boolean; createdAt: string };
  result: {
    winner: 'R2' | 'B15' | 'tie';
    reason: string;
    red: { breaks: number; ms: number };
    blue: { breaks: number; ms: number };
  };
  crowd: Crowd;
  recent: RecentVote[];
}

export interface Crowd {
  day: string;
  preset: string;
  red: number;
  blue: number;
  total: number;
  redPct: number;
  hit?: number;
  pct?: number;
}

export interface RecentVote {
  id: number;
  day: string;
  preset: string;
  guess: 'R2' | 'B15';
  winner: 'R2' | 'B15' | 'tie';
  correct: 0 | 1;
  ms: number;
  created_at: string;
}

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, await safeText(res));
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await safeText(res));
  return (await res.json()) as T;
}

const safeText = async (r: Response) => {
  try {
    return await r.text();
  } catch {
    return '';
  }
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`);
  }
}

export const api = {
  puzzle: (day?: string, preset?: string) => {
    const q = new URLSearchParams();
    if (day) q.set('day', day);
    if (preset) q.set('preset', preset);
    const s = q.toString();
    return get<Puzzle>(`/daily${s ? `?${s}` : ''}`);
  },

  reveal: (day: string, preset: string) =>
    get<RevealResponse>(`/daily/reveal?${new URLSearchParams({ day, preset })}`),

  presets: () => get<{ presets: PresetInfo[] }>('/presets'),

  stats: (day: string, preset: string) =>
    get<Crowd>(`/stats?${new URLSearchParams({ day, preset })}`),

  vote: (input: { day: string; preset: string; guess: 'R2' | 'B15'; ms: number }) =>
    post<VoteResponse>('/votes', input),

  simulate: (cfg: EngineConfig) => post<MatchResult>('/simulate', cfg),
};
