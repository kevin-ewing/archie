// Seeded, deterministic noise. All world randomness comes from here, so a seed always gives the same world.

/** Hash an integer lattice point to [0, 1). */
export function hash(seed: number, x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). One unit = one lattice cell. */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(seed, ix, iy);
  const b = hash(seed, ix + 1, iy);
  const c = hash(seed, ix, iy + 1);
  const d = hash(seed, ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal (fBm) value noise in [0, 1): `octaves` layers, each twice the detail at half the strength. */
export function fbm(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 101, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** 4×4 ordered-dither threshold in (0, 1) for a pixel, so colour bands break up like hand-dithered pixel art. */
export function bayer(x: number, y: number): number {
  return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export type Cell = { f1: number; f2: number; id: number; id2: number; dx: number; dy: number };

/**
 * Cellular (Worley) noise: one jittered point per `size`-px cell. Returns the distance to the nearest
 * and second-nearest point, stable ids in [0, 1) for both, and the offset (dx, dy) from the
 * nearest point to (x, y). f2 − f1 ≈ 0 on cell borders.
 */
export function cellular(seed: number, x: number, y: number, size: number): Cell {
  const ci = Math.floor(x / size);
  const cj = Math.floor(y / size);
  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  let id2 = 0;
  let ndx = 0;
  let ndy = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const dx = x - (i + hash(seed, i, j)) * size;
      const dy = y - (j + hash(seed + 1, i, j)) * size;
      const d = Math.hypot(dx, dy);
      if (d < f1) {
        f2 = f1;
        id2 = id;
        f1 = d;
        id = hash(seed + 2, i, j);
        ndx = dx;
        ndy = dy;
      } else if (d < f2) {
        f2 = d;
        id2 = hash(seed + 2, i, j);
      }
    }
  }
  return { f1, f2, id, id2, dx: ndx, dy: ndy };
}
