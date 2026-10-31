import { Hono } from 'hono';
import { ALL_PRESETS } from '../daily.ts';

export const presets = new Hono();

/** 可选的预设局 */
presets.get('/presets', (c) => c.json({ presets: ALL_PRESETS }));
