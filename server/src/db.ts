import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * 持久化层。SQLite 用 Node 内置的 node:sqlite，不引入原生编译。
 *
 * 只存「用户做过什么判断」，不存模拟结果——模拟是确定性的，
 * 有 (preset, seed) 就能一秒内重算出逐字节一致的轨迹。
 */

export interface VoteRow {
  id: number;
  day: string;
  preset: string;
  seed: number;
  guess: 'R2' | 'B15';
  winner: 'R2' | 'B15' | 'tie';
  correct: 0 | 1;
  ms: number;
  created_at: string;
}

export interface StatsRow {
  day: string;
  preset: string;
  red: number;
  blue: number;
  total: number;
  redPct: number;
}

const dbPath = process.env.GBD_DB ?? resolve(import.meta.dirname, '../data/gbd.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS votes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    day        TEXT    NOT NULL,
    preset     TEXT    NOT NULL,
    seed       INTEGER NOT NULL,
    guess      TEXT    NOT NULL CHECK (guess IN ('R2','B15')),
    winner     TEXT    NOT NULL CHECK (winner IN ('R2','B15','tie')),
    correct    INTEGER NOT NULL CHECK (correct IN (0,1)),
    ms         INTEGER NOT NULL,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_votes_day ON votes(day, preset);
  CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at DESC);

  CREATE TABLE IF NOT EXISTS matches (
    seed       INTEGER PRIMARY KEY,
    preset     TEXT    NOT NULL,
    winner     TEXT    NOT NULL,
    red_ms     INTEGER NOT NULL,
    blue_ms    INTEGER NOT NULL,
    created_at TEXT    NOT NULL
  );
`);

const insertVote = db.prepare(`
  INSERT INTO votes (day, preset, seed, guess, winner, correct, ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertMatch = db.prepare(`
  INSERT INTO matches (seed, preset, winner, red_ms, blue_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(seed) DO UPDATE SET
    winner = excluded.winner,
    red_ms = excluded.red_ms,
    blue_ms = excluded.blue_ms
`);

const stmtStats = db.prepare(`
  SELECT day, preset,
         SUM(guess = 'R2') AS red,
         SUM(guess = 'B15') AS blue,
         COUNT(*) AS total
  FROM votes
  WHERE day = ? AND preset = ?
  GROUP BY day, preset
`);

const stmtRecent = db.prepare(`
  SELECT id, day, preset, seed, guess, winner, correct, ms, created_at
  FROM votes
  ORDER BY id DESC
  LIMIT ?
`);

const stmtAccuracy = db.prepare(`
  SELECT COUNT(*) AS total, SUM(correct) AS hit FROM votes
`);

export function recordVote(v: Omit<VoteRow, 'id' | 'created_at'>): VoteRow {
  const createdAt = new Date().toISOString();
  insertVote.run(v.day, v.preset, v.seed, v.guess, v.winner, v.correct, v.ms, createdAt);
  return { ...v, id: Number(db.prepare('SELECT last_insert_rowid() AS id').get()!.id), created_at: createdAt };
}

export function recordMatch(m: {
  seed: number;
  preset: string;
  winner: string;
  redMs: number;
  blueMs: number;
}): void {
  upsertMatch.run(m.seed, m.preset, m.winner, Math.round(m.redMs), Math.round(m.blueMs), new Date().toISOString());
}

export function statsFor(day: string, preset: string): StatsRow {
  const row = stmtStats.get(day, preset) as
    | { day: string; preset: string; red: number; blue: number; total: number }
    | undefined;
  if (!row) return { day, preset, red: 0, blue: 0, total: 0, redPct: 0 };
  return {
    ...row,
    redPct: row.total ? Math.round((row.red / row.total) * 100) : 0,
  };
}

export function recentVotes(limit = 20): VoteRow[] {
  return stmtRecent.all(Math.min(Math.max(limit, 1), 100)) as unknown as VoteRow[];
}

export function globalAccuracy(): { total: number; hit: number; pct: number } {
  const row = stmtAccuracy.get() as { total: number; hit: number | null } | undefined;
  const total = row?.total ?? 0;
  const hit = row?.hit ?? 0;
  return { total, hit, pct: total ? Math.round((hit / total) * 100) : 0 };
}
