// Semi-transparent, wispy pixel-art clouds from noise. Same pixel size as the ground and plane;
// parallax only moves them faster. Soft edges come from many faint alpha levels, dithered, plus fine
// noise that frays the fringe and a domain warp that pulls the shapes into streaks and curls.

import { bayer, fbm, valueNoise } from '../core/noise.ts';
import { CHUNK } from './ground.ts';

const COVER = 0.7; // higher = fewer clouds
const LEVELS = [
  [0xc4, 0xc9, 0xcc, 18], // faint wisp, slightly shadowed
  [0xcf, 0xd3, 0xd5, 34],
  [0xda, 0xdd, 0xdf, 54],
  [0xe5, 0xe7, 0xe8, 78],
  [0xee, 0xef, 0xef, 102],
  [0xf5, 0xf5, 0xf3, 126], // dense core
] as const;

/** Cloud density level at a cloud-space pixel: -1 = clear sky, else an index into LEVELS. */
export function cloudLevel(seed: number, x: number, y: number): number {
  const wx = x + (fbm(seed + 71, x / 160, y / 160, 3) - 0.5) * 140;
  const wy = y + (fbm(seed + 72, x / 160, y / 160, 3) - 0.5) * 140;
  let c = Math.min(1, Math.max(0, (fbm(seed + 70, wx / 460, wy / 280, 5) - 0.5) * 2.4 + 0.5)); // streaked along the wind
  c += (valueNoise(seed + 73, x / 10, y / 10) - 0.5) * 0.12 + (valueNoise(seed + 74, x / 3.5, y / 3.5) - 0.5) * 0.06;
  const density = (c - COVER) / (1 - COVER);
  if (density <= 0) return -1;
  // Dithering the low end turns the fringe into scattered faint pixels rather than a hard line.
  const level = Math.floor(Math.pow(density, 0.85) * LEVELS.length * 1.1 + bayer(x, y) - 0.6);
  return Math.min(LEVELS.length - 1, level);
}

/**
 * A cloud-shadow tile: the same clouds, in the same cloud space, as a dark silhouette. The scene draws
 * it with the cloud layer's own transform, shifted down-sun, so each shadow is exactly its cloud's shape.
 */
export const CLOUD_SHADOW_ALPHA = [0, 40, 70, 100, 125, 145, 160];
export function cloudShadowChunk(seed: number, cx: number, cy: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(CHUNK * CHUNK * 4); // black, alpha by cloud density
  for (let y = 0, i = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++, i += 4) out[i + 3] = CLOUD_SHADOW_ALPHA[cloudLevel(seed, cx * CHUNK + x, cy * CHUNK + y) + 1];
  }
  return out;
}

export function cloudChunk(seed: number, cx: number, cy: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(CHUNK * CHUNK * 4); // starts fully transparent
  for (let y = 0, i = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++, i += 4) {
      const level = cloudLevel(seed, cx * CHUNK + x, cy * CHUNK + y);
      if (level < 0) continue;
      out.set(LEVELS[level], i);
    }
  }
  return out;
}
