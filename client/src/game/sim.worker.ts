/// <reference lib="webworker" />
/**
 * 模拟 Worker：在浏览器里跑和服务端同一份 `shared/src/engine.ts`，
 * 录下每一帧全部球的坐标，交给主线程回放。放在 Worker 里是为了
 * 30 秒对局（几十万次球-球碰撞）算的时候不卡页面。
 */
import { simulateWithTracks, type EngineConfig } from '@shared/index.ts';

export interface SimRequest {
  id: number;
  config: EngineConfig;
}

self.onmessage = (ev: MessageEvent<SimRequest>) => {
  const { id, config } = ev.data;
  const t0 = performance.now();
  const out = simulateWithTracks(config, 1 / 30);
  const ms = performance.now() - t0;
  const red = out.tracks.red;
  const blue = out.tracks.blue;
  (self as unknown as Worker).postMessage(
    { id, ms, result: out.result, duration: out.duration, tracks: out.tracks },
    [red.pos.buffer, blue.pos.buffer],
  );
};
