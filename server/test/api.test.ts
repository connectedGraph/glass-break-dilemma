import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';

/**
 * API 层测试。直接用 app.request()，不起端口。
 * 数据库用临时文件，避免污染 data/gbd.db。
 */
process.env.GBD_DB = `/tmp/gbd-test-${process.pid}.db`;

const app = createApp();

const json = async (res: Response) => (await res.json()) as any;

test('GET /api/health', async () => {
  const res = await app.request('/api/health');
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.ok, true);
});

test('GET /api/presets 列出三档', async () => {
  const body = await json(await app.request('/api/presets'));
  assert.equal(body.presets.length, 3);
  assert.deepEqual(
    body.presets.map((p: any) => p.id),
    ['standard', 'marathon', 'blitz'],
  );
});

test('GET /api/daily 不泄漏 seed', async () => {
  const res = await app.request('/api/daily?preset=standard');
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(typeof body.layers, 'number');
  assert.ok(Array.isArray(body.values));
  assert.equal(body.seed, undefined, '题面不能带 seed');
  assert.equal(body.config, undefined);
});

test('GET /api/daily 对未知预设返回 400', async () => {
  const res = await app.request('/api/daily?preset=nope');
  assert.equal(res.status, 400);
});

test('GET /api/daily/reveal 返回配置与结算', async () => {
  const body = await json(await app.request('/api/daily/reveal?day=2026-10-31&preset=standard'));
  assert.ok(['R2', 'B15', 'tie'].includes(body.winner));
  assert.equal(typeof body.seed, 'number');
  assert.equal(typeof body.config.gravity, 'number');
  assert.ok(body.red.breaksAt.length > 0);
  assert.ok(body.red.ballCollisions > 0);
  // 不传轨迹：浏览器拿 config 自己算
  assert.equal(body.red.frames, undefined);
});

test('同一天同一预设的揭晓结果稳定', async () => {
  const a = await json(await app.request('/api/daily/reveal?day=2026-10-31&preset=standard'));
  const b = await json(await app.request('/api/daily/reveal?day=2026-10-31&preset=standard'));
  assert.equal(a.winner, b.winner);
  assert.equal(a.red.totalTime, b.red.totalTime);
});

test('不同日期的 seed 不同', async () => {
  const a = await json(await app.request('/api/daily/reveal?day=2026-10-31&preset=standard'));
  const b = await json(await app.request('/api/daily/reveal?day=2026-11-01&preset=standard'));
  assert.notEqual(a.seed, b.seed);
});

test('POST /api/votes 服务端自算胜负，不信客户端', async () => {
  const day = '2026-10-31';
  const reveal = await json(await app.request(`/api/daily/reveal?day=${day}&preset=standard`));
  const wrongGuess = reveal.winner === 'R2' ? 'B15' : 'R2';
  const res = await app.request('/api/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ day, preset: 'standard', guess: wrongGuess, ms: 1200 }),
  });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.vote.correct, false, '押错就该判错');
  assert.equal(body.result.winner, reveal.winner);
});

test('POST /api/votes 押对判对', async () => {
  const day = '2026-11-02';
  const reveal = await json(await app.request(`/api/daily/reveal?day=${day}&preset=blitz`));
  const res = await app.request('/api/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ day, preset: 'blitz', guess: reveal.winner === 'tie' ? 'R2' : reveal.winner, ms: 800 }),
  });
  const body = await json(res);
  assert.equal(body.vote.correct, true);
});

test('POST /api/votes 拒绝非法输入', async () => {
  const res = await app.request('/api/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ day: 'not-a-date', preset: 'standard', guess: 'RED' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/simulate 接受自定义参数', async () => {
  const res = await app.request('/api/simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      layers: 6,
      values: [2, 3, 5, 8, 13, 21],
      seed: 424242,
    }),
  });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.ok(body.red.totalTime > 0);
  assert.ok(['R2', 'B15', 'tie'].includes(body.winner));
});

test('POST /api/simulate 越界参数被拒', async () => {
  const res = await app.request('/api/simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ layers: 999, values: [1], seed: 1 }),
  });
  assert.equal(res.status, 400);
});

test('GET /api/stats 统计押注比例', async () => {
  const body = await json(await app.request('/api/stats?day=2026-10-31&preset=standard'));
  assert.equal(typeof body.total, 'number');
  assert.equal(typeof body.redPct, 'number');
  assert.ok(body.redPct >= 0 && body.redPct <= 100);
});

test('GET /api/curve 给出两条数学模型', async () => {
  const body = await json(await app.request('/api/curve?n=10'));
  assert.equal(body.breaks.length, 11);
  assert.equal(body.red[3], 8);
  assert.equal(body.blue[3], 46);
});

test('未知路由返回 404 JSON', async () => {
  const res = await app.request('/api/nothing-here');
  assert.equal(res.status, 404);
});
