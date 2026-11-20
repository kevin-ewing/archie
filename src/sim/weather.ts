// Weather System: a pure function of (weather seed, calendar date, solar hour) -> WeatherState.
// Wet days come from the Seasons daily model (read-only), so the sky agrees with the ground. Weather only sets the
// cloud amount and rain/snow; it never touches terrain, seasons, flight or the clock.
// No Math.random, no wall clock, no DOM, no render/world imports: randomness is core/noise only.

import { dayNumber, dayOfYear, fromDayNumber, type CalDate } from './calendar.ts';
import { dailyValue } from './climate.ts';
import { weatherDay } from './seasons.ts';
import { hash, valueNoise } from '../core/noise.ts';

export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'snow';
export type Precipitation = 'none' | 'rain' | 'snow';
export type WeatherState = {
  kind: WeatherKind;
  precipitation: Precipitation;
  intensity: number; // 0..1, continuous
  cloudCover: number; // 0..1, continuous
  coverKey: number; // integer 0..7: bucket of the cover at the start of the current 10-minute cell
};

export const COVER_KEYS = 8;
export const NEUTRAL_KEY = 4;
export const NEUTRAL_COVER = 9 / 16;
export const coverOfKey = (k: number) => (2 * k + 1) / 16;
export const keyOfCover = (c: number) => Math.min(COVER_KEYS - 1, Math.max(0, Math.floor(c * COVER_KEYS)));

const WET_COVER = 13 / 16; // centre of key 6: rain never falls from a gap-filled sky
const SNOW_BELOW_C = 1.5; // the threshold stepGround uses
const FIRST_DAY = dayNumber({ year: 1900, month: 1, day: 1 });
const LAST_DAY = dayNumber({ year: 2100, month: 12, day: 31 });
const MEAN = [0.72, 0.68, 0.62, 0.56, 0.52, 0.5, 0.48, 0.48, 0.52, 0.6, 0.7, 0.74]; // monthly mean dry-sky cover [VERIFY]

// Monthly ceiling on the dry-sky cover: below key 7 from February to October, so the gaps between showers are never overcast.
const CEIL = [0.95, 0.87, 0.87, 0.87, 0.87, 0.87, 0.87, 0.87, 0.87, 0.87, 0.95, 0.95];

const smooth = (x: number) => {
  const c = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

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
const key = (n: number, seed: number) => n * 4294967296 + (seed >>> 0);

// ---------------------------------------------------------------- day schedule

type Spell = { s: number; e: number }; // minutes of the day
type Day = { snow: boolean; peak: number; ramp: number; spells: Spell[] };

const dayCache = memo<Day>(16);
const NO_SPELLS: Day = { snow: false, peak: 0, ramp: 1, spells: [] };

function schedule(seed: number, n: number): Day {
  const k = key(n, seed);
  const hit = dayCache.get(k);
  if (hit) return hit;
  const w = weatherDay(n, seed);
  let day = NO_SPELLS;
  if (w.rain > 0) {
    const peak = Math.min(1, 0.15 + 0.85 * Math.pow(w.rain, 0.6));
    const snow = w.t < SNOW_BELOW_C;
    const month = fromDayNumber(n).month;
    const spells: Spell[] = [];
    let ramp: number;
    if (month >= 3 && month <= 9) {
      // showers: 1-3 spells of 1.75-1.95 h, each in its own 4 h slot between 02:00 and 22:00
      ramp = 52;
      const count = 1 + (hash(seed + 612, n, 0) < 0.5 ? 1 : 0) + (hash(seed + 612, n, 1) < 0.25 ? 1 : 0);
      const slots = [0, 1, 2, 3, 4].sort((a, b) => hash(seed + 613, n, a) - hash(seed + 613, n, b)).slice(0, count).sort((a, b) => a - b);
      for (const i of slots) {
        const L = 1.75 + 0.2 * hash(seed + 614, n, i);
        const start = 2 + 4 * i + 0.55 + (4 - L - 1.1) * hash(seed + 615, n, i);
        spells.push({ s: start * 60, e: (start + L) * 60 });
      }
    } else {
      // steady: one long spell of 3.2-9 h
      ramp = 60;
      const L = 3.2 + 5.8 * hash(seed + 610, n, 0);
      const start = 0.25 + (23.5 - L) * hash(seed + 611, n, 0);
      spells.push({ s: start * 60, e: (start + L) * 60 });
    }
    day = { snow, peak, ramp, spells };
  }
  dayCache.set(k, day);
  return day;
}

function intensityOf(d: Day, minutes: number): number {
  let best = 0;
  for (const { s, e } of d.spells) {
    const v = smooth((minutes - s) / d.ramp) * smooth((e - minutes) / d.ramp);
    if (v > best) best = v;
  }
  return d.peak * best;
}

// ---------------------------------------------------------------- cloud cover

const targetCache = memo<number>(32);

/** Dry-sky cover target for 3-hour period g (global: day * 8 + slot). */
function target(seed: number, g: number): number {
  const k = key(g, seed);
  const hit = targetCache.get(k);
  if (hit !== undefined) return hit;
  const doy = dayOfYear(fromDayNumber(Math.floor(g / 8)));
  const m = dailyValue(MEAN, doy);
  const v = m + 0.28 * (valueNoise(seed + 601, g / 6, 0) * 2 - 1) + 0.1 * (hash(seed + 602, g, 0) * 2 - 1);
  const c = Math.min(dailyValue(CEIL, doy), Math.max(0.05, v));
  targetCache.set(k, c);
  return c;
}

function coverAt(seed: number, n: number, hours: number): number {
  const q = n * 8 + hours / 3 - 0.5;
  const g = Math.floor(q);
  const a = target(seed, g);
  const b = target(seed, g + 1);
  const base = a + (b - a) * smooth(q - g);
  // cloud-up envelope around every spell of yesterday, today and tomorrow: full 10 min before a spell until it ends
  const minutes = hours * 60;
  let up = 0;
  for (let o = -1; o <= 1; o++) {
    const d = schedule(seed, n + o);
    for (const { s, e } of d.spells) {
      const t = minutes - o * 1440;
      const v = smooth((t - (s - 115)) / 105) * smooth((e + 105 - t) / 105);
      if (v > up) up = v;
    }
  }
  return Math.max(base, WET_COVER * up);
}

// ---------------------------------------------------------------- public

/** Throws RangeError naming `hours` for anything not a finite number in [0, 24), or `date` for a day outside 1900..2100. */
export function weatherAtDay(seed: number, dayNumberOf: number, hours: number): WeatherState {
  if (!Number.isInteger(dayNumberOf) || dayNumberOf < FIRST_DAY || dayNumberOf > LAST_DAY) {
    throw new RangeError(`Invalid date: day number ${dayNumberOf} is outside 1900-01-01..2100-12-31.`);
  }
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours >= 24) {
    throw new RangeError(`Invalid hours: ${hours} is not in [0, 24).`);
  }
  const n = dayNumberOf;
  const day = schedule(seed, n);
  const intensity = intensityOf(day, hours * 60);
  const cloudCover = coverAt(seed, n, hours);
  const coverKey = keyOfCover(coverAt(seed, n, Math.floor(hours * 6) / 6));
  const precipitation: Precipitation = intensity > 0 ? (day.snow ? 'snow' : 'rain') : 'none';
  const kind: WeatherKind = intensity > 0.02 ? (day.snow ? 'snow' : 'rain') : coverKey <= 1 ? 'clear' : coverKey === 7 ? 'overcast' : 'cloudy';
  return { kind, precipitation, intensity, cloudCover, coverKey };
}

export function weatherAt(seed: number, date: CalDate, hours: number): WeatherState {
  let n: number;
  try {
    n = dayNumber(date);
  } catch (e) {
    throw new RangeError(`Invalid date: ${(e as Error).message}`);
  }
  return weatherAtDay(seed, n, hours);
}

/** Tests only. */
export function clearWeatherCache(): void {
  dayCache.clear();
  targetCache.clear();
}
