// Pure rain and snow particle model. No canvas, no DOM, no allocation per frame: `stepPrecip` updates the
// model and rewrites flat typed arrays of pixels to fill (x, y, size, alpha level, sun-side band, kind).
// Positions are closed form in (seed, particle index, shared offset V); V is the only thing that
// accumulates, from direction × speed × effect dt, so a paused game (dt = 0) freezes the frame.
import { bayer, hash, valueNoise } from '../core/noise.ts';

/** Structural subset of the weather state, so this module has no dependency on `sim/weather.ts`. */
export type PrecipKind = 'rain' | 'snow';
export type ModelInput = {
  seed: number;
  width: number; // game pixels
  height: number;
  precipitation: 'none' | PrecipKind;
  intensity: number; // clamped here, so any number is safe
  heading: number; // radians
  bank: number; // radians
  camAngle: number; // radians
  t: number; // simulation elapsed seconds (does not advance while paused)
  sun?: { x: number; y: number }; // on-screen unit vector toward the sun (for the sun-side band)
  reducedMotion?: boolean;
};

export const MAX_PARTICLES = 600;
export const AREA_SHARE = 0.12; // at most this share of screen pixels
export const ALPHA_LEVELS = [0.15, 0.28, 0.4, 0.5] as const; // the only sprite alphas
export const BANDS = 5;
export const FADE_S = 2;
export const MAX_DT = 0.1;
export const MAX_DROPLETS = 12;
export const LEAN = 0.3; // radians of streak lean per radian of bank
const DIR_TAU = 0.15; // s, direction easing time constant
const DIR_SLEW = Math.PI / 2; // rad/s, direction turn limit (a 0.1 s frame turns at most 9°)
const MARGIN = 16;
const CAPACITY = MAX_PARTICLES * 12 + 1024; // pixels: 600 × longest streak, plus discs

export const clampIntensity = (i: number) => (Number.isFinite(i) ? Math.min(1, Math.max(0, i)) : 0);
const MIN_I = 0.02;
/** Streak counts: 0 at or below 0.02, 20 at just above it, 360 at 1. */
export const rainCount = (i: number) => (i > MIN_I ? Math.round(20 + 340 * ((i - MIN_I) / (1 - MIN_I))) : 0);
export const rainLength = (i: number) => Math.round(2 + 10 * i);
export const rainSpeed = (i: number) => 260 + 260 * i;
export const snowCount = (i: number) => (i > MIN_I ? Math.round((400 * (i - MIN_I)) / (1 - MIN_I)) : 0);
export const largeCount = (i: number) => (i > 0.5 ? 3 + Math.floor((7 * (i - 0.5)) / 0.5) : 0);
export const dropletRate = (i: number) => (i > 0.4 ? (4 * (i - 0.4)) / 0.6 : 0); // spawns per second

export type PrecipModel = {
  theta: number;
  vx: number;
  vy: number;
  T: number; // effect time, seconds
  lastT: number;
  opacity: { rain: number; snow: number };
  level: { rain: number; snow: number }; // last intensity each kind was active at, so it can fade out
  droplets: Float32Array; // MAX_DROPLETS × (x, y, age, size, speed, life); life 0 = free slot
  spawnAcc: number;
  spawnN: number;
  // Output pixel list, allocated once.
  px: Int16Array;
  py: Int16Array;
  ps: Uint8Array; // square size in pixels
  style: Uint8Array; // alpha level 0..3 into ALPHA_LEVELS
  band: Uint8Array; // sun-side band 0..4
  kind: Uint8Array; // 0 rain, 1 snow
  n: number;
};

export function createPrecipModel(): PrecipModel {
  return {
    theta: 0, vx: 0, vy: 0, T: 0, lastT: NaN,
    opacity: { rain: 0, snow: 0 }, level: { rain: 0, snow: 0 },
    droplets: new Float32Array(MAX_DROPLETS * 6), spawnAcc: 0, spawnN: 0,
    px: new Int16Array(CAPACITY), py: new Int16Array(CAPACITY), ps: new Uint8Array(CAPACITY),
    style: new Uint8Array(CAPACITY), band: new Uint8Array(CAPACITY), kind: new Uint8Array(CAPACITY), n: 0,
  };
}

/** True when nothing is faded in and no droplet is alive: the layer may skip drawing. */
export function precipIdle(m: PrecipModel): boolean {
  if (m.opacity.rain > 0 || m.opacity.snow > 0) return false;
  for (let j = 0; j < MAX_DROPLETS; j++) if (m.droplets[j * 6 + 5] > 0) return false;
  return true;
}

const wrap = (v: number, len: number) => (((v % len) + len) % len) - MARGIN;

/** Advance the model to `inp.t` and rebuild the pixel list in `m`. */
export function stepPrecip(m: PrecipModel, inp: ModelInput): void {
  const { seed, width: W, height: H } = inp;
  const rm = inp.reducedMotion ? 0.5 : 1;
  const first = Number.isNaN(m.lastT);
  const dt = first || !Number.isFinite(inp.t) ? 0 : Math.min(MAX_DT, Math.max(0, inp.t - m.lastT));
  if (Number.isFinite(inp.t)) m.lastT = inp.t;
  m.T += dt;

  // Intensity, gate and fades: one opacity per kind, linear over FADE_S, particles thinned by seeded hash.
  const i = clampIntensity(inp.intensity);
  const active: PrecipKind | null = i > MIN_I && inp.precipitation !== 'none' ? inp.precipitation : null;
  if (active) m.level[active] = i;
  for (const k of ['rain', 'snow'] as const) {
    const target = k === active ? 1 : 0;
    m.opacity[k] = first ? target : m.opacity[k] + Math.max(-dt / FADE_S, Math.min(dt / FADE_S, target - m.opacity[k]));
  }

  // Direction: lean with bank, ease toward the target, slew-limited.
  const target = inp.heading - inp.camAngle + LEAN * inp.bank;
  if (first) m.theta = target;
  else if (dt > 0) {
    const diff = ((((target - m.theta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const step = diff * (1 - Math.exp(-dt / DIR_TAU));
    const lim = DIR_SLEW * dt;
    m.theta += Math.max(-lim, Math.min(lim, step));
  }
  const dx = -Math.sin(m.theta);
  const dy = Math.cos(m.theta);

  // Shared offset: speed of the active kind (or the one still fading).
  const lead = active ?? (m.opacity.snow > m.opacity.rain ? 'snow' : 'rain');
  const vBase = rainSpeed(m.level[lead]) * rm;
  m.vx += dx * vBase * dt;
  m.vy += dy * vBase * dt;

  m.n = 0;
  const budget = AREA_SHARE * W * H;
  const sx = inp.sun?.x ?? 0;
  const sy = inp.sun?.y ?? 0;
  const R = Math.hypot(W, H) / 2 || 1;
  const bandOf = (x: number, y: number) =>
    Math.min(BANDS - 1, Math.floor((0.5 + ((x - W / 2) * sx + (y - H / 2) * sy) / (2 * R)) * BANDS));
  const push = (x: number, y: number, size: number, style: number, kind: number) => {
    if (m.n >= CAPACITY || x + size <= 0 || y + size <= 0 || x >= W || y >= H) return;
    const n = m.n++;
    m.px[n] = x; m.py[n] = y; m.ps[n] = size; m.style[n] = style; m.band[n] = bandOf(x + size / 2, y + size / 2); m.kind[n] = kind;
  };
  const LW = W + 2 * MARGIN;
  const LH = H + 2 * MARGIN;

  // Rain streaks.
  if (m.opacity.rain > 0) {
    const lv = m.level.rain;
    const len = Math.max(1, rainLength(lv));
    const n = Math.min(Math.round(rainCount(lv) * rm), Math.floor((0.9 * budget) / len), MAX_PARTICLES);
    for (let j = 0; j < n; j++) {
      if (hash(seed + 706, j, 0) >= m.opacity.rain) continue;
      const k = 0.85 + 0.3 * hash(seed + 701, j, 0);
      const hx = Math.floor(wrap(hash(seed + 704, j, 0) * W + k * m.vx + MARGIN, LW));
      const hy = Math.floor(wrap(hash(seed + 705, j, 0) * H + k * m.vy + MARGIN, LH));
      for (let s = 0; s < len; s++) {
        const x = Math.round(hx - dx * s);
        const y = Math.round(hy - dy * s);
        const a = 1 - s / len;
        push(x, y, 1, Math.max(0, Math.min(3, Math.floor(a * 4 + bayer(x, y) - 0.5))), 0);
      }
    }
  }

  // Lens droplets: spawn only while rain is active above 0.4; live ones always finish.
  const dropCap = Math.min(Math.floor(MAX_DROPLETS * rm), Math.floor((0.1 * budget) / 9));
  const dr = m.droplets;
  if (!(active === 'rain' && i > 0.4)) m.spawnAcc = 0; // a backlog must not spawn once the gate closes
  else if (dt > 0) {
    m.spawnAcc += dropletRate(i) * rm * dt;
    while (m.spawnAcc >= 1) {
      m.spawnAcc -= 1;
      let live = 0;
      let free = -1;
      for (let j = 0; j < MAX_DROPLETS; j++) (dr[j * 6 + 5] > 0 ? live++ : free < 0 && (free = j));
      if (free < 0 || live >= dropCap) break;
      const q = m.spawnN++;
      const o = free * 6;
      dr[o] = Math.floor(hash(seed + 707, q, 0) * W);
      dr[o + 1] = Math.floor(hash(seed + 707, q, 1) * H * 0.6);
      dr[o + 2] = 0;
      dr[o + 3] = 1 + Math.floor(hash(seed + 708, q, 0) * 3);
      dr[o + 4] = (25 + 35 * hash(seed + 709, q, 0)) * rm;
      dr[o + 5] = 2.4 + 0.6 * hash(seed + 710, q, 0);
    }
  }
  for (let j = 0; j < MAX_DROPLETS; j++) {
    const o = j * 6;
    if (dr[o + 5] <= 0) continue;
    dr[o + 2] += dt;
    dr[o + 1] += dr[o + 4] * dt;
    if (dr[o + 2] >= dr[o + 5]) { dr[o + 5] = 0; continue; }
    push(dr[o], Math.floor(dr[o + 1]), dr[o + 3], dr[o + 2] < 0.5 * dr[o + 5] ? 1 : 0, 0);
  }

  // Snow flakes, then the large near-camera flakes.
  if (m.opacity.snow > 0) {
    const lv = m.level.snow;
    const n = Math.min(Math.round(snowCount(lv) * rm), Math.floor((0.8 * budget) / 9), MAX_PARTICLES);
    const flake = (j: number, mul: number, size: number, style: number, disc: boolean) => {
      const hk = hash(seed + 702, j, 0);
      const drift = (6 + 12 * hash(seed + 712, j, 0)) * (2 * valueNoise(seed + 703 + j, (m.T * rm) / (2 + 3 * hash(seed + 713, j, 0)), 0) - 1);
      const k = (0.1 + 0.4 * hk) * mul;
      const x = Math.floor(wrap(hash(seed + 704, j, 1) * W + k * m.vx + drift + MARGIN, LW));
      const y = Math.floor(wrap(hash(seed + 705, j, 1) * H + k * m.vy + MARGIN, LH));
      if (!disc) { push(x, y, size, style, 1); return; }
      for (let v = 0; v < 8; v++)
        for (let u = 0; u < 8; u++) {
          const r = Math.hypot(u - 3.5, v - 3.5);
          if (r > 4 || (r > 3.2 && bayer(u, v) < (r - 3.2) / 0.8)) continue;
          push(x + u, y + v, 1, r < 2.6 ? 1 : 0, 1);
        }
    };
    for (let j = 0; j < n; j++) {
      if (hash(seed + 706, j, 1) >= m.opacity.snow) continue;
      const size = 1 + Math.floor(hash(seed + 714, j, 0) * 3);
      flake(j, 1, size, 4 - size, false); // 1 px 0.50, 2 px 0.40, 3 px 0.28
    }
    const nl = Math.min(Math.round(largeCount(lv) * rm), Math.floor((0.2 * budget) / 64));
    for (let j = 0; j < nl; j++) {
      if (hash(seed + 706, j, 2) >= m.opacity.snow) continue;
      flake(1000 + j, 1.6 + 0.8 * hash(seed + 715, j, 0), 8, 0, true);
    }
  }
}
