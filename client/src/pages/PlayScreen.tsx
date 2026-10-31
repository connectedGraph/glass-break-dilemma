import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Arena, type ArenaController, fmt, formatValue } from '../ui/Arena.tsx';
import { usePuzzle, useReveal, useVote, loadVote } from '../net/hooks.ts';
import type { EngineConfig } from '@shared/index.ts';
import { DEFAULT_CONFIG } from '@shared/index.ts';
import './play.css';

/**
 * 今日题：看题 → 押边 → 揭晓回放。
 *
 * 关键交互设计：押注之前不看结果。押完自动开始播放，
 * 想跳过就点「直接看结局」。
 */
export function PlayScreen() {
  const [preset, setPreset] = useState('standard');
  const { puzzle, error } = usePuzzle(preset);

  const [guessed, setGuessed] = useState<'R2' | 'B15' | null>(null);
  const [revealed, setRevealed] = useState(false);
  const { submit, submitting, result } = useVote();
  const { reveal } = useReveal(revealed && puzzle ? puzzle.day : null, preset);

  const controller = useRef<ArenaController>({} as ArenaController).current;

  // 恢复当天的押注记录
  useEffect(() => {
    if (!puzzle) return;
    const saved = loadVote(puzzle.day, preset);
    if (saved) {
      setGuessed(saved.guess);
      setRevealed(true);
    } else {
      setGuessed(null);
      setRevealed(false);
    }
  }, [puzzle?.day, preset]);

  /**
   * 押注前用一份「演示例题」配置跑（seed 固定），揭晓后才换成当天真配置。
   * 这样押注之前用户看到的是同一个玩法，但算不出今天的答案。
   */
  const config = useMemo<EngineConfig>(() => {
    if (!puzzle) return DEFAULT_CONFIG;
    if (reveal) return reveal.config;
    return {
      ...DEFAULT_CONFIG,
      layers: puzzle.layers,
      values: puzzle.values,
      startBalls: puzzle.startBalls,
      redMultiplier: puzzle.redMultiplier,
      blueAdd: puzzle.blueAdd,
      gravity: puzzle.gravity,
      maxBalls: puzzle.maxBalls,
      seed: 20261031,
    };
  }, [puzzle, reveal]);

  const pick = async (side: 'R2' | 'B15') => {
    if (!puzzle || submitting) return;
    setGuessed(side);
    const r = await submit(puzzle.day, preset, side);
    if (r) setRevealed(true);
  };


  if (error) return <ErrorBox message={error} />;
  if (!puzzle) return <Skeleton />;

  return (
    <div class="play">
      <div class="play__banner rise">
        <div class="play__date mono">{puzzle.day}</div>
        <h1 class="play__headline display">
          {revealed ? '结局' : '谁先砸穿整堆玻璃？'}
        </h1>
        <p class="play__lede">
          {puzzle.layers} 块玻璃，从 {puzzle.values[0]} 到{' '}
          {puzzle.values[puzzle.values.length - 1]}。开局各 1 颗球，
          <span class="hl-red"> ×{puzzle.redMultiplier}</span> 复利对
          <span class="hl-blue"> +{puzzle.blueAdd}</span> 线性。
        </p>
      </div>

      {!revealed && (
        <div class="vote rise" style={{ animationDelay: '80ms' }}>
          <div class="vote__q">你会选哪边？</div>
          <div class="vote__row">
            <button
              class="vote__btn vote__btn--red"
              onClick={() => pick('R2')}
              disabled={submitting}
            >
              <span class="vote__mod display">×{puzzle.redMultiplier}</span>
              <span class="vote__name">RED</span>
              <span class="vote__desc">每破一块球数翻倍，前期只有 1 颗球</span>
            </button>
            <button
              class="vote__btn vote__btn--blue"
              onClick={() => pick('B15')}
              disabled={submitting}
            >
              <span class="vote__mod display">+{puzzle.blueAdd}</span>
              <span class="vote__name">BLUE</span>
              <span class="vote__desc">每破一块球数 +15，第一块碎完就铺满</span>
            </button>
          </div>
          <div class="vote__hint mute">
            {submitting ? '正在结算…' : '投完立刻看回放，不用登录'}
          </div>
        </div>
      )}

      {revealed && (
        <Verdict
          result={result}
          guessed={guessed}
          reveal={reveal}
          onSkip={() => {
            controller.seek?.(9999);
          }}
        />
      )}

      <Arena
        config={config}
        expected={reveal ? { red: reveal.red, blue: reveal.blue, winner: reveal.winner } : null}
        controller={controller}
        autoPlay={!!reveal}
      />

      <Tactics
        config={puzzle}
        revealed={revealed}
        reveal={reveal}
      />
    </div>
  );
}

/* ── 结果条 ───────────────────────────────── */

function Verdict(props: {
  result: ReturnType<typeof useVote>['result'];
  guessed: 'R2' | 'B15' | null;
  reveal: ReturnType<typeof useReveal>['reveal'];
  onSkip: () => void;
}) {
  const { result, guessed, reveal, onSkip } = props;
  /**
   * 刷新页面后 result 是空的（投票接口不会再调），
   * 所以结果从 reveal 里推——它是权威模拟结果，与投票时服务端的判定一致。
   */
  const correct =
    result?.vote.correct ??
    (guessed && reveal ? guessHits(guessed, reveal.winner) : undefined);
  const winner = result?.result.winner ?? reveal?.winner;
  const reason =
    result?.result.reason ??
    (reveal ? `RED ${reveal.red.totalTime.toFixed(2)}s · BLUE ${reveal.blue.totalTime.toFixed(2)}s` : undefined);
  const crowd = result?.crowd;

  return (
    <div class={`verdict rise ${correct ? 'is-hit' : correct === false ? 'is-miss' : ''}`}>
      <div class="verdict__main">
        <div class="verdict__badge">
          {correct === true && '押对了'}
          {correct === false && '押偏了'}
          {correct === undefined && '查看结果'}
        </div>
        {winner && (
          <div class="verdict__winner">
            <span class={`verdict__side ${winner === 'R2' ? 'is-red' : winner === 'B15' ? 'is-blue' : ''}`}>
              {winner === 'R2' ? 'RED ×2' : winner === 'B15' ? 'BLUE +15' : '平局'}
            </span>
            <span class="verdict__reason dim">{reason}</span>
          </div>
        )}
        {guessed && (
          <div class="verdict__pick mute">
            你押的是 {guessed === 'R2' ? 'RED ×2' : 'BLUE +15'}
          </div>
        )}
      </div>
      {crowd && crowd.total > 0 && (
        <div class="verdict__crowd">
          <div class="verdict__crowd-bar">
            <div class="verdict__crowd-red" style={{ width: `${crowd.redPct}%` }} />
          </div>
          <div class="verdict__crowd-legend mono">
            <span class="is-red">{crowd.redPct}% 押红</span>
            <span class="mute">{crowd.total} 人</span>
            <span class="is-blue">{100 - crowd.redPct}% 押蓝</span>
          </div>
        </div>
      )}
      <button class="btn btn--ghost verdict__skip" onClick={onSkip}>
        直接看结局
      </button>
    </div>
  );
}

/* ── 战术分析 ─────────────────────────────── */

function Tactics(props: {
  config: NonNullable<ReturnType<typeof usePuzzle>['puzzle']>;
  revealed: boolean;
  reveal: ReturnType<typeof useReveal>['reveal'];
}) {
  const { config, revealed, reveal } = props;
  const [show, setShow] = useState(false);

  if (!revealed || !reveal) {
    return null;
  }

  const rows = reveal.red.tierTimes.map((rt, i) => ({
    tier: i,
    value: config.values[i],
    red: rt,
    blue: reveal.blue.tierTimes[i],
  }));

  return (
    <section class="tactics rise">
      <div class="tactics__head">
        <h2 class="tactics__title">逐层对照</h2>
        <button class="btn btn--ghost tactics__toggle" onClick={() => setShow(!show)}>
          {show ? '收起全部' : '看每层的撞击'}
        </button>
      </div>

      <div class="tactics__grid">
        {rows.map((r) => {
          const lead = r.red !== null && r.blue !== null ? (r.red < r.blue ? 'red' : 'blue') : r.red !== null ? 'red' : r.blue !== null ? 'blue' : null;
          return (
            <div class="tier-row" key={r.tier}>
              <div class="tier-row__value mono">{r.value}</div>
              <div class="tier-row__side is-red">
                <div class="tier-bar tier-bar--red">
                  <div
                    class="tier-bar__fill"
                    style={{ width: `${barWidth(r.red, reveal.red.totalTime)}%` }}
                  />
                </div>
                <span class="tier-row__time mono is-red">{r.red === null ? '—' : fmt(r.red)}</span>
              </div>
              <div class="tier-row__side is-blue">
                <span class="tier-row__time mono is-blue">{r.blue === null ? '—' : fmt(r.blue)}</span>
                <div class="tier-bar tier-bar--blue">
                  <div
                    class="tier-bar__fill"
                    style={{ width: `${barWidth(r.blue, reveal.blue.totalTime)}%` }}
                  />
                </div>
              </div>
              {lead && (
                <span class={`tier-row__lead is-${lead}`}>
                  {lead === 'red' ? '红先' : '蓝先'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p class="tactics__note">
        时间表示「这块玻璃被砸穿的时刻」。最后一层谁先碎，谁就先通顶；
        若两边同一层的时间相差不到 0.02 秒，判平。
      </p>

      {show && (
        <div class="tactics__detail">
          <Stat label="RED 最终球价值" value={formatValue(reveal.red.finalBalls)} tone="red" />
          <Stat label="BLUE 最终球价值" value={formatValue(reveal.blue.finalBalls)} tone="blue" />
          <Stat label="RED 总撞击" value={String(reveal.red.hits)} />
          <Stat label="BLUE 总撞击" value={String(reveal.blue.hits)} />
          <Stat label="RED 用时" value={fmt(reveal.red.totalTime)} tone="red" />
          <Stat label="BLUE 用时" value={fmt(reveal.blue.totalTime)} tone="blue" />
        </div>
      )}
    </section>
  );
}

/** 押注是否命中的判定（与 server 的 judge 用同一套口径） */
function guessHits(guess: 'R2' | 'B15', winner: 'R2' | 'B15' | 'tie'): boolean | undefined {
  if (winner === 'tie') return undefined;
  return guess === winner;
}

function Stat(props: { label: string; value: string; tone?: 'red' | 'blue' }) {
  return (
    <div class="stat">
      <div class="stat__label tiny">{props.label}</div>
      <div class={`stat__value mono ${props.tone ? `is-${props.tone}` : ''}`}>{props.value}</div>
    </div>
  );
}

function barWidth(t: number | null, total: number) {
  if (t === null) return 0;
  return Math.max(4, Math.min(100, (t / total) * 100));
}

function ErrorBox(props: { message: string }) {
  return (
    <div class="errbox glass">
      <div class="errbox__title">后端没连上</div>
      <div class="errbox__msg mono">{props.message}</div>
      <div class="errbox__hint mute">
        开发时请确认 server 在 8091 端口运行（npm run dev）。
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div class="skel">
      <div class="skel__bar" style={{ width: '36%', height: 18 }} />
      <div class="skel__bar" style={{ width: '68%', height: 38, marginTop: 14 }} />
      <div class="skel__canvas glass" />
    </div>
  );
}
