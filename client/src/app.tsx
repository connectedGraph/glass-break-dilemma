import { useState } from 'preact/hooks';
import { PlayScreen } from './pages/PlayScreen.tsx';
import { LabScreen } from './pages/LabScreen.tsx';
import { AboutScreen } from './pages/AboutScreen.tsx';
import './app.css';

type Tab = 'play' | 'lab' | 'about';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'play', label: '今日题', hint: '每日一局，押边看结果' },
  { id: 'lab', label: '实验室', hint: '自己调层数与血量' },
  { id: 'about', label: '原理', hint: '为什么 ×2 会反超' },
];

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.replace('#', '');
    return (['play', 'lab', 'about'] as const).includes(h as Tab) ? (h as Tab) : 'play';
  });

  const go = (id: Tab) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div class="app">
      <header class="top">
        <div class="top__brand">
          <span class="top__mark" aria-hidden="true" />
          <div>
            <div class="top__name">玻璃对撞实验室</div>
            <div class="top__sub mono">×2 vs +15</div>
          </div>
        </div>
        <nav class="top__nav" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              class={`top__tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => go(t.id)}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main class="main">
        {tab === 'play' && <PlayScreen />}
        {tab === 'lab' && <LabScreen />}
        {tab === 'about' && <AboutScreen />}
      </main>

      <footer class="foot">
        <span class="mute">确定性物理 · 同 seed 必得同一条轨迹</span>
        <span class="foot__dot" aria-hidden="true">
          ·
        </span>
        <span class="mute">空格播放，← → 跳 2 秒</span>
      </footer>
    </div>
  );
}
