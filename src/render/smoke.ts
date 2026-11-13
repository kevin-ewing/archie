// Exhaust smoke from a struggling engine: puffs left behind in the world, growing and fading.
// Light grey wisps when running hot on full power; thick dark smoke once overheated.
// Puffs are small pre-drawn pixel sprites (same pixel size as everything else).

import { hash } from '../core/noise.ts';
import { createPx, disc, type RGBA } from '../core/pixels.ts';
import type { Plane } from '../sim/flight.ts';

export const SMOKE = {
  rate: [0, 5, 16], // puffs per second at engine warning 0, 1, 2
  life: 1.8, // seconds
  max: 80,
  drift: { x: 0.6, y: 0.3 }, // world px / s
  exhaust: 7, // px ahead of the plane's centre: the exhaust stacks by the engine
};

type Puff = { x: number; y: number; age: number; dark: boolean; seed: number };
export type Smoke = { puffs: Puff[]; owed: number; n: number };

export const createSmoke = (): Smoke => ({ puffs: [], owed: 0, n: 0 });

export function updateSmoke(s: Smoke, p: Plane, warning: 0 | 1 | 2, dt: number): void {
  for (const puff of s.puffs) {
    puff.age += dt;
    puff.x += SMOKE.drift.x * dt;
    puff.y += SMOKE.drift.y * dt;
  }
  s.puffs = s.puffs.filter((puff) => puff.age < SMOKE.life);
  s.owed += SMOKE.rate[warning] * dt;
  while (s.owed >= 1 && s.puffs.length < SMOKE.max) {
    s.owed -= 1;
    s.n++;
    const side = (hash(5, s.n, 0) - 0.5) * 6; // either exhaust stack
    const ex = p.x + Math.sin(p.heading) * SMOKE.exhaust + Math.cos(p.heading) * side;
    const ey = p.y - Math.cos(p.heading) * SMOKE.exhaust + Math.sin(p.heading) * side;
    s.puffs.push({ x: ex, y: ey, age: 0, dark: warning === 2, seed: s.n });
  }
  if (s.owed > 1) s.owed = 1; // don't bank puffs while at the cap
}

export type SmokeSprites = HTMLCanvasElement[][]; // [dark ? 1 : 0][size]

const SIZES = [1.2, 2, 2.8, 3.6];
export function createSmokeSprites(): SmokeSprites {
  const tones: [RGBA, RGBA][] = [
    [[0xc8, 0xc6, 0xbe, 255], [0xa8, 0xa6, 0x9e, 255]], // light wisp
    [[0x3a, 0x38, 0x34, 255], [0x24, 0x23, 0x20, 255]], // dark smoke
  ];
  return tones.map(([lit, shade]) =>
    SIZES.map((r) => {
      const size = Math.ceil(r) * 2 + 3; // + transparent border (drawn rotated)
      const c = (size - 1) / 2;
      const px = createPx(size, size);
      disc(px, c, c, r, (dx, dy) => (dx + dy < 0 ? lit : shade));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.putImageData(new ImageData(px.data, size, size), 0, 0);
      return canvas;
    }),
  );
}

/** Draw in the current world transform. */
export function drawSmoke(ctx: CanvasRenderingContext2D, s: Smoke, sprites: SmokeSprites): void {
  for (const puff of s.puffs) {
    const f = puff.age / SMOKE.life;
    const img = sprites[puff.dark ? 1 : 0][Math.min(SIZES.length - 1, Math.floor(f * SIZES.length))];
    ctx.globalAlpha = (1 - f) * (puff.dark ? 0.75 : 0.45);
    ctx.drawImage(img, Math.round(puff.x - img.width / 2), Math.round(puff.y - img.height / 2));
  }
  ctx.globalAlpha = 1;
}
