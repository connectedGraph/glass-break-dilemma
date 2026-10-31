import { useEffect, useRef, useState } from 'preact/hooks';
import { Playback, type SimOutput } from '../game/Playback.ts';
import { LaneRenderer } from '../render/LaneRenderer.ts';
import type { EngineConfig, LaneResult, MatchResult } from '@shared/index.ts';
import './arena.css';

/**
 * 竞技场：双屏 canvas + 顶部规则栏 + 底部时间轴。
 *
 * 物理在浏览器里算：配置交给 Web Worker，跑 shared/src/engine.ts（和服务端同一份代码），
 * 拿回每帧全部球的坐标再回放。如果传了服务端的结算，就逐位比对，
 * 一致才说明「浏览器看到的」就是「服务端判胜用的」那一局。
 */

export interface ArenaProps {
  config: EngineConfig;
  /** 服务端的权威结算，用于和浏览器复算逐位比对 */
  expected?: { red: LaneResult; blue: LaneResult; winner: string } | null;
  controller?: ArenaController;
  /** 本地模拟完成后回调（实验室页用它显示结论） */
  onResult?: (r: MatchResult, ms: number) => void;
  /** 模拟一算完就开始播放 */
  autoPlay?: boolean;
  className?: string;
}

export interface ArenaController {
  play?: () => void;
  pause?: () => void;
  toggle?: () => void;
  seek?: (t: number) => void;
  setSpeed?: (s: number) => void;
}

/* 全页面共用一个 Worker；新请求会让旧请求的结果作废 */
let worker: Worker | null = null;
let reqSeq = 0;
function getWorker() {
  if (!worker) worker = new Worker(new URL('../game/sim.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

type Verify = { ok: boolean; detail: string } | null;

function verifyAgainst(local: MatchResult, expected: NonNullable<ArenaProps['expected']>): Verify {
  const same =
    local.winner === expected.winner &&
    local.red.totalTime === expected.red.totalTime &&
    local.blue.totalTime === expected.blue.totalTime &&
    local.red.hits === expected.red.hits &&
    local.blue.hits === expected.blue.hits;
  return same
    ? { ok: true, detail: '与服务端结算逐位一致' }
    : {
        ok: false,
        detail: `与服务端不一致：本地 ${local.red.totalTime.toFixed(3)}/${local.blue.totalTime.toFixed(3)}s，服务端 ${expected.red.totalTime.toFixed(3)}/${expected.blue.totalTime.toFixed(3)}s`,
      };
}

export function Arena({ config, expected, controller, onResult, autoPlay, className }: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef<Playback | null>(null);
  const rendererRef = useRef<LaneRenderer | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const speedRef = useRef(1);

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [counters, setCounters] = useState({ ballsRed: 1, ballsBlue: 1, breaksRed: 0, breaksBlue: 0 });
  const [simMs, setSimMs] = useState<number | null>(null);
  const [collisions, setCollisions] = useState(0);
  const [verify, setVerify] = useState<Verify>(null);

  const key = JSON.stringify(config);
  // expected 每次渲染可能是新对象，按内容比较，避免重复模拟
  const expectedKey = expected ? `${expected.winner}:${expected.red.totalTime}:${expected.blue.totalTime}` : '';
  const expectedRef = useRef(expected);
  expectedRef.current = expected;
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  // 配置一变就交给 Worker 重算
  useEffect(() => {
    const id = ++reqSeq;
    const w = getWorker();
    setSimMs(null);
    setVerify(null);
    const onMsg = (ev: MessageEvent<SimOutput & { id: number }>) => {
      if (ev.data.id !== id) return;
      const out = ev.data;
      const pb = new Playback(out);
      pb.state.speed = speedRef.current;
      pb.state.playing = !!autoPlayRef.current;
      playbackRef.current = pb;
      setDuration(pb.duration);
      setT(0);
      setCounters(pb.counters());
      setPlaying(pb.state.playing);
      setSimMs(out.ms);
      setCollisions(out.result.red.ballCollisions + out.result.blue.ballCollisions);
      if (expectedRef.current) setVerify(verifyAgainst(out.result, expectedRef.current));
      lastRef.current = 0;
      rendererRef.current?.draw(pb.snapshot());
      onResult?.(out.result, out.ms);
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, config });
    return () => w.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, expectedKey]);

  useEffect(() => {
    speedRef.current = speed;
    if (playbackRef.current) playbackRef.current.state.speed = speed;
  }, [speed]);

  function play() {
    const pb = playbackRef.current;
    if (!pb) return;
    if (pb.state.t >= pb.duration - 0.05) pb.seek(0);
    pb.state.playing = true;
    setPlaying(true);
  }

  function pause() {
    const pb = playbackRef.current;
    if (!pb) return;
    pb.state.playing = false;
    setPlaying(false);
  }

  function togglePlay() {
    if (playbackRef.current?.state.playing) pause();
    else play();
  }

  function doSeek(next: number) {
    const pb = playbackRef.current;
    if (!pb) return;
    pb.seek(next);
    if (pb.state.t >= pb.duration - 0.01) pause();
    setT(pb.state.t);
    setCounters(pb.counters());
    rendererRef.current?.draw(pb.snapshot());
  }

  if (controller) {
    controller.play = play;
    controller.pause = pause;
    controller.toggle = togglePlay;
    controller.seek = doSeek;
    controller.setSpeed = setSpeed;
  }

  // 渲染循环
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new LaneRenderer(canvas);
    rendererRef.current = renderer;

    const ro = new ResizeObserver(() => {
      renderer.resize();
      const pb = playbackRef.current;
      if (pb) renderer.draw(pb.snapshot());
    });
    ro.observe(canvas);

    let lastUi = 0;
    const loop = (now: number) => {
      const last = lastRef.current || now;
      const dt = Math.min((now - last) / 1000, 0.05);
      lastRef.current = now;
      const pb = playbackRef.current;
      if (pb && pb.state.playing) {
        renderer.draw(pb.advance(dt));
        if (now - lastUi > 60) {
          lastUi = now;
          setT(pb.state.t);
          setCounters(pb.counters());
          if (!pb.state.playing) setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      rendererRef.current = null;
      lastRef.current = 0;
    };
  }, []);

  // 空格 / 方向键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        doSeek(Math.min(t + 2, duration));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        doSeek(Math.max(t - 2, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress = duration ? Math.min(t / duration, 1) : 0;

  return (
    <div class={`arena ${className ?? ''}`}>
      <div class="arena__head">
        <TeamRule
          team="red"
          label="RED"
          sign="×"
          num={String(config.redMultiplier)}
          balls={counters.ballsRed}
          breaks={counters.breaksRed}
          layers={config.layers}
        />
        <div class="arena__mid">
          <div class="arena__title display">WHO WINS?</div>
          <div class="arena__clock mono">{fmt(t)}</div>
        </div>
        <TeamRule
          team="blue"
          label="BLUE"
          sign="+"
          num={String(config.blueAdd)}
          balls={counters.ballsBlue}
          breaks={counters.breaksBlue}
          layers={config.layers}
        />
      </div>

      <div class="arena__stage">
        <canvas ref={canvasRef} class="arena__canvas" />
        {simMs === null && <div class="arena__loading">浏览器正在模拟…</div>}
      </div>

      <div class="arena__controls">
        <button
          class="arena__play"
          onClick={togglePlay}
          aria-label={playing ? '暂停' : '播放'}
          title={playing ? '暂停（空格）' : '播放（空格）'}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>

        <div class="arena__timeline">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.02}
            value={t}
            onInput={(e) => doSeek(Number((e.target as HTMLInputElement).value))}
            aria-label="播放进度"
            style={{ '--p': `${progress * 100}%` }}
          />
          <div class="arena__time mono">
            <span>{fmt(t)}</span>
            <span class="mute">/ {fmt(duration)}</span>
          </div>
        </div>

        <div class="arena__speed">
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              class={`arena__speed-btn ${speed === s ? 'is-on' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div class="arena__proof mono">
        {simMs === null ? (
          <span class="mute">Web Worker 里跑 shared/src/engine.ts…</span>
        ) : (
          <>
            <span>浏览器 JS 物理 · {simMs.toFixed(0)}ms</span>
            <span class="mute">球-球碰撞 {collisions.toLocaleString()} 次</span>
            {verify && <span class={verify.ok ? 'is-ok' : 'is-bad'}>{verify.ok ? '✓ ' : '✗ '}{verify.detail}</span>}
          </>
        )}
      </div>
    </div>
  );
}

/** 顶部单侧规则：队名 + 规则 + 当前球数 */
function TeamRule(props: {
  team: 'red' | 'blue';
  label: string;
  sign: string;
  num: string;
  balls: number;
  breaks: number;
  layers: number;
}) {
  const done = props.breaks >= props.layers;
  return (
    <div class={`rule rule--${props.team} ${done ? 'is-done' : ''}`}>
      <div class="rule__top">
        <span class="rule__label display">{props.label}</span>
        <span class="rule__mod display">
          {props.sign}
          {props.num}
        </span>
      </div>
      <div class="rule__note">每破一块 · 球数</div>
      <div class="rule__balls mono">
        <b>{props.balls}</b>
        <span class="rule__unit">颗</span>
      </div>
    </div>
  );
}

export function formatValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return '0.0s';
  return `${sec.toFixed(1)}s`;
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
    </svg>
  );
}
