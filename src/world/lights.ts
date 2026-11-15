// Lamplight in the farms and cottages around sunset: a warm glow under a window or an open door,
// switching on house by house from just before the sun goes down and off again a little after dusk (oil
// lamps were costly, and near the front lights drew fire). Many windows stay dark. Each flame flickers on
// its own. This module only says where the lamps are and how bright each is; render/lamps.ts draws them.

import { hash, valueNoise } from '../core/noise.ts';
import { CHUNK } from './ground.ts';
import { DEV } from './settings.ts';
import { structuresNear } from './structures.ts';

/** Minutes from sunset (negative = before) during which any window may be lit. */
export const LIGHTS = { from: -20, to: 95, fade: 4 }; // fade: game minutes for a lamp to come up or go down
const LIT = 0.6; // share of windows that light up at all
const FLICKER = { speed: 3, depth: 0.3 }; // flame wavers per second; how far it dips

/** One lamp-lit window: world position, when it's on (minutes from sunset), its own flicker phase. */
export type Lamp = { x: number; y: number; on: number; off: number; phase: number };

/** The lamps of every home touching tile (cx, cy). Deterministic per seed (and development density). */
export function lampsIn(seed: number, cx: number, cy: number, density = 1, fronts = false): Lamp[] {
  DEV.density = density;
  DEV.fronts = fronts;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const out: Lamp[] = [];
  for (const s of structuresNear(seed, x0, y0, x0 + CHUNK, y0 + CHUNK)) {
    // Only the tile holding the site's centre lists its lamps, so none is drawn twice.
    if (s.ruined || Math.floor(s.x / CHUNK) !== cx || Math.floor(s.y / CHUNK) !== cy) continue;
    const homes = s.kind === 'farm' ? s.parts.slice(0, 1) : s.kind === 'cottage' || s.kind === 'hamlet' ? s.parts.filter((p) => p.style !== 'lean') : [];
    const c = Math.cos(s.angle);
    const sn = Math.sin(s.angle);
    homes.forEach((p, k) => {
      for (let n = 0; n < 2; n++) {
        const h = (m: number) => hash(s.id + 600 + m, k, n);
        if (h(0) > LIT) continue;
        const along = (h(3) - 0.5) * 1.4; // somewhere along a long wall, never right at the corner
        const side = h(4) < 0.5 ? -1 : 1;
        const longX = p.hw >= p.hh;
        const lx = p.x + (longX ? along * p.hw : side * (p.hw + 2));
        const ly = p.y + (longX ? side * (p.hh + 2) : along * p.hh);
        out.push({
          x: Math.round(s.x + lx * c - ly * sn),
          y: Math.round(s.y + lx * sn + ly * c),
          on: LIGHTS.from + h(1) * 35, // lamps lit one by one around sunset…
          off: 30 + h(2) * (LIGHTS.to - 30), // …and put out one by one after dusk
          phase: h(5) * 1000,
        });
      }
    });
  }
  return out;
}

/** How bright a lamp is, 0 … 1, at `minutes` from sunset and `t` seconds: up, flickering, then down. */
export function lampLevel(l: Lamp, minutes: number, t: number): number {
  const up = Math.min(1, Math.max(0, Math.min(minutes - l.on, l.off - minutes) / LIGHTS.fade));
  if (up <= 0) return 0;
  const waver = valueNoise(l.phase, t * FLICKER.speed, 0) * 0.6 + valueNoise(l.phase + 1, t * FLICKER.speed * 2.7, 0) * 0.4;
  return up * (1 - FLICKER.depth * waver);
}
