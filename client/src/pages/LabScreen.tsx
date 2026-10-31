import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Arena, type ArenaController, fmt, formatValue } from '../ui/Arena.tsx';
import { DEFAULT_CONFIG, DEFAULT_CURVE, valueCurve, type EngineConfig, type MatchResult } from '@shared/index.ts';
import './lab.css';

/**
 * 实验室：自己调层数、血量倍率、球速、双方规则，
 * 全部在浏览器里本地算（引擎是 shared 的，结果和服务端一致）。
 */

export function LabScreen() {
  // 初值取标准局的参数，这样一进来看到的就是熟悉的那一局
  const [layers, setLayers] = useState(DEFAULT_CONFIG.layers);
  const [first, setFirst] = useState<number>(DEFAULT_CURVE.first);
  const [ratio, setRatio] = useState<number>(DEFAULT_CURVE.ratio);
  const [gravity, setGravity] = useState(DEFAULT_CONFIG.gravity);
  const [maxBalls, setMaxBalls] = useState(DEFAULT_CONFIG.maxBalls);
  const [collide, setCollide] = useState(DEFAULT_CONFIG.ballCollisions);
  const [redMul, setRedMul] = useState(DEFAULT_CONFIG.redMultiplier);
  const [blueAdd, setBlueAdd] = useState(DEFAULT_CONFIG.blueAdd);
  const [seed, setSeed] = useState(DEFAULT_CONFIG.seed);

  const controller = useRef<ArenaController>({} as ArenaController).current;

  /**
   * 实验室的「首层血量 / 倍率」两个滑杆直接决定整条血曲线，
   * 所以不再从 DEFAULT_CONFIG.values 取，而是按滑杆现算。
   */
  const live = useMemo<EngineConfig>(
    () => ({
      ...DEFAULT_CONFIG,
      layers,
      values: valueCurve(layers, first, ratio),
      gravity,
      maxBalls,
      ballCollisions: collide,
      redMultiplier: redMul,
      blueAdd,
      seed,
    }),
    [layers, first, ratio, gravity, maxBalls, collide, redMul, blueAdd, seed],
  );

  // 拖滑杆时每一格都重算太浪费：停手 250ms 再交给 Worker
  const [config, setConfig] = useState(live);
  useEffect(() => {
    const id = setTimeout(() => setConfig(live), 250);
    return () => clearTimeout(id);
  }, [live]);

  // 结论来自 Arena 里 Worker 的模拟结果，和画面是同一局
  const [result, setResult] = useState<MatchResult | null>(null);

  return (
    <div class="lab">
      <div class="lab__intro rise">
        <h1 class="lab__title display">调参实验室</h1>
        <p class="lab__lede">
          层数、血量曲线、球速这三样是咬合的。把层数往上加，红方（×2）的复利
          才有机会压过蓝方（+15）的线性；把血量倍率调大，红方后段会被自己的
          数值拖慢。所有计算在浏览器本地完成。
        </p>
      </div>

      <div class="lab__grid rise" style={{ animationDelay: '60ms' }}>
        <Arena config={config} controller={controller} onResult={(r) => setResult(r)} className="lab__arena" />
        <aside class="lab__panel glass">
          <div class="lab__panel-head">
            <span class="tiny">参数</span>
            <button
              class="btn btn--ghost lab__reset"
              onClick={() => {
                setLayers(DEFAULT_CONFIG.layers);
                setFirst(DEFAULT_CURVE.first);
                setRatio(DEFAULT_CURVE.ratio);
                setGravity(DEFAULT_CONFIG.gravity);
                setMaxBalls(DEFAULT_CONFIG.maxBalls);
                setCollide(DEFAULT_CONFIG.ballCollisions);
                setRedMul(DEFAULT_CONFIG.redMultiplier);
                setBlueAdd(DEFAULT_CONFIG.blueAdd);
                setSeed(DEFAULT_CONFIG.seed);
              }}
            >
              复位
            </button>
          </div>

          <Slider
            label="玻璃层数"
            value={layers}
            min={4}
            max={20}
            step={1}
            suffix=" 层"
            onChange={setLayers}
          />
          <Slider
            label="首层血量"
            value={first}
            min={1}
            max={20}
            step={1}
            suffix=""
            onChange={setFirst}
          />
          <Slider
            label="血量倍率"
            value={ratio}
            min={1.3}
            max={2.2}
            step={0.01}
            suffix="×"
            format={(v) => v.toFixed(2)}
            onChange={setRatio}
          />
          <Slider
            label="重力"
            value={gravity}
            min={800}
            max={5000}
            step={100}
            suffix=""
            onChange={setGravity}
          />
          <Slider
            label="通道容量"
            value={maxBalls}
            min={64}
            max={1024}
            step={32}
            suffix=" 颗"
            onChange={setMaxBalls}
          />
          <label class="lab__toggle">
            <input type="checkbox" checked={collide} onChange={(e) => setCollide((e.target as HTMLInputElement).checked)} />
            <span>球与球碰撞</span>
          </label>
          <Slider
            label="红方倍率"
            value={redMul}
            min={1.2}
            max={4}
            step={0.1}
            suffix="×"
            format={(v) => v.toFixed(1)}
            onChange={setRedMul}
          />
          <Slider
            label="蓝方加成"
            value={blueAdd}
            min={5}
            max={60}
            step={1}
            suffix=""
            onChange={setBlueAdd}
          />

          <div class="lab__seed">
            <span class="tiny">随机种子</span>
            <div class="lab__seed-row">
              <span class="mono">{seed}</span>
              <button
                class="btn btn--ghost lab__dice"
                onClick={() => setSeed(Math.floor(Math.random() * 2_000_000_000))}
              >
                换一把
              </button>
            </div>
          </div>

          <div class="lab__curve">
            <span class="tiny">血量曲线</span>
            <div class="lab__curve-list mono">
              {config.values.map((v, i) => (
                <span key={i} class="lab__curve-val" style={{ opacity: 0.45 + (i / layers) * 0.55 }}>
                  {v}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {result && (
        <section class="lab__result rise">
          <div class={`lab__winner ${result.winner === 'R2' ? 'is-red' : result.winner === 'B15' ? 'is-blue' : ''}`}>
            <span class="lab__winner-label tiny">结论</span>
            <span class="lab__winner-side display">
              {result.winner === 'R2' ? 'RED ×2' : result.winner === 'B15' ? 'BLUE +15' : '平局'}
            </span>
            <span class="lab__winner-reason dim">{result.reason}</span>
            <span class="lab__winner-reason mute">
              球-球碰撞 {(result.red.ballCollisions + result.blue.ballCollisions).toLocaleString()} 次
            </span>
          </div>
          <div class="lab__stats">
            <LabStat
              tone="red"
              title="RED"
              rows={[
                ['用时', fmt(result.red.totalTime)],
                ['最终球数', formatValue(result.red.finalBalls)],
                ['破镜', `${result.red.breaks}/${layers}`],
                ['总撞击', String(result.red.hits)],
              ]}
            />
            <LabStat
              tone="blue"
              title="BLUE"
              rows={[
                ['用时', fmt(result.blue.totalTime)],
                ['最终球数', formatValue(result.blue.finalBalls)],
                ['破镜', `${result.blue.breaks}/${layers}`],
                ['总撞击', String(result.blue.hits)],
              ]}
            />
          </div>
          <MathNote layers={layers} redMul={redMul} blueAdd={blueAdd} config={config} />
        </section>
      )}
    </div>
  );
}

/** 数学直说：第几块之后红方反超 */
function MathNote(props: {
  layers: number;
  redMul: number;
  blueAdd: number;
  config: EngineConfig;
}) {
  const { redMul, blueAdd } = props;
  // 解 start*redMul^n >= start*redMul + blueAdd*n 大致位置（从 n=1 起算）
  let cross = -1;
  for (let n = 1; n <= 40; n++) {
    const red = Math.pow(redMul, n);
    const blue = 1 + blueAdd * n;
    if (red >= blue) {
      cross = n;
      break;
    }
  }

  return (
    <div class="mathnote">
      <div class="mathnote__text">
        {cross > 0 ? (
          <>
            纯按数值算，红方在第 <b class="is-red">{cross}</b> 块之后开始反超
            （×{redMul} 的复利越过 +{blueAdd} 的直线）。
            {props.layers <= cross ? (
              <span class="is-blue">当前只有 {props.layers} 块，红方来不及反超就结束了。</span>
            ) : (
              <span>当前 {props.layers} 块，红方还有机会。</span>
            )}
          </>
        ) : (
          <>在 40 块之内红方都追不上蓝方。</>
        )}
      </div>
      <CurveChart redMul={redMul} blueAdd={blueAdd} layers={props.layers} />
    </div>
  );
}

/** ×2 与 +15 的价值曲线小图（SVG） */
function CurveChart(props: { redMul: number; blueAdd: number; layers: number }) {
  const { redMul, blueAdd, layers } = props;
  const n = Math.max(layers + 2, 12);
  const pts = Array.from({ length: n + 1 }, (_, i) => ({
    i,
    red: Math.pow(redMul, i),
    blue: 1 + blueAdd * i,
  }));
  const max = Math.max(...pts.map((p) => Math.max(p.red, p.blue)));
  const W = 320;
  const H = 110;
  const PAD = 6;
  const X = (i: number) => PAD + (i / n) * (W - PAD * 2);
  const Y = (v: number) => H - PAD - (Math.log(Math.max(v, 1)) / Math.log(Math.max(max, 2))) * (H - PAD * 2);
  const path = (key: 'red' | 'blue') =>
    pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${X(p.i).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ');

  return (
    <svg class="curvechart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="红蓝价值曲线对比">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.1)" />
      <path d={path('blue')} fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" />
      <path d={path('red')} fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function LabStat(props: { title: string; tone: 'red' | 'blue'; rows: [string, string][] }) {
  return (
    <div class={`labstat is-${props.tone}`}>
      <div class="labstat__head tiny">{props.title}</div>
      {props.rows.map(([k, v]) => (
        <div class="labstat__row" key={k}>
          <span class="mute">{k}</span>
          <span class="mono">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = props.format ? props.format(props.value) : String(props.value);
  return (
    <label class="slider">
      <div class="slider__top">
        <span class="slider__label">{props.label}</span>
        <span class="slider__value mono">
          {display}
          {props.suffix}
        </span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
      />
    </label>
  );
}
