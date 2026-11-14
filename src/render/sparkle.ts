// Sunlight glinting off water: sparse glint points (recorded per ground tile) flash at staggered phases,
// as a single bright pixel or, at the peak, a little four-point star. Only while the sun is up,
// and only in the sun's glitter patch: the stretch of water angled to bounce the sun up to the eye, which
// sits toward the sun from below you (just under you at noon, out toward the horizon as the sun sinks).
// Same pixel size as everything else.

import { hash } from '../core/noise.ts';
import { createPx, plot, type RGBA } from '../core/pixels.ts';
import { CHUNK, WATER } from '../world/ground.ts';
import type { TileLayer } from './tiles.ts';

export const SPARKLE = {
  rate: 0.112, // flashes per second per glint point (all points use the former slow end: one cycle every ~9 s)
  duty: 0.18, // fraction of each cycle a point is lit (≈ 1.6 s at full sun), scaled by sun and glitter patch …
  minOn: 0.45, // … but never below this share of it (≈ 0.7 s): the weakest flashes used to last a few frames
  // Where glints show and how many (the flashes themselves are the same everywhere). The glitter patch
  // lies along the line from the plane toward the sun (sizes as fractions of the view radius): high sun, a
  // patch around you; low sun, it stretches out along that line toward the screen edge (the reflection angle
  // is tighter), with few near the plane and more glint points flashing.
  along: [0.45, 0.75], // [high, low sun] patch extent along the line to the sun
  across: [0.45, 0.3], // [high, low sun] patch extent across it (high sun: the original round patch)
  share: [0.5, 1], // [high, low sun] fraction of glint points that flash at all
};

/** 0 at high sun … 1 at the horizon. */
const lowness = (elevation: number) => Math.min(1, Math.max(0, 1 - elevation / 0.7));
const mix = ([a, b]: number[], k: number) => a + (b - a) * k;

/** 0 = dark, 1 = a glint pixel, 2 = a star (peak of the flash). Pure. */
export function sparkleLevel(phase: number, t: number, sun: number): 0 | 1 | 2 {
  if (sun <= 0) return 0;
  const cycle = (t * SPARKLE.rate + phase * 7.3) % 1; // same slow speed, staggered phases
  // Weak light (low sun, the patch's fringe) makes shorter flashes, but never a mere flicker.
  const on = SPARKLE.duty * (SPARKLE.minOn + (1 - SPARKLE.minOn) * Math.min(1, sun));
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
  const d = r * Math.cos(elevation) * (0.9 + 0.2 * lowness(elevation)); // high sun: under you; low sun: out toward the horizon
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
  const low = lowness(sun.elevation);
  const sa = 2 * (r * mix(SPARKLE.along, low)) ** 2;
  const sc = 2 * (r * mix(SPARKLE.across, low)) ** 2;
  const share = mix(SPARKLE.share, low);
  const { x: tx, y: ty } = sun.toward;
  const cx0 = x0 + side / 2; // the view centre, where the plane is
  const cy0 = y0 + side / 2;
  const near0 = (0.2 * r) ** 2; // squared distance where the ramp starts (clear of the plane) …
  const nearSpan = (0.75 * r) ** 2 - near0; // … and where it is full (about three-quarters of the way to the edge)
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor((y0 + side) / CHUNK); cy++) {
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor((x0 + side) / CHUNK); cx++) {
      const glints = ground.glints(cx, cy);
      if (!glints) continue;
      for (const i of glints) {
        const x = cx * CHUNK + (i % CHUNK);
        const y = cy * CHUNK + Math.floor(i / CHUNK);
        const dx = x - g.x;
        const dy = y - g.y;
        const along = dx * tx + dy * ty;
        const across = dy * tx - dx * ty;
        // How many glint points may flash here (frequency only; each flash is unchanged). Low sun: few
        // close to the plane (the view centre), building up toward the screen edge.
        const u = Math.min(1, Math.max(0, ((x - cx0) ** 2 + (y - cy0) ** 2 - near0) / nearSpan));
        const keep = share * (1 - low * (1 - u * u * (3 - 2 * u))); // smoothstep on squared distance: no sqrt
        if (hash(seed + 29, x, y) >= keep) continue; // cheap early-out before the exp
        const patch = Math.exp(-(along * along) / sa - (across * across) / sc);
        if (patch < 0.05) continue;
        const level = sparkleLevel(hash(seed + 13, x, y), t, sun.strength * patch);
        if (level) ctx.drawImage(sprites[level - 1], x - (level === 2 ? 2 : 1), y - (level === 2 ? 2 : 1));
      }
    }
  }
}
