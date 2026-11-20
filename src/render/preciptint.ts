// Hour_Tint and Sun_Glow for precipitation particles: pure colour helpers. The layer asks for one colour
// per (kind, sun-side band, alpha level). Colour only, never alpha, so alpha stays on its own levels.

import { RAIN_COLOUR, SNOW_COLOUR, type Grade } from './grade.ts';

type RGB = readonly [number, number, number];

export const BANDS = 5;
const MAX_GLOW_ALPHA = 0.68; // the largest glowAlpha the Grade produces (0.85 · 0.8)
const FULL_TINT_ALPHA = 0.15; // tintAlpha at which the Hour_Tint is fully applied: early, so the outer Sun_Window still reads warm
const CHROMA_GAIN = 1.5; // particles carry a little more colour than the multiply tint itself
const NIGHT_DIM = 0.35;
const FAR_DARKEN = 0.1;
const GLOW_MIX = 0.5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The band a sun-side position `f` (0 away … 1 toward the sun) falls in. */
export const bandOf = (f: number): number => Math.min(BANDS - 1, Math.floor(clamp01(f) * BANDS));

/** The particle colour for `kind` at sun-side position `f`, from the hour's Grade. Quantised to `BANDS` bands. */
export function particleColour(g: Grade, kind: 'rain' | 'snow', f: number): RGB {
  const base = kind === 'rain' ? RAIN_COLOUR : SNOW_COLOUR;
  const fm = (bandOf(f) + 0.5) / BANDS;

  // Hour_Tint: the world's multiply tint on this side, moved to the base colour's luminance with its own chroma
  // (times CHROMA_GAIN), blended in by tintAlpha. Shifting every channel by the same amount keeps the hue, and
  // keeping absolute chroma (not normalising to full brightness) keeps a dark dusk tint from amplifying its own
  // per-frame changes. The chroma is scaled down, never clipped, to fit 0..255.
  const c = mix(g.far, g.near, fm);
  const y = lum(base);
  const cy = lum(c);
  const ch: RGB = [(c[0] - cy) * CHROMA_GAIN, (c[1] - cy) * CHROMA_GAIN, (c[2] - cy) * CHROMA_GAIN];
  const hi = Math.max(ch[0], ch[1], ch[2]);
  const lo = Math.min(ch[0], ch[1], ch[2]);
  const fit = Math.min(1, hi > 0 ? (255 - y) / hi : 1, lo < 0 ? y / -lo : 1);
  const lit: RGB = [y + ch[0] * fit, y + ch[1] * fit, y + ch[2] * fit];
  let rgb = mix(base, lit, clamp01(g.tintAlpha / FULL_TINT_ALPHA));
  const dim = 1 - NIGHT_DIM * g.night;
  rgb = [rgb[0] * dim, rgb[1] * dim, rgb[2] * dim];

  // Sun_Glow: darken the far side a little, screen the glow colour over the sun side (as the Grade's glow pass
  // does), so it only ever brightens, even when the glow is a deep red darker than the particle. Zero without glow.
  // No gate on `rays`: it is 0 from a higher sun than `glowAlpha`, so a gate would step the glow in at the first ray.
  const gs = clamp01(g.glowAlpha / MAX_GLOW_ALPHA);
  if (gs === 0) return rgb;
  const w = Math.pow(fm, 1.6);
  const d = 1 - FAR_DARKEN * gs * (1 - w);
  const k = GLOW_MIX * gs * w;
  const screen = (v: number, gl: number) => 255 - (255 - v * d) * (1 - (k * gl) / 255);
  return [screen(rgb[0], g.glow[0]), screen(rgb[1], g.glow[1]), screen(rgb[2], g.glow[2])];
}
