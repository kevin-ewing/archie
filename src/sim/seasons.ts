// Season_State: what the land looks like on a calendar date. A pure function of (date, seed): nothing is
// simulated while flying. Ground states (snow, frost, mud, standing water, ice, water level) come from a
// 30-day fold of a small hidden daily weather model; the weather itself is never exposed or drawn.
//
// Every number here that is a date or a rate is a tuning value, [VERIFY] against northern-France sources
// (see climate.ts). `MAY_LOOK` is the default look for tiles requested without a season; the dates themselves
// (10 May included) are never pulled toward it, so every value eases smoothly through the year.

import { dayNumber, dayOfYear, fromDayNumber, parseISO, REFERENCE, type CalDate } from './calendar.ts';
import { ANCHORS, dailyValue, ERA_OFFSET_C, meanTempC, NORMALS, PHENOLOGY, type Anchor } from './climate.ts';
import { sunDay } from './sun.ts';
import { hash, valueNoise } from '../core/noise.ts';

export type CropName = 'ploughed' | 'young wheat' | 'meadow' | 'rough grass' | 'pasture' | 'colza in flower' | 'red clover' | 'young flax';
export type BloomKind = 'poppy' | 'cornflower' | 'buttercup' | 'daisy' | 'clover' | 'bluebell' | 'hawthorn' | 'cowParsley' | 'colza';

export const CROP_NAMES: readonly CropName[] = ['ploughed', 'young wheat', 'meadow', 'rough grass', 'pasture', 'colza in flower', 'red clover', 'young flax'];
export const BLOOM_KINDS: readonly BloomKind[] = ['poppy', 'cornflower', 'buttercup', 'daisy', 'clover', 'bluebell', 'hawthorn', 'cowParsley', 'colza'];

export type SeasonState = {
  date: CalDate;
  doy: number;
  daylength: number; // hours, 7-17
  foliage: number; // 0-1 species-average leaf cover
  budding: number; // 0-1 pale-green bud-burst share
  autumnColour: number; // 0-1
  leafDays: number; // days since this year's bud burst (negative = before)
  fallDays: number; // days since this year's autumn colour started (negative = before)
  grassGreen: number; // 0-1: 0 dormant winter grass, 1 green
  grassDry: number; // -1 lush (June) .. 0 (May) .. 1 parched pale (September)
  cropStages: Record<CropName, number>; // 0 bare, 1 blades, 2 green, 3 ripe, 4 stubble (continuous)
  cropRange: Record<CropName, number[]>; // the stage CROP_SPREAD days either side, so each field can run early or late
  bloom: Record<BloomKind, number>; // 0-1 per kind; multiplies the spatial bloom
  hay: number; // 0-1 haymaking
  snow: number;
  frost: number;
  mud: number;
  standingWater: number;
  ice: number; // 0-1
  waterLevel: number; // 0-1, 0 = the existing May shore
  haze: number; // 0-1
  skyBias: number; // -1 (winter) .. +1 (summer), 0 on the Reference_Date
};

const smooth = (x: number) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mixN = (a: number, b: number, t: number) => a + (b - a) * t;

const allOf = <K extends string>(keys: readonly K[], v: number) => Object.fromEntries(keys.map((k) => [k, v])) as Record<K, number>;
/** Day offsets at which `cropRange` samples each crop's stage: a field picks its own point in between (world/season.ts). */
export const CROP_SPREAD = [-16, -8, 0, 8, 16] as const;

/** The neutral state: every seasonal operation is the identity here. Equals the 10 May 1915 look. */
const refSun = sunDay(REFERENCE);
export const MAY_LOOK: SeasonState = {
  date: REFERENCE,
  doy: dayOfYear(REFERENCE),
  daylength: refSun.sunset - refSun.sunrise,
  foliage: 1,
  budding: 0,
  autumnColour: 0,
  leafDays: 60,
  fallDays: -60,
  grassGreen: 1,
  grassDry: 0,
  cropStages: { ...allOf(CROP_NAMES, 2), ploughed: 0 },
  cropRange: Object.fromEntries(CROP_NAMES.map((k) => [k, CROP_SPREAD.map(() => (k === 'ploughed' ? 0 : 2))])) as Record<CropName, number[]>,
  // 10 May: buttercups, daisies, bluebells, hawthorn, cow parsley and colza are out; poppies, cornflowers and clover
  // flower later, and haymaking starts in June (PHENOLOGY in climate.ts).
  bloom: { ...allOf(BLOOM_KINDS, 1), poppy: 0, cornflower: 0, clover: 0 },
  hay: 0,
  snow: 0,
  frost: 0,
  mud: 0,
  standingWater: 0,
  ice: 0,
  waterLevel: 0,
  haze: 0,
  skyBias: 0,
};

// ---------------------------------------------------------------- small caches

function memo<V>(cap: number) {
  const m = new Map<number, V>();
  return {
    get: (k: number) => m.get(k),
    set(k: number, v: V) {
      if (m.size >= cap) m.delete(m.keys().next().value as number);
      m.set(k, v);
    },
    clear: () => m.clear(),
  };
}
const dayKey = (n: number, seed: number) => n * 4294967296 + (seed >>> 0);

// ---------------------------------------------------------------- year-level draws

type YearDraws = { bud: number; autumn: number; harvest: number; bloom: Record<BloomKind, number> };
const draw = (seed: number, year: number, k: number, spread: number) => Math.round((hash(seed + 560 + k, year, 0) * 2 - 1) * spread);

function yearDraws(seed: number, year: number): YearDraws {
  const P = PHENOLOGY;
  const bloom = {} as Record<BloomKind, number>;
  BLOOM_KINDS.forEach((k, i) => (bloom[k] = draw(seed, year, 3 + i, P.bloomShift)));
  // 1915 is capped 4 days early: the Reference_Date must look as today (full leaf), so spring 1915 is never late.
  const bud = P.budDay.centre + draw(seed, year, 0, P.budDay.spread);
  return {
    bud: year === REFERENCE.year ? Math.min(bud, P.budDay.centre - 4) : bud,
    autumn: P.autumnDay.centre + draw(seed, year, 1, P.autumnDay.spread),
    harvest: draw(seed, year, 2, P.harvestShift),
    bloom,
  };
}

// ---------------------------------------------------------------- crops

type Pt = readonly [number, number]; // [day of year, stage]

/** Cyclic piecewise-linear value over a 365-day year; `pts` sorted by day. */
function cyclic(pts: readonly Pt[], doy: number): number {
  const d = ((((doy - 1) % 365) + 365) % 365) + 1;
  const n = pts.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) if (pts[i][0] <= d) j = i;
  const a = pts[j];
  const b = pts[(j + 1) % n];
  const ad = d < pts[0][0] ? a[0] - 365 : a[0];
  const bd = b[0] <= ad ? b[0] + 365 : b[0];
  return mixN(a[1], b[1], (d - ad) / (bd - ad));
}

// Winter wheat: blades from December, green by late April, ripe late July, harvested in August; the stubble is
// ploughed in through September and October. Colza: green rosettes all winter (in flower April-May, see bloom),
// ripe in June, cut in July, sown again in September. Flax and red clover: sown in spring. [VERIFY] every day.
function cropStages(doy: number, harvest: number): Record<CropName, number> {
  const h = harvest;
  const wheat: Pt[] = [[60, 1.2], [110, 2], [150, 2], [200 + h, 3], [222 + h, 4], [255, 4], [295, 0], [310, 0], [345, 1]];
  const colza: Pt[] = [[150, 2], [178 + h, 3], [198 + h, 4], [225, 4], [245, 0], [265, 0], [285, 1], [320, 2]];
  const spring: Pt[] = [[85, 0], [125, 2], [200 + h, 2], [232 + h, 3], [258 + h, 4], [275, 4], [300, 0]];
  return {
    ploughed: 0,
    'young wheat': cyclic(wheat, doy),
    meadow: 2,
    'rough grass': 2,
    pasture: 2,
    'colza in flower': cyclic(colza, doy),
    'red clover': cyclic(spring, doy),
    'young flax': cyclic(spring, doy),
  };
}

/** 0 outside [a, b], 1 from a+ramp to b-ramp, smooth between. */
const trap = (doy: number, a: number, b: number, ramp = 10) => smooth(Math.min(doy - a, b - doy) / ramp);

// ---------------------------------------------------------------- hidden daily weather

type Weather = { t: number; tmin: number; rain: number; doy: number };

const weatherCache = memo<Weather>(64);

function anchorBias(n: number, list: readonly Anchor[]) {
  let wetProb = 1;
  let wetAmount = 1;
  let temp = 0;
  let force: { rain: number; t: number } | undefined;
  for (const a of list) {
    if (!a.applies || n < dayNumber(a.from) || n > dayNumber(a.to)) continue;
    wetProb *= a.bias.wetProb ?? 1;
    wetAmount *= a.bias.wetAmount ?? 1;
    temp += a.bias.temp ?? 0;
    if (a.bias.force) force = a.bias.force;
  }
  return { wetProb, wetAmount, temp, force };
}

/** Pure per-day weather (n = day number). Includes the slow Anomaly (one lattice cell = 14 days). */
export function weatherDay(n: number, seed: number): Weather {
  const key = dayKey(n, seed);
  const hit = weatherCache.get(key);
  if (hit) return hit;
  const doy = dayOfYear(fromDayNumber(n));
  const A = anchorBias(n, ANCHORS);
  const anomaly = 2.5 * (valueNoise(seed + 515, n / 14, 0) * 2 - 1);
  const daily = 3.5 * (valueNoise(seed + 520, n / 4, 0) * 2 - 1);
  let t = meanTempC(doy) + ERA_OFFSET_C + anomaly + daily + A.temp;
  const wetProb = clamp01((dailyValue(NORMALS.wetDays, doy) / 30.4) * A.wetProb);
  const perWetDayMm = dailyValue(NORMALS.precipMm, doy) / dailyValue(NORMALS.wetDays, doy);
  let rain = hash(seed + 521, n, 0) < wetProb ? Math.min(1, (-Math.log(1 - 0.95 * hash(seed + 522, n, 0)) * perWetDayMm * A.wetAmount) / 15) : 0;
  if (A.force) {
    rain = A.force.rain;
    t = A.force.t;
  }
  const range = dailyValue(NORMALS.rangeC, doy);
  const w = { t, tmin: t - range / 2, rain, doy };
  weatherCache.set(key, w);
  return w;
}

// ---------------------------------------------------------------- ground fold

export type Ground = { snow: number; mud: number; water: number; level: number; ice: number; frost: number };

const SLEW = 0.28; // max one-day change of a ground state (the design's 0.35, less the cap ramp's share)
const slew = (prev: number, target: number, max = SLEW) => clamp01(prev + Math.max(-max, Math.min(max, target - prev)));
const ramp = (t: number, from: number, to: number, a: number, b: number) => mixN(a, b, clamp01((t - from) / (to - from)));

/** One day of ground change. Exported for tests (thaw behaviour). */
export function stepGround(g: Ground, w: { t: number; tmin: number; rain: number }): Ground {
  const snowing = w.t < 1.5;
  const snowfall = snowing ? w.rain : 0;
  const rainfall = snowing ? 0 : w.rain;
  // Lying snow melts slowly (a few days to a week or two in a mild spell), faster in rain.
  const melt = Math.min(g.snow, 0.012 * Math.max(0, w.t) + 0.05 * rainfall);
  const snow = slew(g.snow, g.snow + 0.9 * snowfall - melt);
  const frozen = w.tmin < -2 ? 0.5 : 1;
  const mud = slew(g.mud, (g.mud * ramp(w.t, 5, 18, 0.93, 0.6) + 0.35 * rainfall + 0.15 * melt) * frozen);
  const water = slew(g.water, g.water * ramp(w.t, 5, 18, 0.9, 0.5) + 0.25 * rainfall + 0.1 * melt);
  const level = slew(g.level, g.level * 0.93 + 0.1 * w.rain, 0.04);
  // Lake ice builds over a run of cold days and nights and goes in a thaw.
  const ice = slew(g.ice, g.ice + (w.t < 3 ? 0.07 * Math.max(0, 1.5 - w.t) + 0.03 * Math.max(0, -w.tmin) : 0) - 0.05 * Math.max(0, w.t - 2));
  const frost = slew(g.frost, w.tmin < 0 && snow < 0.3 ? smooth(-w.tmin / 4) : 0);
  return { snow, mud, water, level, ice, frost };
}

/** Start of the fold: the climatological middle for that time of year, with no snow, ice or frost. */
function equilibrium(doy: number): Ground {
  const wet = dailyValue(NORMALS.precipMm, doy) / 65;
  return { snow: 0, mud: 0.2 * wet, water: 0.08 * wet, level: 0.2 * wet, ice: 0, frost: 0 };
}

/** Days of weather folded into a date's ground states. */
const FOLD_DAYS = 30;
function fold(n: number, seed: number) {
  let g = equilibrium(weatherDay(n - FOLD_DAYS, seed).doy);
  let t14 = 0;
  let rain14 = 0;
  for (let i = n - FOLD_DAYS; i <= n; i++) {
    const w = weatherDay(i, seed);
    g = stepGround(g, w);
    if (i > n - 14) {
      t14 += w.t / 14;
      rain14 += w.rain / 14;
    }
  }
  return { g, t14, rain14 };
}

/** 0 from 1 May to 30 September, 1 from 15 October to 15 April, linear ramps between (non-leap day count). */
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export function coldCap(date: CalDate): number {
  const d = CUM[date.month - 1] + date.day;
  if (d >= 288 || d <= 105) return 1;
  if (d >= 121 && d <= 273) return 0;
  return d < 121 ? 1 - (d - 105) / 16 : (d - 273) / 15;
}

/** A light snow floor through December, easing in from late November and out in early January. [VERIFY] a game choice, not climate. */
const DECEMBER_SNOW: Pt[] = [[1, 0.1], [14, 0], [328, 0], [340, 0.14], [365, 0.13]];
/** Ground frost only from early October to early April (none later in spring). */
const FROST_SEASON: Pt[] = [[80, 1], [96, 0], [275, 0], [300, 1]];

// ---------------------------------------------------------------- the state

const R = (doy: number) => -Math.cos((2 * Math.PI * (doy - 12)) / 365);
const R0 = R(MAY_LOOK.doy);
const skyBiasOf = (doy: number) => {
  const r = R(doy);
  return r >= R0 ? (0.9 * (r - R0)) / (1 - R0) : (r - R0) / (1 + R0);
};

function compute(date: CalDate, seed: number): SeasonState {
  const n = dayNumber(date);
  const realDoy = dayOfYear(date);
  // Phenology anchors are common-year days: after 29 Feb in a leap year, count one day less so they mean the same calendar dates.
  const doy = realDoy - (realDoy > 60 && dayOfYear({ year: date.year, month: 12, day: 31 }) === 366 ? 1 : 0);
  const Y = yearDraws(seed, date.year);
  const P = PHENOLOGY;

  const leafDays = doy - Y.bud;
  const fallDays = doy - Y.autumn;
  const drop = smooth((fallDays - 14) / 36);
  const foliage = smooth(leafDays / 18) * (1 - drop);
  // Pale-green share: half-cosine rise over leafDays -8..8, fall over 8..26 (each under 0.1 a day).
  const budding = leafDays <= -8 || leafDays >= 26 ? 0 : leafDays < 8 ? 0.5 - 0.5 * Math.cos((Math.PI * (leafDays + 8)) / 16) : 0.5 + 0.5 * Math.cos((Math.PI * (leafDays - 8)) / 18);
  const autumnColour = smooth(fallDays / 20) * (1 - drop);

  const { g, t14, rain14 } = fold(n, seed);
  const cap = coldCap(date);

  const bloom = {} as Record<BloomKind, number>;
  for (const k of BLOOM_KINDS) {
    const [a, b] = P.bloom[k];
    bloom[k] = trap(doy, a + Y.bloom[k], b + Y.bloom[k], P.bloomRamp); // flowers come and go over a few weeks
  }
  // Grass greens up with the spring (earlier or later with the year's bud burst), parches pale in late summer,
  // and dies back to winter straw from October.
  const dB = Y.bud - P.budDay.centre;
  const grassGreen = cyclic([[70, 0], [95 + dB, 0.2], [118 + dB, 0.75], [132, 1], [250, 1], [290, 0.6], [318, 0.2], [340, 0]], doy);
  const grassDry = cyclic([[130, 0], [165, -0.6], [195, -0.2], [225, 0.5], [255, 1], [285, 0.7], [320, 0]], doy);
  const range = CROP_SPREAD.map((o) => cropStages(doy + o, Y.harvest));
  const cropRange = Object.fromEntries(CROP_NAMES.map((k) => [k, range.map((r) => r[k])])) as Record<CropName, number[]>;
  const wet = clamp01(rain14 / 0.25);
  const cold = clamp01((12 - t14) / 12);

  return {
    date,
    doy: realDoy,
    daylength: sunDay(date).sunset - sunDay(date).sunrise,
    foliage,
    budding,
    autumnColour,
    leafDays,
    fallDays,
    grassGreen,
    grassDry,
    cropStages: range[CROP_SPREAD.indexOf(0)],
    cropRange,
    bloom,
    hay: trap(doy, P.hay[0] + Y.harvest, P.hay[1] + Y.harvest, P.bloomRamp),
    // December always carries at least a light snow, lying in the lee of hedges and in the furrows.
    snow: Math.max(g.snow * cap, cyclic(DECEMBER_SNOW, doy)),
    frost: g.frost * cyclic(FROST_SEASON, doy),
    mud: g.mud,
    standingWater: g.water,
    ice: g.ice * cap,
    waterLevel: g.level,
    haze: 0.6 * wet * (0.4 + 0.6 * cold),
    skyBias: skyBiasOf(doy),
  };
}

const stateCache = memo<SeasonState>(64);

/** The Season_State for a date. Pure in (date, seed); the cache only saves work. Do not mutate the result. */
export function seasonAt(date: CalDate, seed: number): SeasonState {
  const key = dayKey(dayNumber(date), seed);
  const hit = stateCache.get(key);
  if (hit) return hit;
  const s = compute(date, seed);
  stateCache.set(key, s);
  return s;
}

/** Test helper: forget every cached value (results must not change). */
export function clearSeasonCache(): void {
  stateCache.clear();
  weatherCache.clear();
}

// ---------------------------------------------------------------- tile key

// Bucket sizes are the smallest visible step of each value (16.4): tuning constants.
/** 31-bit hash of the bucketed state. Equal buckets, equal key; `haze` and `skyBias` only touch the grade. */
export function seasonKey(s: SeasonState): number {
  const q = (v: number, steps: number) => Math.round(v * steps);
  const vals = [
    q(s.foliage, 16), q(s.budding, 8), q(s.autumnColour, 8), q(s.grassGreen, 8), q(s.grassDry, 8),
    // Trees and fields ease a little every day (each on its own day), so the day itself is part of the key.
    Math.round(s.leafDays), Math.round(s.fallDays),
    ...CROP_NAMES.flatMap((k) => s.cropRange[k].map((v) => q(v, 16))),
    ...BLOOM_KINDS.map((k) => q(s.bloom[k], 4)),
    q(s.hay, 4), q(s.snow, 10), q(s.frost, 6), q(s.mud, 8), q(s.standingWater, 8), q(s.waterLevel, 6), q(s.ice, 8),
  ];
  let h = 2166136261;
  for (const v of vals) h = Math.imul(h ^ v, 16777619);
  return (h ^ (h >>> 15)) & 0x7fffffff;
}

// ---------------------------------------------------------------- debug overrides
export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn';
export type OverrideParam = 'snow' | 'frost' | 'mud' | 'standingWater' | 'ice' | 'foliage' | 'haze';
export type Overrides = { date?: CalDate; season?: SeasonName; params?: Partial<Record<OverrideParam, number>> };
/** The middle date of each season in the Reference year. */
export const SEASON_DATES: Record<SeasonName, CalDate> = {
  winter: { year: 1915, month: 1, day: 21 },
  spring: { year: 1915, month: 4, day: 21 },
  summer: { year: 1915, month: 7, day: 21 },
  autumn: { year: 1915, month: 10, day: 21 },
};
const PARAM_KEYS: Record<string, OverrideParam> = { snow: 'snow', frost: 'frost', mud: 'mud', water: 'standingWater', ice: 'ice', foliage: 'foliage', haze: 'haze' };
/** Pure. Malformed or out-of-range values are dropped and described in `problems`; the rest are kept. */
export function parseOverrides(search: string): { overrides: Overrides; problems: string[] } {
  const overrides: Overrides = {};
  const problems: string[] = [];
  const q = new URLSearchParams(search);
  const date = q.get('date');
  if (date !== null) {
    try {
      overrides.date = parseISO(date);
    } catch (e) {
      problems.push(`date=${date}: ${e instanceof Error ? e.message : 'invalid date'}`);
    }
  }
  const season = q.get('season');
  if (season !== null) {
    if (Object.hasOwn(SEASON_DATES, season)) overrides.season = season as SeasonName;
    else problems.push(`season=${season}: expected one of ${Object.keys(SEASON_DATES).join(', ')}`);
  }
  for (const [name, key] of Object.entries(PARAM_KEYS)) {
    const raw = q.get(name);
    if (raw === null) continue;
    const v = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(raw) ? Number(raw) : NaN;
    if (!(v >= 0 && v <= 1)) problems.push(`${name}=${raw}: expected a number from 0 to 1`);
    else (overrides.params ??= {})[key] = v;
  }
  return { overrides, problems };
}
/** Replace the named fields. Returns `state` itself when there are none; never mutates it. */
export function applyOverrides(state: SeasonState, overrides: Overrides): SeasonState {
  return overrides.params ? { ...state, ...overrides.params } : state;
}
