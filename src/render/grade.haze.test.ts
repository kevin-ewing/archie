import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFor, gradePixels, skyFor } from './grade.ts';
import { dateOf } from '../sim/calendar.ts';
import { sunDay } from '../sim/sun.ts';
import { sunAt, sunsetHour } from '../sim/daylight.ts';

// The haze veil as it was first written (per pixel, every repaint): the reference the kept-bands version must match exactly.
const BANDS = 9;
const DITHER = Float32Array.from({ length: 16 }, (_, i) => ((([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][((i >> 2) << 2) | (i & 3)] + 0.5) / 16) - 0.5) * 0.9);
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
function referenceVeil(glow: Uint8ClampedArray, w: number, h: number, haze: number, R: number) {
  const G = new Uint32Array(glow.buffer);
  const cx = w / 2, cy = h / 2, top = haze * 0.25, [hr, hg, hb] = [0xc8, 0xd2, 0xe0];
  for (let y = 0, i = 0; y < h; y++) {
    const row = (y & 3) << 2;
    for (let x = 0; x < w; x++, i++) {
      const t = smooth((Math.hypot(x - cx, y - cy) / R - 0.35) / 0.65);
      if (t <= 0) continue;
      const band = Math.min(BANDS - 1, Math.max(0, ((t * (BANDS - 1)) + DITHER[row | (x & 3)] + 0.5) | 0));
      const a2 = (top * band) / (BANDS - 1);
      if (a2 <= 0) continue;
      if (G[i] >>> 24 === 0) { G[i] = ((Math.round(a2 * 255) << 24) | (Math.round(hb) << 16) | (Math.round(hg) << 8) | Math.round(hr)) >>> 0; continue; }
      const o = i * 4, a1 = glow[o + 3] / 255, a = a1 + a2 * (1 - a1), k = (a2 * (1 - a1)) / a;
      glow[o] = glow[o] + (hr - glow[o]) * k; glow[o + 1] = glow[o + 1] + (hg - glow[o + 1]) * k; glow[o + 2] = glow[o + 2] + (hb - glow[o + 2]) * k; glow[o + 3] = a * 255;
    }
  }
}

test('the haze veil with its banding kept is pixel for pixel the veil worked out afresh, day and dusk, any size', () => {
  for (const [day, offset] of [[0, -3], [0, -0.3], [256, -0.4], [256, -4], [150, 0.2]] as const) {
    const sd = sunDay(dateOf(day));
    const sun = sunAt(sd, sunsetHour(sd) + offset);
    for (const haze of [0.05, 0.24, 0.6]) {
      const g = gradeFor(sun, skyFor(1915, day, sun.evening, -0.5), { skyBias: -0.5, haze });
      for (const [w, h] of [[181, 181], [240, 160], [181, 181]]) { // (the same size twice: the kept bands are reused)
        const R = Math.hypot(w, h) / 2;
        const got = gradePixels(w, h, g, { x: 1, y: 0 }, undefined, R);
        const want = gradePixels(w, h, { ...g, haze: 0 }, { x: 1, y: 0 }, undefined, R);
        referenceVeil(want.glow, w, h, haze, R);
        assert.deepEqual(got.glow, want.glow, `day ${day}, ${offset} h from sunset, haze ${haze}, ${w}x${h}`);
        assert.deepEqual(got.tint, want.tint);
      }
    }
  }
});
