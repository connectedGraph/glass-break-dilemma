import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { ALL_PRESETS } from './daily.ts';
import { presets } from './routes/presets.ts';
import { daily } from './routes/daily.ts';
import { simulateRoute } from './routes/simulate.ts';
import { stats } from './routes/stats.ts';
import { votes } from './routes/votes.ts';
import { serveStatic } from './static.ts';
import { gzipMiddleware } from './compress.ts';

/**
 * 应用装配。拆出来是为了测试里能直接 app.request() 而不用起端口。
 */
export function createApp() {
  const app = new Hono();

  app.use('/api/*', cors());
  app.use('/api/*', gzipMiddleware());

  app.get('/api/health', (c) =>
    c.json({ ok: true, service: 'glass-break-dilemma', version: '0.1.0', now: new Date().toISOString() }),
  );

  app.route('/api', presets);
  app.route('/api', daily);
  app.route('/api', simulateRoute);
  app.route('/api', stats);
  app.route('/api', votes);

  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

  app.onError((err, c) => {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'invalid_request', issues: z.treeifyError(err) }, 400);
    }
    console.error('[gbd] unhandled', err);
    return c.json({ error: 'internal', message: err.message }, 500);
  });

  serveStatic(app);
  return app;
}
