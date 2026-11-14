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

export type Cell = { f1: number; f2: number; id: number; id2: number; dx: number; dy: number; dx2: number; dy2: number };

/**
 * Cellular (Worley) noise: one jittered point per `size`-px cell. Returns the distance to the nearest
 * and second-nearest point, stable ids in [0, 1) for both, and the offsets (dx, dy) and (dx2, dy2)
 * from those points to (x, y). f2 − f1 ≈ 0 on cell borders.
 */
export function cellular(seed: number, x: number, y: number, size: number): Cell {
  const ci = Math.floor(x / size);
  const cj = Math.floor(y / size);
  let f1Sq = Infinity;
  let f2Sq = Infinity;
  let id = 0;
  let id2 = 0;
  let ndx = 0;
  let ndy = 0;
  let ndx2 = 0;
  let ndy2 = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const dx = x - (i + hash(seed, i, j)) * size;
      const dy = y - (j + hash(seed + 1, i, j)) * size;
      const dSq = dx * dx + dy * dy;
      if (dSq < f1Sq) {
        f2Sq = f1Sq;
        id2 = id;
        ndx2 = ndx;
        ndy2 = ndy;
        f1Sq = dSq;
        id = hash(seed + 2, i, j);
        ndx = dx;
        ndy = dy;
      } else if (dSq < f2Sq) {
        f2Sq = dSq;
        id2 = hash(seed + 2, i, j);
        ndx2 = dx;
        ndy2 = dy;
      }
    }
  }
  return { f1: Math.sqrt(f1Sq), f2: Math.sqrt(f2Sq), id, id2, dx: ndx, dy: ndy, dx2: ndx2, dy2: ndy2 };
}

/**
 * `cellular` for many points inside one rectangle (a tile): the jittered cell points are hashed once
 * up front, so each query is just a 3×3 scan of arrays. Same results as `cellular` for points inside
 * [x0, x1) × [y0, y1). The returned Cell object is reused between calls (read it before the next one).
 */
export function cellularField(seed: number, size: number, x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => Cell {
  const i0 = Math.floor(x0 / size) - 1;
  const j0 = Math.floor(y0 / size) - 1;
  const ni = Math.floor(x1 / size) + 2 - i0;
  const nj = Math.floor(y1 / size) + 2 - j0;
  const px = new Float64Array(ni * nj);
  const py = new Float64Array(ni * nj);
  const pid = new Float64Array(ni * nj);
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const k = j * ni + i;
      px[k] = (i0 + i + hash(seed, i0 + i, j0 + j)) * size;
      py[k] = (j0 + j + hash(seed + 1, i0 + i, j0 + j)) * size;
      pid[k] = hash(seed + 2, i0 + i, j0 + j);
    }
  }
  const out: Cell = { f1: 0, f2: 0, id: 0, id2: 0, dx: 0, dy: 0, dx2: 0, dy2: 0 };
  return (x, y) => {
    const ci = Math.floor(x / size) - i0;
    const cj = Math.floor(y / size) - j0;
    let f1 = Infinity;
    let f2 = Infinity;
    let id = 0;
    let id2 = 0;
    let ndx = 0;
    let ndy = 0;
    let ndx2 = 0;
    let ndy2 = 0;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const k = j * ni + i;
        const dx = x - px[k];
        const dy = y - py[k];
        const d = dx * dx + dy * dy; // squared: compare without a square root (Math.hypot is slow)
        if (d < f1) {
          f2 = f1;
          id2 = id;
          ndx2 = ndx;
          ndy2 = ndy;
          f1 = d;
          id = pid[k];
          ndx = dx;
          ndy = dy;
        } else if (d < f2) {
          f2 = d;
          id2 = pid[k];
          ndx2 = dx;
          ndy2 = dy;
        }
      }
    }
    out.f1 = Math.sqrt(f1);
    out.f2 = Math.sqrt(f2);
    out.id = id;
    out.id2 = id2;
    out.dx = ndx;
    out.dy = ndy;
    out.dx2 = ndx2;
    out.dy2 = ndy2;
    return out;
  };
}
