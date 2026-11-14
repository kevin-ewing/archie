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

// Every palette's warm end (glow → warm → hot → mid) is all pinks, oranges and golds, multiplied over the
// world at sunrise and sunset; only cool / deep (dusk) turn violet and blue.
export const PALETTES: readonly Palette[] = [
  { name: 'Ember', glow: hex(0xffc04d), warm: hex(0xffb347), hot: hex(0xff5a36), mid: hex(0xff7aa2), cool: hex(0x8a4fa3), deep: hex(0x2d2f6e), night: hex(0x1b2140) },
  { name: 'Rose Ash', glow: hex(0xffd1b8), warm: hex(0xffb0a0), hot: hex(0xff6f91), mid: hex(0xe88ad6), cool: hex(0x9a7fd3), deep: hex(0x3e4483), night: hex(0x1e2238) },
  { name: 'Blood Orange', glow: hex(0xffa23a), warm: hex(0xffa84a), hot: hex(0xff3d24), mid: hex(0xf2607a), cool: hex(0x6e3a7a), deep: hex(0x241c43), night: hex(0x120f1c) },
  { name: 'Candy Floss', glow: hex(0xffe0f0), warm: hex(0xffc8de), hot: hex(0xff7ac0), mid: hex(0xd79cff), cool: hex(0x9aa6ff), deep: hex(0x3f4f96), night: hex(0x1c2443) },
  { name: 'Brass', glow: hex(0xffe066), warm: hex(0xffd27a), hot: hex(0xffa030), mid: hex(0xf08a5a), cool: hex(0x6a6f9a), deep: hex(0x263459), night: hex(0x131c2a) },
  { name: 'Marigold', glow: hex(0xfff07a), warm: hex(0xffd45c), hot: hex(0xff8f1f), mid: hex(0xff6b6b), cool: hex(0x7a5a9a), deep: hex(0x2e3458), night: hex(0x17242a) },
  { name: 'Peach & Plum', glow: hex(0xffd2a0), warm: hex(0xffbf8f), hot: hex(0xff7f5c), mid: hex(0xd8668f), cool: hex(0x6f4f8a), deep: hex(0x2c2650), night: hex(0x161c2c) },
];
// More sunset sky palettes, built from published sunset colour schemes (Tailwind-style "classic sunset", "city sunset gradient", colortutorial.design,
// color-meanings.com, schemecolor.com "Sky During Sunset", "Weird Sunset Sky", "Sky After Sunset"), with
// the in-between tones filled in. Every sky mixes two of these (see skyFor), so no two evenings repeat.
const MORE_PALETTES: readonly Palette[] = [
  { name: 'Classic', glow: hex(0xffc345), warm: hex(0xff9e4a), hot: hex(0xff6361), mid: hex(0xbc5090), cool: hex(0x58508d), deep: hex(0x2a2a55), night: hex(0x1c2038) },
  { name: 'Vivid', glow: hex(0xfcdd2d), warm: hex(0xffb020), hot: hex(0xff900e), mid: hex(0xd58faa), cool: hex(0x6779b9), deep: hex(0x2f3a6b), night: hex(0x171d33) },
  { name: 'Dusky Rose', glow: hex(0xfcd36b), warm: hex(0xf6a77f), hot: hex(0xef8094), mid: hex(0xc06a8c), cool: hex(0x8e4c83), deep: hex(0x4f3868), night: hex(0x362f46) },
  { name: 'Weird', glow: hex(0xe9bca0), warm: hex(0xf48a5a), hot: hex(0xf84f25), mid: hex(0xd87a86), cool: hex(0xa28ab4), deep: hex(0x5c4478), night: hex(0x2a2238) },
  { name: 'Afterglow', glow: hex(0xffb866), warm: hex(0xf8a060), hot: hex(0xec6066), mid: hex(0xc95874), cool: hex(0x552e7d), deep: hex(0x211463), night: hex(0x141038) },
  { name: 'Ember Sky', glow: hex(0xfde68a), warm: hex(0xf97316), hot: hex(0xef4444), mid: hex(0xec4899), cool: hex(0x8b5cf6), deep: hex(0x3b2a7a), night: hex(0x1e1b3a) },
  { name: 'City', glow: hex(0xeeaf61), warm: hex(0xfb9062), hot: hex(0xee5d6c), mid: hex(0xce4993), cool: hex(0x6a0d83), deep: hex(0x2e0a45), night: hex(0x1a1030) },
  { name: 'Alpine', glow: hex(0xf7d58a), warm: hex(0xf2b36b), hot: hex(0xe8798f), mid: hex(0xc9a0e0), cool: hex(0x8fa8e0), deep: hex(0x3c4f8c), night: hex(0x1a2440) },
];
const ALL_PALETTES: readonly Palette[] = [...PALETTES, ...MORE_PALETTES];

/** The plainer evenings: still warm, just softer. */
export const OVERCAST: Palette = { name: 'Overcast', glow: hex(0xf0d8c0), warm: hex(0xeed2b8), hot: hex(0xe0a890), mid: hex(0xc9a0a8), cool: hex(0x8a8aa8), deep: hex(0x3b4260), night: hex(0x1d2128) };

/** beauty ~0.6 (soft) … 1.4 (outrageous). `rayEnd`: the colour the light shafts evolve to as the sun reaches the horizon. */
export type Sky = { palette: Palette; beauty: number; rayEnd: RGB };

/** The sky for one dawn or dusk: deterministic per seed, day and half of the day. */
export function skyFor(seed: number, day: number, evening: boolean): Sky {
  const k = evening ? 1 : 0;
  if (hash(seed + 301, day, k) < 0.1) return { palette: OVERCAST, beauty: 0.6, rayEnd: OVERCAST.hot };
  // Two palettes, mixed by a random amount, each colour then nudged a little: a fresh sky every time.
  const a = ALL_PALETTES[Math.floor(hash(seed + 300, day, k) * ALL_PALETTES.length)];
  const b = ALL_PALETTES[Math.floor(hash(seed + 303, day, k) * ALL_PALETTES.length)];
  const t = hash(seed + 304, day, k) * 0.6;
  let n = 0;
  const nudge = (v: number, s: number) => Math.min(255, Math.max(0, v + (hash(seed + s, day, k * 16 + n) - 0.5) * 50));
  const jitter = (c: RGB): RGB => {
    const out: RGB = [nudge(c[0], 305), nudge(c[1], 306), nudge(c[2], 307)];
    n++; // next colour gets its own nudge
    return out;
  };
  const blend = (key: Exclude<keyof Palette, 'name'>) => jitter(mix(a[key], b[key], t));
  const palette: Palette = { name: t < 0.05 || a === b ? a.name : `${a.name}+${b.name}`, glow: blend('glow'), warm: blend('warm'), hot: blend('hot'), mid: blend('mid'), cool: blend('cool'), deep: blend('deep'), night: blend('night') };
  // The shafts start gold-ish and drift to one of this sky's deeper colours by the time the sun is on the horizon.
  const rayEnd = hash(seed + 308, day, k) < 0.5 ? palette.hot : palette.mid;
  return { palette, beauty: 0.8 + Math.pow(hash(seed + 302, day, k), 2) * 0.6, rayEnd }; // always dramatic, some outrageous
}

const WHITE: RGB = [255, 255, 255];
/** Night is the same flat dark blue whatever the evening's palette was. */
const NIGHT_BLUE: RGB = hex(0x0c1748);
const CLOUD_GREY: RGB = hex(0x657080); // muted blue-grey: darker than daytime cloud without disappearing into the night
const NIGHT_ALPHA = 0.8; // how strongly night's blue is laid over the world (same every night): only a little darker than dusk
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
  /** How the clouds are coloured: lit from the sun's side, shaded away from it, blended in by `amount`. */
  cloud: { near: RGB; far: RGB; amount: number };
};

/** The grade for this sun and sky. Pure. */
export function gradeFor(sun: Sun, sky: Sky): Grade {
  const el = (sun.elevation * 180) / Math.PI;
  const p = sky.palette;
  const b = sky.beauty;
  // Golden from ~22° of sun; the blaze from ~12° above the horizon until the sun's rays stop, ~4° below it;
  // then the sky turns blue straight away (dusk), and reaches full night soon after. The same going the
  // other way: it stays fully dark until shortly before sunrise, then lifts into blue dawn.
  const golden = el > 0 ? smooth((22 - el) / 14) : 1 - smooth(-el / 5);
  const blaze = clamp01(el >= 1 ? 1 - (el - 1) / 11 : 1 - (1 - el) / 5);
  const dusk = smooth((0.5 - el) / 2.5); // dark within a couple of degrees (~15 min) of the sun crossing the horizon
  const night = smooth((-1 - el) / 4); // starts ~10 min after sunset, fully dark in ~40; mirrored before sunrise
  const DUSK_BLUE = mix(p.deep, NIGHT_BLUE, 0.5);
  // Toward the sun: gold, then fiery orange-red. Away from it: rose and magenta. Both warm, both multiplied.
  let near = mix(mix(mix(mix(WHITE, p.warm, golden), p.hot, blaze), mix(p.cool, DUSK_BLUE, 0.6), dusk), NIGHT_BLUE, night);
  let far = mix(mix(mix(mix(WHITE, p.mid, golden * 0.8), mix(p.mid, p.hot, 0.35), blaze), DUSK_BLUE, dusk), NIGHT_BLUE, night);
  if (!sun.evening) {
    // Dawn: the same drama, leaning gold and pink rather than red.
    near = mix(near, p.glow, 0.3 * blaze * (1 - dusk));
    far = mix(far, p.mid, 0.25 * blaze * (1 - dusk));
  }
  const evening = (0.32 * golden + 0.5 * blaze * (1 - dusk) + 0.72 * dusk) * (0.65 + 0.35 * b);
  const tintAlpha = Math.min(NIGHT_ALPHA, evening * (1 - night) + NIGHT_ALPHA * night);
  // Light shafts and the glow can show for a good while before the sun sets, but once it has set they
  // only linger 20 game minutes into the night (full for 12, fading out by 20). Same before sunrise.
  const intoNight = sun.evening ? sun.horizonMinutes : -sun.horizonMinutes;
  const rayWindow = 1 - smooth((intoNight - 12) / 8);
  const glowAlpha = Math.min(0.85, (0.12 * golden + 0.6 * blaze * b) * (1 - 0.5 * dusk)) * rayWindow * 0.8; // a touch see-through
  // The glow and shafts change colour as the sun sinks: from the palette's glow (sun ~12° up) to its ray colour (on the horizon).
  const rayColour = mix(p.glow, sky.rayEnd, clamp01((12 - el) / 14));
  // Clouds catch the colour far more than the ground does: lit pink, gold and fire-red by the low sun,
  // then (the moment the sun is gone) a cool blue-grey, and dark blue through the night.
  // Half the saturation of the sky's colour (same brightness), settling into a darker muted blue-grey at night.
  const soft = (c: RGB): RGB => {
    const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; // the colour's own grey
    return mix([y, y, y], c, 0.5);
  };
  const cloudNear = mix(mix(mix(mix(WHITE, soft(p.glow), golden * 0.7), soft(mix(p.hot, p.glow, 0.25)), blaze), mix(soft(p.cool), CLOUD_GREY, 0.5), dusk), CLOUD_GREY, night);
  const cloudFar = mix(mix(mix(mix(WHITE, soft(p.mid), golden * 0.8), soft(mix(p.mid, p.hot, 0.5)), blaze), mix(soft(p.deep), CLOUD_GREY, 0.5), dusk), CLOUD_GREY, night);
  // Only a hint of colour in the golden hours, building to the full blaze as the sun meets the horizon.
  const byDay = clamp01(0.1 * golden + 0.58 * blaze * blaze) * (0.75 + 0.25 * b);
  const duskCloudAmount = byDay + (0.5 - byDay) * dusk;
  const cloudAmount = duskCloudAmount + (0.65 - duskCloudAmount) * night;
  return {
    near,
    far,
    night,
    cloud: { near: cloudNear, far: cloudFar, amount: cloudAmount },
    tintAlpha,
    glow: rayColour,
    glowAlpha,
    rays: blaze * b * 0.9 * rayWindow,
    active: tintAlpha > 0.004 || glowAlpha > 0.004,
  };
}

// --- Drawing -----------------------------------------------------------------------------------------

const BANDS = 9; // colour bands across the screen; dithered at their edges

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
  radius = Math.hypot(w, h) / 2, // distance from the centre at which the gradient reaches its ends
  copyRows = true, // reuse repeated rows when the sun is along ±x (off only to check it against the full computation)
) {
  const tint = out?.tint.length === w * h * 4 ? out.tint : new Uint8ClampedArray(w * h * 4);
  const glow = out?.glow.length === w * h * 4 ? out.glow : new Uint8ClampedArray(w * h * 4);
  const T = new Uint32Array(tint.buffer);
  const G = new Uint32Array(glow.buffer);
  const R = radius;
  const cx = w / 2;
  const cy = h / 2;
  const pack = (c: RGB, a: number) => ((Math.round(clamp01(a) * 255) << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
  // Per band (f = 0 away from the sun … 1 toward it): packed tint, and packed glow per shaft level.
  const tintPack = new Uint32Array(BANDS);
  const glowPack = new Uint32Array(BANDS * SHAFT_LEVELS);
  for (let i = 0; i < BANDS; i++) {
    const f = i / (BANDS - 1);
    tintPack[i] = pack(mix(g.far, g.near, f), g.tintAlpha * (1 + 0.15 * (1 - f) * (1 - g.night)));
    for (let k = 0; k < SHAFT_LEVELS; k++) glowPack[i * SHAFT_LEVELS + k] = pack(g.glow, g.glowAlpha * Math.pow(f, 1.6) * (1 + g.rays * (k / 4 - 0.5) * 2));
  }
  const glowing = g.glowAlpha > 0.004;
  // Shaft level for every whole-pixel distance across the sun direction in the view.
  const U = Math.ceil(R) + 2;
  const shafts = glowing ? Uint8Array.from({ length: 2 * U + 1 }, (_, i) => shaftLevel(i - U)) : new Uint8Array(0);
  const dfx = (dir.x / R) * 0.5 * BANDS; // band position per px in x
  const duX = -dir.y; // across-sun position per px in x
  // Sun along ±x (how the game paints it): a row depends only on y & 3 (the dither) and its shaft level,
  // so it repeats the row 4 above whenever that row had the same shaft level. Copy it instead of recomputing.
  const rowsRepeat = copyRows && dir.y === 0;
  const bands4 = rowsRepeat ? new Uint8Array(4 * w) : undefined; // the bands of the first 4 rows (one per dither row)
  for (let y = 0, i = 0; y < h; y++) {
    let f = (((0 - cx) * dir.x + (y - cy) * dir.y) / R) * 0.5 * BANDS + 0.5 * BANDS;
    let u = (0 - cx) * -dir.y + (y - cy) * dir.x + U;
    if (bands4 && y >= 4) {
      const above = i - 4 * w;
      T.copyWithin(i, above, above + w);
      const s = glowing ? shafts[u | 0] : 0;
      if (!glowing) G.fill(0, i, i + w);
      else if (s === shafts[(u - 4 * dir.x) | 0]) G.copyWithin(i, above, above + w); // most rows: shafts are ~28 px wide
      else for (let x = 0, b = (y & 3) * w; x < w; x++) G[i + x] = glowPack[bands4[b + x] * SHAFT_LEVELS + s]; // new shaft level, same bands
      i += w;
      continue;
    }
    const row = (y & 3) << 2;
    for (let x = 0; x < w; x++, i++, f += dfx, u += duX) {
      let band = (f + DITHER[row | (x & 3)]) | 0;
      band = band < 0 ? 0 : band >= BANDS ? BANDS - 1 : band;
      if (bands4) bands4[y * w + x] = band;
      T[i] = tintPack[band];
      G[i] = glowing ? glowPack[band * SHAFT_LEVELS + shafts[u | 0]] : 0;
    }
  }
  return { tint, glow };
}

function repaint(layer: GradeLayer, size: number, g: Grade, radius: number) {
  for (const c of [layer.tint, layer.glow]) if (c.width !== size || c.height !== size) (c.width = size), (c.height = size);
  // Painted with the sun along +x; drawGrade rotates it to the sun's direction on screen every frame.
  const px = gradePixels(size, size, g, { x: 1, y: 0 }, layer.px, radius);
  layer.px = px;
  layer.tint.getContext('2d')!.putImageData(new ImageData(px.tint, size, size), 0, 0);
  if (g.glowAlpha > 0.004) layer.glow.getContext('2d')!.putImageData(new ImageData(px.glow, size, size), 0, 0); // else drawGrade doesn't draw it
}

/**
 * Draw the grade over the world (call after the world, before the HUD). `sunScreen` is the direction
 * toward the sun on screen (it turns with the camera). The overlay is painted once, sun-aligned, and
 * simply rotated each frame, so turning is perfectly smooth (no repaint steps, no jumping shafts); it's
 * only repainted when the light itself changes.
 */
export function drawGrade(ctx: CanvasRenderingContext2D, view: View, layer: GradeLayer, g: Grade, sunScreen: { x: number; y: number }): void {
  if (!g.active) return;
  const radius = Math.hypot(view.w, view.h) / 2;
  const size = Math.ceil(radius * 2) + 2; // covers the screen at any rotation
  const q = (v: number, step: number) => Math.round(v / step);
  const key = [size, q(g.tintAlpha, 0.01), q(g.glowAlpha, 0.01), q(g.rays, 0.02), q(g.near[0] + g.near[1] * 3 + g.near[2] * 7, 6), q(g.far[0] + g.far[1] * 3 + g.far[2] * 7, 6), q(g.glow[0] + g.glow[1] * 3 + g.glow[2] * 7, 6)].join(',');
  if (key !== layer.key) {
    layer.key = key;
    repaint(layer, size, g, radius);
  }
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  ctx.translate(view.w / 2, view.h / 2);
  ctx.rotate(Math.atan2(sunScreen.y, sunScreen.x));
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(layer.tint, -size / 2, -size / 2);
  if (g.glowAlpha > 0.004) {
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(layer.glow, -size / 2, -size / 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
