// Lamplight drawn each frame: one small glow bitmap per lit window (like the water sparkle), so every flame
// can flicker on its own. Same pixel size as everything else: the glow is a pixel bitmap with crisp rings,
// drawn at whole world pixels in the world transform. Its brightness is the bitmap's alpha, and it's added
// ('lighter') onto the dusk so it reads as light, not paint. The lamp list per tile is cached.

import { CHUNK } from '../world/ground.ts';
import { lampLevel, lampsIn, type Lamp } from '../world/lights.ts';

const R = 6; // glow radius, world px
/** Rings from the flame out: [radius, colour, alpha]. Warm amber rather than yellow, softly spread. */
const GLOW: readonly [r: number, rgb: readonly [number, number, number], alpha: number][] = [
  [1, [255, 212, 168], 255], // the flame-lit window itself, near white
  [2, [246, 150, 86], 190],
  [3.2, [214, 110, 62], 120],
  [4.6, [170, 80, 48], 64],
  [R, [120, 56, 40], 28], // the faint spill over the ground
];

export function createLampSprite(): HTMLCanvasElement {
  const size = 2 * R + 3; // 1-px transparent border (drawn rotated with the world)
  const data = new Uint8ClampedArray(size * size * 4);
  const mid = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = GLOW.find(([r]) => Math.hypot(x + 0.5 - mid, y + 0.5 - mid) < r);
      if (!g) continue;
      data.set(g[1], (y * size + x) * 4);
      data[(y * size + x) * 4 + 3] = g[2];
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.putImageData(new ImageData(data, size, size), 0, 0);
  return canvas;
}

const cache = new Map<string, Lamp[]>();

/**
 * Draw every lamp in the square [x0, x0+side)² (world px), in the current world transform, at `minutes`
 * from sunset and `t` seconds. Additive: call it on a cleared buffer, or straight onto the scene.
 */
export function drawLamps(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, seed: number, x0: number, y0: number, side: number, minutes: number, t: number, density: number, fronts: boolean): void {
  const half = sprite.width >> 1;
  ctx.globalCompositeOperation = 'lighter';
  for (let cy = Math.floor((y0 - R) / CHUNK); cy <= Math.floor((y0 + side + R) / CHUNK); cy++) {
    for (let cx = Math.floor((x0 - R) / CHUNK); cx <= Math.floor((x0 + side + R) / CHUNK); cx++) {
      const key = `${seed},${density},${fronts},${cx},${cy}`;
      let lamps = cache.get(key);
      if (!lamps) {
        if (cache.size > 4000) cache.clear();
        lamps = lampsIn(seed, cx, cy, density, fronts);
        cache.set(key, lamps);
      }
      for (const l of lamps) {
        const a = lampLevel(l, minutes, t);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, l.x - half, l.y - half);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
