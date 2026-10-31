import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type Crowd, type Puzzle, type RevealResponse, type VoteResponse } from './api.ts';

/**
 * 页面级数据加载。每页一个 hook，不做全局 store——
 * 这个应用只有三屏，全局状态反而增加理解成本。
 */

export function usePuzzle(preset: string) {
  const [data, setData] = useState<Puzzle | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api
      .puzzle(undefined, preset)
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [preset]);
  return { puzzle: data, error };
}

export function useReveal(day: string | null, preset: string) {
  const [data, setData] = useState<RevealResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!day) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .reveal(day, preset)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [day, preset]);
  return { reveal: data, loading, error };
}

export function useCrowd(day: string | null, preset: string) {
  const [crowd, setCrowd] = useState<Crowd | null>(null);
  useEffect(() => {
    if (!day) return;
    let alive = true;
    api
      .stats(day, preset)
      .then((c) => alive && setCrowd(c))
      .catch(() => void 0);
    return () => {
      alive = false;
    };
  }, [day, preset]);
  return crowd;
}

/** 本地记录「今天押过什么」，只在同一天同一预设生效 */
const LS_KEY = 'gbd.vote.v1';

export interface StoredVote {
  day: string;
  preset: string;
  guess: 'R2' | 'B15';
  correct: boolean;
  winner: 'R2' | 'B15' | 'tie';
}

export function loadVote(day: string, preset: string): StoredVote | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredVote;
    return v.day === day && v.preset === preset ? v : null;
  } catch {
    return null;
  }
}

export function saveVote(v: StoredVote) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    /* 隐私模式下忽略 */
  }
}

// ── 历史战绩（本地） ─────────────────────────

export interface HistoryEntry {
  day: string;
  preset: string;
  guess: 'R2' | 'B15';
  winner: 'R2' | 'B15' | 'tie';
  correct: boolean;
}

const HIST_KEY = 'gbd.history.v1';

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = loadHistory().filter(
    (e) => !(e.day === entry.day && e.preset === entry.preset),
  );
  list.unshift(entry);
  const trimmed = list.slice(0, 60);
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(trimmed));
  } catch {
    /* 忽略 */
  }
  return trimmed;
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setHistory(loadHistory());
  }, []);
  return { history, setHistory, push: (e: HistoryEntry) => setHistory(pushHistory(e)) };
}

// ── 投票 ────────────────────────────────────

export function useVote() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const submit = async (day: string, preset: string, guess: 'R2' | 'B15') => {
    setSubmitting(true);
    setError(null);
    try {
      const ms = Date.now() - startedAt.current;
      const r = await api.vote({ day, preset, guess, ms });
      setResult(r);
      saveVote({ day, preset, guess, correct: r.vote.correct, winner: r.result.winner });
      pushHistory({ day, preset, guess, winner: r.result.winner, correct: r.vote.correct });
      return r;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  return { submit, submitting, result, error, startedAt };
}
