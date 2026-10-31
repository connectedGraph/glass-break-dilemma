import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * 生产模式：把客户端构建产物 client/dist 挂在根路径。
 *
 * 注意 @hono/node-server 的 serveStatic 依赖「当前工作目录」相对路径，
 * 从其他目录启动就找不到文件。这里自己实现，用绝对路径，行为稳定。
 */

const dist = resolve(import.meta.dirname, '../../client/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export function serveStatic(app: Hono) {
  if (!existsSync(dist)) {
    app.get('/', (c) =>
      c.text('客户端还没构建。开发时请访问 Vite（./run.sh dev），或先 ./run.sh build。'),
    );
    return;
  }

  app.get('*', async (c) => {
    const path = c.req.path;
    if (path.startsWith('/api/')) return c.notFound();

    // 归一化，挡掉 ../ 穿越
    const rel = normalize(path).replace(/^(\.\.[/\\])+/, '');
    const file = join(dist, rel);

    // 目录或不存在 → SPA 回退到 index.html
    if (!existsSync(file) || rel === '/' || rel === '.' || rel === '') {
      return html(c, await readFile(join(dist, 'index.html'), 'utf8'));
    }

    const ext = extname(file).toLowerCase();
    const type = MIME[ext];

    if (type) {
      const body = await readFile(file);
      // 带 hash 的产物长缓存，其余不缓存
      const immutable = path.startsWith('/assets/');
      return c.body(body, 200, {
        'content-type': type,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    }

    return html(c, await readFile(join(dist, 'index.html'), 'utf8'));
  });
}

function html(c: any, body: string) {
  return c.html(body, 200, { 'cache-control': 'no-cache' });
}
