// Sunlight glinting off water: sparse glint points (recorded per ground tile) flash briefly at their own
// rhythm, as a single bright pixel or, at the peak, a little four-point star. Only while the sun is up,
// and only in the sun's glitter patch: the stretch of water angled to bounce the sun up to the eye, which
// sits toward the sun from below you (just under you at noon, out toward the horizon as the sun sinks).
// Same pixel size as everything else.

import { hash } from '../core/noise.ts';
import { createPx, plot, type RGBA } from '../core/pixels.ts';
import { CHUNK, WATER } from '../world/ground.ts';
import type { TileLayer } from './tiles.ts';

export const SPARKLE = {
  rate: 0.16, // flashes per second per glint point (each point flashes every ~6 s)
  duty: 0.09, // fraction of each cycle a point is lit (≈ 0.55 s at full sun), scaled by sun and glitter patch
  patch: 0.45, // glitter patch size, as a fraction of the view radius
};

/** 0 = dark, 1 = a glint pixel, 2 = a star (peak of the flash). Pure. */
export function sparkleLevel(phase: number, t: number, sun: number): 0 | 1 | 2 {
  const cycle = (t * SPARKLE.rate * (0.7 + phase * 0.6) + phase * 7.3) % 1; // each point its own speed and phase
  const on = SPARKLE.duty * sun;
  if (cycle >= on) return 0;
  return Math.abs(cycle / on - 0.5) < 0.2 ? 2 : 1;
}

export type SparkleSprites = [HTMLCanvasElement, HTMLCanvasElement]; // glint, star

export function createSparkleSprites(): SparkleSprites {
  const hot: RGBA = [0xf6, 0xf4, 0xea, 255];
  const arm: RGBA = [...WATER.glint, 255];
  const make = (draw: (px: ReturnType<typeof createPx>) => void, size: number) => {
    const px = createPx(size, size);
    draw(px);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d')!.putImageData(new ImageData(px.data, size, size), 0, 0);
    return canvas;
  };
  // Both have a 1-px transparent border (they're drawn rotated with the world).
  return [make((px) => plot(px, 1, 1, hot), 3), make((px) => [[2, 2], [1, 2], [3, 2], [2, 1], [2, 3]].forEach(([x, y], i) => plot(px, x, y, i ? arm : hot)), 5)];
}

/** Where the glitter patch is (world coords) for a view centred on (cx, cy) of radius r. */
export function glitterCentre(cx: number, cy: number, r: number, toward: { x: number; y: number }, elevation: number) {
  const d = r * 0.9 * Math.cos(elevation); // high sun: under you; low sun: out toward the horizon
  return { x: cx + toward.x * d, y: cy + toward.y * d };
}

/** Draw the sparkle on every visible ground tile, in the current world transform. */
export function drawSparkle(
  ctx: CanvasRenderingContext2D,
  ground: TileLayer,
  sprites: SparkleSprites,
  view: { x0: number; y0: number; side: number; r: number },
  t: number,
  sun: { strength: number; toward: { x: number; y: number }; elevation: number },
  seed: number,
): void {
  if (sun.strength <= 0) return;
  const { x0, y0, side, r } = view;
  const g = glitterCentre(x0 + side / 2, y0 + side / 2, r, sun.toward, sun.elevation);
  const spread = 2 * (r * SPARKLE.patch) ** 2;
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor((y0 + side) / CHUNK); cy++) {
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor((x0 + side) / CHUNK); cx++) {
      const glints = ground.glints(cx, cy);
      if (!glints) continue;
      for (const i of glints) {
        const x = cx * CHUNK + (i % CHUNK);
        const y = cy * CHUNK + Math.floor(i / CHUNK);
        const patch = Math.exp(-((x - g.x) ** 2 + (y - g.y) ** 2) / spread);
        if (patch < 0.05) continue;
        const level = sparkleLevel(hash(seed + 13, x, y), t, sun.strength * patch);
        if (level) ctx.drawImage(sprites[level - 1], x - (level === 2 ? 2 : 1), y - (level === 2 ? 2 : 1));
      }
    }
  }
}
