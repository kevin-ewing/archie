// The plane's cast shadow. On flat ground it's the plane's silhouette, shifted down-sun by altitude × the
// sun's shadow length. Over raised ground (trees, hedges) it lands closer to the plane, and that's
// worked out for every pixel of the silhouette on its own (see projectShadow): each pixel samples the
// ground height where *it* lands and eases toward it, so the shadow drapes over crowns and hedges, and
// only the part that is actually over something lifts.

import { SPRITE_W, SPRITE_H } from './plane.ts';

export const ALTITUDE = 70; // plane height above the ground, world px
export const SHADOW_EASE = 0.25; // seconds for the shadow to settle onto a new ground height

/** Where the shadow's centre falls, for a plane at (px, py), a sun shadow vector, and the ground height there. */
export function shadowCentre(px: number, py: number, sun: { x: number; y: number }, groundHeight: number, altitude = ALTITUDE) {
  const drop = Math.max(0, altitude - groundHeight);
  return { x: px + sun.x * drop, y: py + sun.y * drop };
}

/** Ease the remembered ground height toward a new sample. */
export const easeHeight = (current: number, target: number, dt: number) => current + (target - current) * (1 - Math.exp(-dt / SHADOW_EASE));

/**
 * Casts a silhouette (alpha, iw×ih, centred on the plane and turned to `heading`) onto the ground, one
 * pixel at a time, into `out` (RGBA, bw×bh, the silhouette's flat-ground spot at its centre). A pixel
 * whose ground is `h` high lands `h` × the shadow vector closer to the plane. `heights` remembers each
 * pixel's eased ground height between frames. Pixels that spread apart are filled in so there are no gaps.
 */
export function projectShadow(a: {
  alpha: Uint8ClampedArray;
  iw: number;
  ih: number;
  plane: { x: number; y: number; heading: number };
  shadow: { x: number; y: number }; // sun shadow vector per unit of height
  heightAt: (x: number, y: number) => number;
  heights: Float32Array; // iw×ih
  dt: number;
  out: Uint8ClampedArray;
  bw: number;
  bh: number;
}): void {
  const { alpha, iw, ih, plane, shadow, heights, out, bw, bh } = a;
  const cos = Math.cos(plane.heading);
  const sin = Math.sin(plane.heading);
  const ox = (bw - iw) / 2; // where the silhouette's top-left sits in the output
  const oy = (bh - ih) / 2;
  const put = (x: number, y: number, v: number) => {
    if (x < 0 || y < 0 || x >= bw || y >= bh) return;
    const j = (y * bw + x) * 4 + 3;
    if (v > out[j]) out[j] = v;
  };
  const upY = new Int32Array(iw); // where the pixel above landed (for filling vertical gaps)
  const upOk = new Uint8Array(iw);
  for (let y = 0; y < ih; y++) {
    let lx = 0;
    let lOk = false;
    for (let x = 0; x < iw; x++) {
      const v = alpha[y * iw + x];
      if (!v) {
        lOk = false;
        upOk[x] = 0;
        continue;
      }
      // This pixel's spot on the ground if the ground were flat, then the height actually under it.
      const u = x - iw / 2 + 0.5;
      const w = y - ih / 2 + 0.5;
      const fx = plane.x + u * cos - w * sin + shadow.x * ALTITUDE;
      const fy = plane.y + u * sin + w * cos + shadow.y * ALTITUDE;
      const i = y * iw + x;
      const h = (heights[i] = easeHeight(heights[i], a.heightAt(Math.round(fx), Math.round(fy)), a.dt));
      // Closer to the plane by h × shadow; into the silhouette's own (unrotated) frame.
      const sx = -shadow.x * h;
      const sy = -shadow.y * h;
      const dx = Math.round(x + ox + sx * cos + sy * sin);
      const dy = Math.round(y + oy - sx * sin + sy * cos);
      put(dx, dy, v);
      if (lOk) for (let k = Math.min(lx, dx) + 1; k < Math.max(lx, dx); k++) put(k, dy, v);
      if (upOk[x]) for (let k = Math.min(upY[x], dy) + 1; k < Math.max(upY[x], dy); k++) put(dx, k, v);
      lx = dx;
      lOk = true;
      upY[x] = dy;
      upOk[x] = 1;
    }
  }
}

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
