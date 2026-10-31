import './about.css';

/**
 * 原理页：解释为什么 ×2（球数翻倍）和 +15（球数加十五）会在某一点交叉，
 * 以及为什么实际对局比纯数学更早/更晚结束。
 */
export function AboutScreen() {
  return (
    <article class="about">
      <header class="about__head rise">
        <div class="tiny">原理</div>
        <h1 class="about__title display">复利与直线的交叉点</h1>
        <p class="about__lede">
          这个问题看着像玄学，其实只有一条主线：每破一块玻璃，红方的球数翻倍，蓝方的球数加十五。
          翻倍是复利，加十五是直线，两条曲线一定会在某处交叉。剩下的事就是问——
          玻璃堆够不够长，让红方走到那个交叉点之前先别被甩开。
        </p>
      </header>

      <Section n="01" title="两条曲线">
        <p>
          开局双方各 1 颗球。每破一块玻璃，红方球数乘以 2，蓝方球数加 15。
          破完第 n 块之后：
        </p>
        <Formula>
          <span class="is-red">RED(n) = 2ⁿ</span>
          <span class="is-blue">BLUE(n) = 1 + 15n</span>
        </Formula>
        <p>
          蓝方从第一块就甩开一大截（1 → 16 → 31 → 46），红方则是 1 → 2 → 4 → 8 → 16 → 32。
          直到第 7 块，2⁷ = 128 才第一次超过 1 + 15×7 = 106。
        </p>
        <Table
          head={['破镜数', 'RED ×2', 'BLUE +15', '领先']}
          rows={[
            ['0', '1', '1', '平'],
            ['1', '2', '16', '蓝'],
            ['2', '4', '31', '蓝'],
            ['3', '8', '46', '蓝'],
            ['5', '32', '76', '蓝'],
            ['6', '64', '91', '蓝'],
            ['7', '128', '106', '红'],
            ['8', '256', '121', '红'],
            ['10', '1024', '151', '红'],
          ]}
        />
      </Section>

      <Section n="02" title="球数就是砸击频率">
        <p>
          球数不是分数，是<b>火力</b>。每一颗球在通道里来回弹，撞到最上面那块玻璃就扣 1 点血。
          球越多，单位时间砸得越多，破得越快。
        </p>
        <ul class="about__list">
          <li>
            <b>红方开局几乎真空。</b>只有 1 颗球，第一块 6 血的玻璃要砸 6 下，
            一次上下将近一秒；前十几秒红方只有个位数的球。
          </li>
          <li>
            <b>蓝方第一块碎掉就铺满。</b>球数从 1 直接跳到 16，
            第二、三块玻璃几乎是瞬间清空——这就是原视频里蓝方「一路碾压」的来源。
          </li>
          <li>
            <b>红方靠复利追。</b>第 7 块以后球数到 128、256，再到通道容量 512，
            前 12 块一直落后（第 12 块还慢 4 秒左右），最后一块 1246 血上靠 512 颗球反超。
          </li>
        </ul>
        <p>
          所以胜负不是「谁的最终球数大」，而是<b>两条火力曲线谁先清完整堆</b>。
          层数够多、血量曲线够缓，红方就能活到反超；否则蓝方在交叉点之前就冲线了。
        </p>
      </Section>

      <Section n="03" title="这个项目在算什么">
        <p>
          服务端和浏览器跑的是同一份物理内核（<code>shared/src/engine.ts</code>），不是动画，也不是预设轨迹：
        </p>
        <ul class="about__list">
          <li>每颗球独立积分，固定 1/120 秒步长：重力、侧壁、顶板、玻璃顶面。</li>
          <li>球与球之间做真实碰撞：均匀网格找邻居，逐对解法向冲量（等质量、完全弹性）并分离重叠。一局三十秒有十几万次。</li>
          <li>玻璃顶面是弹力地板：球落上去会被送回顶板附近，所以球群一直在上下弹，不会越堆越低。</li>
          <li>落下来的竖直速度够大才算一次撞击、扣 1 点血；碎了就按本方规则改球数，新球从顶板下面一串串落下。</li>
          <li>通道最多容纳 512 颗球，两边相同。</li>
        </ul>
      </Section>

      <Section n="04" title="浏览器里看到的就是判胜用的那一局">
        <p>
          揭晓时服务端只下发配置（含 seed）和结算。浏览器在 Web Worker 里用同一份代码重跑整局，
          录下每 1/30 秒<b>全部</b>球的坐标再回放，然后把自己算出的胜负、打穿时间、撞击次数
          和服务端的结算逐位比对，画面下方会显示比对结果。
        </p>
        <p>
          能逐位一致是因为物理热路径只用加减乘除和开方——这几种运算 IEEE 754 规定了唯一结果。
          角度扰动用多项式代替 <code>Math.sin</code> / <code>Math.cos</code>，
          因为不同浏览器的三角函数可以差最后一位，而几百颗球互相碰撞是混沌系统，差一位最后就会差一个胜负。
        </p>
      </Section>

      <Section n="05" title="每日一局的公平性">
        <p>
          每天的 seed 由「日期 + 预设」哈希出来，只存在服务端。
          题面接口只给层数、血量和双方规则，不给 seed，所以浏览器拿不到答案。
        </p>
        <p>
          押注提交后，服务端自己跑一遍模拟、判定对错，再把结果和帧序列返回。
          客户端说的胜负一律不信。
        </p>
      </Section>

      <Section n="06" title="还没做的">
        <ul class="about__list">
          <li>跨日排行榜：目前只有当日的押注比例。</li>
          <li>移动端手势拖动进度条、长按倍速。</li>
        </ul>
      </Section>
    </article>
  );
}

function Section(props: { n: string; title: string; children: any }) {
  return (
    <section class="about__sec rise">
      <div class="about__num mono">{props.n}</div>
      <h2 class="about__h2">{props.title}</h2>
      <div class="about__body">{props.children}</div>
    </section>
  );
}

function Formula(props: { children: any }) {
  return <div class="formula mono">{props.children}</div>;
}

function Table(props: { head: string[]; rows: string[][] }) {
  return (
    <div class="about__tablewrap">
      <table class="about__table mono">
        <thead>
          <tr>
            {props.head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  class={
                    j === 3
                      ? c === '蓝'
                        ? 'is-blue'
                        : c === '红'
                          ? 'is-red'
                          : 'mute'
                      : ''
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
