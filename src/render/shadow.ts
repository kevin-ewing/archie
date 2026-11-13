// The plane's cast shadow. A flat-ish plane's shadow on flat ground is its silhouette, shifted down-sun
// by altitude × the sun's shadow length; so it's drawn as a pre-made soft silhouette sprite at that
// exact (sub-pixel) spot, gliding smoothly with no per-frame rasterising (which used to shimmer and cost
// ~250k ray tests a frame). Over raised ground (trees, hedges) the shadow lands closer to the plane: the
// height under it is sampled and eased, so it slides in and out rather than snapping.

import { SPRITE_H, SPRITE_W } from './plane.ts';

export const ALTITUDE = 70; // plane height above the ground, world px
export const SHADOW_EASE = 0.25; // seconds for the shadow to settle onto a new ground height

/** Where the shadow's centre falls, for a plane at (px, py), a sun shadow vector, and the ground height there. */
export function shadowCentre(px: number, py: number, sun: { x: number; y: number }, groundHeight: number, altitude = ALTITUDE) {
  const drop = Math.max(0, altitude - groundHeight);
  return { x: px + sun.x * drop, y: py + sun.y * drop };
}

/** Ground height under the shadow: the highest of a few samples across it (crowns catch it first). */
export function heightUnder(heightAt: (x: number, y: number) => number, x: number, y: number): number {
  const r = 6;
  let h = 0;
  for (const [dx, dy] of [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r]]) h = Math.max(h, heightAt(Math.round(x + dx), Math.round(y + dy)));
  return h;
}

/** Ease the remembered ground height toward a new sample. */
export const easeHeight = (current: number, target: number, dt: number) => current + (target - current) * (1 - Math.exp(-dt / SHADOW_EASE));

/**
 * Soft silhouettes from a mask (SPRITE_W×SPRITE_H, 1 = solid): solid core plus a dithered fringe of
 * `blur` px, in a few alpha levels (pixel style). Returns RGBA with a transparent border (drawn rotated).
 */
export function softSilhouette(mask: Uint8Array, blur: number): { w: number; h: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const pad = blur + 1;
  const w = SPRITE_W + 2 * pad;
  const h = SPRITE_H + 2 * pad;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < SPRITE_W && y < SPRITE_H && mask[y * SPRITE_W + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      let total = 0;
      for (let dy = -blur; dy <= blur; dy++) for (let dx = -blur; dx <= blur; dx++, total++) if (solid(x - pad + dx, y - pad + dy)) n++;
      const cover = n / total;
      const level = Math.round(cover * 3) / 3; // 0, ⅓, ⅔, 1: soft edge in crisp steps
      rgba[(y * w + x) * 4 + 3] = level * 255;
    }
  }
  return { w, h, rgba };
}
