import { gzipSync } from 'node:zlib';
import type { Context, Next } from 'hono';

/**
 * 极简 gzip 中间件。
 *
 * 揭开每日题面时会返回几百 KB 的回放帧（球坐标随机，压缩率有限但仍有 2×），
 * 不压缩的话移动端要等好几秒。只对 JSON 且体量超过 1KB 的响应开压缩。
 */
export function gzipMiddleware() {
  return async (c: Context, next: Next) => {
    await next();
    const res = c.res;
    if (!res || res.status !== 200) return;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return;
    const accept = c.req.header('accept-encoding') ?? '';
    if (!accept.includes('gzip')) return;

    const buf = new Uint8Array(await res.clone().arrayBuffer());
    if (buf.byteLength < 1024) return;

    const zipped = gzipSync(buf, { level: 6 });
    const headers = new Headers(res.headers);
    headers.set('content-encoding', 'gzip');
    headers.set('vary', 'accept-encoding');
    headers.set('content-length', String(zipped.byteLength));
    c.res = new Response(zipped, { status: res.status, headers });
  };
}
