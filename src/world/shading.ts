// Sunlight on the ground, per tile, from the height map: cast shadows (trees and hedges shading the
// ground down-sun of them) and relief lighting (the sun-facing side of each crown lit, the far side
// dark). Re-baked as the sun moves. Pure; runs in the tile worker.

import { bayer } from '../core/noise.ts';
import { CHUNK, HEIGHT_STEPS } from './ground.ts';

export const SHADE = {
  maxHeight: 17, // tallest thing that can cast (tree tops)
  cast: 100, // alpha of a cast shadow (0–255); the scene scales it by sun strength
  dark: 60, // alpha of the shaded side of a crown
  lit: [255, 238, 200, 54] as const, // warm light on the sun-facing side
  relief: 0.09, // how far from flat a slope must face (toward / away) to be lit / shaded
  penumbra: 0.07, // shadow softness: the soft edge widens by this much per px from the thing casting it
};

/** Sun as the shading needs it: horizontal unit vector toward the sun, and its elevation. */
export type ShadeSun = { tx: number; ty: number; elevation: number };

/**
 * RGBA overlay for tile (cx, cy). `heights` is the 3×3 block of tiles around it (3·CHUNK square,
 * ×HEIGHT_STEPS), so shadows cast from a neighbouring tile land correctly.
 */
export function shadeTile(heights: Uint8Array, sun: ShadeSun, cx: number, cy: number): Uint8ClampedArray<ArrayBuffer> {
  const W = 3 * CHUNK;
  const H = (x: number, y: number) => heights[Math.min(W - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] / HEIGHT_STEPS;
  const out = new Uint8ClampedArray(CHUNK * CHUNK * 4);
  const tanEl = Math.tan(sun.elevation);
  const sinEl = Math.sin(sun.elevation);
  const cosEl = Math.cos(sun.elevation);
  const lx = sun.tx * cosEl;
  const ly = sun.ty * cosEl;

  for (let y = 0, i = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++, i += 4) {
      const gx = x + CHUNK;
      const gy = y + CHUNK;
      const h0 = H(gx, gy);
      const d = bayer(cx * CHUNK + x, cy * CHUNK + y) - 0.5;

      // Cast shadow: walk toward the sun; anything rising above the sun ray from here blocks it. Soft
      // edged: how far a blocker pokes above the ray, against a penumbra that widens with distance (so
      // the long shadows of a low sun go soft at their tips). Dithered into a few levels, pixel-style.
      let occlusion = 0;
      const reach = Math.min(CHUNK - 1, (SHADE.maxHeight - h0) / tanEl);
      for (let s = 1; s <= reach && occlusion < 1; s++) {
        const above = H(Math.round(gx + sun.tx * s), Math.round(gy + sun.ty * s)) - (h0 + s * tanEl);
        if (above > 0) occlusion = Math.max(occlusion, above / (0.8 + s * tanEl * SHADE.penumbra * 6 + s * SHADE.penumbra));
      }
      const level = Math.min(3, Math.floor(Math.min(1, occlusion) * 3 + d + 0.5));
      if (level > 0) {
        out[i + 3] = (SHADE.cast * level) / 3;
        continue;
      }

      // Relief: Lambert shading relative to flat ground, dithered at the threshold.
      const sx = (H(gx + 1, gy) - H(gx - 1, gy)) / 2;
      const sy = (H(gx, gy + 1) - H(gx, gy - 1)) / 2;
      const lambert = (-sx * lx - sy * ly + sinEl) / Math.sqrt(sx * sx + sy * sy + 1) - sinEl;
      if (lambert < -SHADE.relief + d * 0.06) out[i + 3] = SHADE.dark;
      else if (lambert > SHADE.relief + d * 0.06) out.set(SHADE.lit, i);
    }
  }
  return out;
}
