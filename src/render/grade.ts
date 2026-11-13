// Light grading: the colour of the hour, laid over the world as semi-transparent, banded, dithered pixel
// light. Golden hour warms, sunset blazes toward the sun with light shafts, dusk cools to violet, night
// is a flat, dark blue filter. Every dawn and dusk draws its own palette and "beauty" from the seed, so some
// evenings are spectacular and some are grey and ordinary.
//
// Two passes: a multiply tint (colours and darkens; stronger away from the sun) and a screen glow (light
// pouring in from the sun's side). Both are computed at game-pixel resolution, a few times a second.

import { bayer, hash, valueNoise } from '../core/noise.ts';
import type { Sun } from '../sim/daylight.ts';
import type { View } from './display.ts';

type RGB = readonly [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** A cohesive set of sky colours, from the sun outward: glow → warm → hot → mid → cool → deep → night. */
export type Palette = { name: string; glow: RGB; warm: RGB; hot: RGB; mid: RGB; cool: RGB; deep: RGB; night: RGB };

export const PALETTES: readonly Palette[] = [
  { name: 'Ember', glow: hex(0xffb35c), warm: hex(0xf6c47e), hot: hex(0xe5603f), mid: hex(0xd98c6a), cool: hex(0x7a4f8f), deep: hex(0x2d2f5e), night: hex(0x1b2140) },
  { name: 'Rose Ash', glow: hex(0xffc4ab), warm: hex(0xf6d3b2), hot: hex(0xe48a9c), mid: hex(0xc9a3bf), cool: hex(0x8a7fb3), deep: hex(0x3e4473), night: hex(0x1e2238) },
  { name: 'Blood Orange', glow: hex(0xff8a3d), warm: hex(0xf7b05e), hot: hex(0xd9412e), mid: hex(0xb85a5a), cool: hex(0x5e3a5e), deep: hex(0x241c33), night: hex(0x120f1c) },
  { name: 'Lavender', glow: hex(0xffd9e8), warm: hex(0xf7e0c8), hot: hex(0xe79fc1), mid: hex(0xc2a8e0), cool: hex(0x8ea0d8), deep: hex(0x3f4f86), night: hex(0x1c2443) },
  { name: 'Brass', glow: hex(0xffd27a), warm: hex(0xf2d59a), hot: hex(0xe0a447), mid: hex(0xb7a079), cool: hex(0x5d6f86), deep: hex(0x263449), night: hex(0x131c2a) },
  { name: 'Gas Green', glow: hex(0xeae38a), warm: hex(0xe8d898), hot: hex(0xcdb45e), mid: hex(0xa7b48a), cool: hex(0x5f7f7a), deep: hex(0x2e4148), night: hex(0x17242a) },
  { name: 'Peach & Slate', glow: hex(0xffc89a), warm: hex(0xf9d8b8), hot: hex(0xf08f6c), mid: hex(0xa9a2a8), cool: hex(0x5f6f8a), deep: hex(0x2c3650), night: hex(0x161c2c) },
];
/** The grey, ordinary evenings. */
export const OVERCAST: Palette = { name: 'Overcast', glow: hex(0xd9cfc2), warm: hex(0xd8d1c4), hot: hex(0xbdab9c), mid: hex(0xa7a6a8), cool: hex(0x7d8590), deep: hex(0x3b4250), night: hex(0x1d2128) };

export type Sky = { palette: Palette; beauty: number }; // beauty ~0.35 (dull) … 1.3 (spectacular)

/** The sky for one dawn or dusk: deterministic per seed, day and half of the day. */
export function skyFor(seed: number, day: number, evening: boolean): Sky {
  const k = evening ? 1 : 0;
  if (hash(seed + 301, day, k) < 0.18) return { palette: OVERCAST, beauty: 0.35 };
  const palette = PALETTES[Math.floor(hash(seed + 300, day, k) * PALETTES.length)];
  return { palette, beauty: 0.55 + Math.pow(hash(seed + 302, day, k), 2) * 0.75 }; // mostly modest, a few blazing
}

const WHITE: RGB = [255, 255, 255];
/** Night is the same flat dark blue whatever the evening's palette was. */
const NIGHT_BLUE: RGB = hex(0x0c1748);
const NIGHT_ALPHA = 0.82; // how strongly night's blue is laid over the world (same every night)
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

export type Grade = {
  near: RGB; // multiply tint toward the sun
  far: RGB; // multiply tint away from the sun
  tintAlpha: number;
  glow: RGB; // screen glow from the sun's side
  glowAlpha: number;
  rays: number; // strength of light shafts in the glow
  night: number; // 0 … 1: how far into night (night is uniform: no bands)
  active: boolean; // false in plain daylight: nothing to draw
};

/** The grade for this sun and sky. Pure. */
export function gradeFor(sun: Sun, sky: Sky): Grade {
  const el = (sun.elevation * 180) / Math.PI;
  const p = sky.palette;
  const b = sky.beauty;
  // Wide, overlapping windows so the colour lasts: golden from ~22° of sun, the blaze from ~12° above the
  // horizon to ~10° below, then dusk, then night.
  const golden = el > 0 ? smooth((22 - el) / 14) : 1;
  const blaze = clamp01(1 - Math.abs(el - 1) / 11);
  const dusk = smooth((-4 - el) / 9);
  const night = smooth((-11 - el) / 6);
  let near = mix(mix(mix(mix(WHITE, p.warm, golden), p.hot, blaze), p.cool, dusk), NIGHT_BLUE, night);
  let far = mix(mix(mix(mix(WHITE, p.mid, golden * 0.7), p.cool, blaze), p.deep, dusk), NIGHT_BLUE, night);
  if (!sun.evening) {
    // Dawn is gentler and cooler than dusk.
    near = mix(near, mix(p.warm, p.mid, 0.5), 0.25 * blaze);
    far = mix(far, p.cool, 0.2 * blaze);
  }
  const evening = (0.14 * golden + 0.3 * blaze + 0.32 * dusk) * (0.6 + 0.4 * b);
  const tintAlpha = Math.min(NIGHT_ALPHA, evening * (1 - night) + NIGHT_ALPHA * night);
  const glowAlpha = (0.05 * golden + 0.34 * blaze * b + 0.07 * dusk * b) * (1 - night) * (sun.evening ? 1 : 0.8);
  return {
    near,
    far,
    night,
    tintAlpha,
    glow: p.glow,
    glowAlpha,
    rays: el > -3 ? blaze * b * 0.6 : 0,
    active: tintAlpha > 0.004 || glowAlpha > 0.004,
  };
}

// --- Drawing -----------------------------------------------------------------------------------------

const BANDS = 7; // colour bands across the screen; dithered at their edges

export type GradeLayer = {
  tint: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  key: string;
  px?: { tint: Uint8ClampedArray<ArrayBuffer>; glow: Uint8ClampedArray<ArrayBuffer> };
};

export const createGradeLayer = (): GradeLayer => ({ tint: document.createElement('canvas'), glow: document.createElement('canvas'), key: '' });

/** Light shafts: a 1-D noise across the sun direction, banded so the shafts have crisp pixel edges (0…4). */
const shaftLevel = (u: number) => Math.round(valueNoise(977, u / 28, 0) * 4);
const SHAFT_LEVELS = 5;
/** 4×4 ordered dither offsets for the band edges. */
const DITHER = Float32Array.from({ length: 16 }, (_, i) => (bayer(i & 3, i >> 2) - 0.5) * 0.9);

/**
 * The two overlay images (RGBA, w×h game px) for a grade and an on-screen sun direction. Pure.
 * Tuned for speed: every per-pixel quantity is linear in x, so the inner loop is a few adds and lookups.
 */
export function gradePixels(
  w: number,
  h: number,
  g: Grade,
  dir: { x: number; y: number },
  out?: { tint: Uint8ClampedArray<ArrayBuffer>; glow: Uint8ClampedArray<ArrayBuffer> }, // reused, to spare the GC
) {
  const tint = out?.tint.length === w * h * 4 ? out.tint : new Uint8ClampedArray(w * h * 4);
  const glow = out?.glow.length === w * h * 4 ? out.glow : new Uint8ClampedArray(w * h * 4);
  const T = new Uint32Array(tint.buffer);
  const G = new Uint32Array(glow.buffer);
  const R = Math.hypot(w, h) / 2;
  const cx = w / 2;
  const cy = h / 2;
  const pack = (c: RGB, a: number) => ((Math.round(clamp01(a) * 255) << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
  // Per band (f = 0 away from the sun … 1 toward it): packed tint, and packed glow per shaft level.
  const tintPack = new Uint32Array(BANDS);
  const glowPack = new Uint32Array(BANDS * SHAFT_LEVELS);
  for (let i = 0; i < BANDS; i++) {
    const f = i / (BANDS - 1);
    tintPack[i] = pack(mix(g.far, g.near, f), g.tintAlpha * (1 + 0.15 * (1 - f) * (1 - g.night)));
    for (let k = 0; k < SHAFT_LEVELS; k++) glowPack[i * SHAFT_LEVELS + k] = pack(g.glow, g.glowAlpha * Math.pow(f, 2.2) * (1 + g.rays * (k / 4 - 0.5) * 2));
  }
  const glowing = g.glowAlpha > 0.004;
  // Shaft level for every whole-pixel distance across the sun direction in the view.
  const U = Math.ceil(R) + 2;
  const shafts = glowing ? Uint8Array.from({ length: 2 * U + 1 }, (_, i) => shaftLevel(i - U)) : new Uint8Array(0);
  const dfx = (dir.x / R) * 0.5 * BANDS; // band position per px in x
  const duX = -dir.y; // across-sun position per px in x
  for (let y = 0, i = 0; y < h; y++) {
    let f = (((0 - cx) * dir.x + (y - cy) * dir.y) / R) * 0.5 * BANDS + 0.5 * BANDS;
    let u = (0 - cx) * -dir.y + (y - cy) * dir.x + U;
    const row = (y & 3) << 2;
    for (let x = 0; x < w; x++, i++, f += dfx, u += duX) {
      let band = (f + DITHER[row | (x & 3)]) | 0;
      band = band < 0 ? 0 : band >= BANDS ? BANDS - 1 : band;
      T[i] = tintPack[band];
      G[i] = glowing ? glowPack[band * SHAFT_LEVELS + shafts[u | 0]] : 0;
    }
  }
  return { tint, glow };
}

function repaint(layer: GradeLayer, w: number, h: number, g: Grade, dir: { x: number; y: number }) {
  for (const c of [layer.tint, layer.glow]) if (c.width !== w || c.height !== h) (c.width = w), (c.height = h);
  const px = gradePixels(w, h, g, dir, layer.px);
  layer.px = px;
  layer.tint.getContext('2d')!.putImageData(new ImageData(px.tint, w, h), 0, 0);
  layer.glow.getContext('2d')!.putImageData(new ImageData(px.glow, w, h), 0, 0);
}

/**
 * Draw the grade over the world (call after the world, before the HUD). `sunScreen` is the direction
 * toward the sun on screen (it turns with the camera).
 */
export function drawGrade(ctx: CanvasRenderingContext2D, view: View, layer: GradeLayer, g: Grade, sunScreen: { x: number; y: number }): void {
  if (!g.active) return;
  const w = Math.ceil(view.w);
  const h = Math.ceil(view.h);
  // Repaint only when the light visibly changed: size, sun direction (to ~1°) or the grade itself.
  const q = (v: number, step: number) => Math.round(v / step);
  const key = [w, h, q(Math.atan2(sunScreen.y, sunScreen.x), 0.017), q(g.tintAlpha, 0.005), q(g.glowAlpha, 0.005), q(g.near[0] + g.near[1] * 3 + g.near[2] * 7, 4), q(g.far[0] + g.far[1] * 3 + g.far[2] * 7, 4)].join(',');
  if (key !== layer.key) {
    layer.key = key;
    repaint(layer, w, h, g, sunScreen);
  }
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(layer.tint, 0, 0);
  if (g.glowAlpha > 0.004) {
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(layer.glow, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
}
