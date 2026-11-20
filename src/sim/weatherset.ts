// Weather settings: validation, URL overrides, and the override > game setting > generated precedence.
// Pure: no Math.random, no wall clock, no DOM, no render/world imports.

import { keyOfCover, weatherAtDay, type WeatherKind, type WeatherState } from './weather.ts';

export type WeatherSetting = { kind: WeatherKind; intensity?: number; cloudCover?: number };
export type WeatherOverride = { kind?: WeatherKind; intensity?: number; cloud?: number; seed?: number };
export type WeatherSource = 'generated' | 'game state' | 'override';

export const DEFAULTS = { rain: 0.6, snow: 0.5, clear: 3 / 16, cloudy: 11 / 16, overcast: 15 / 16, wet: 13 / 16 };
const KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'overcast', 'rain', 'snow'];
const MAX_SEED = 2 ** 31 - 1;

const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isKind = (v: unknown): v is WeatherKind => typeof v === 'string' && (KINDS as readonly string[]).includes(v);
const isSeed = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SEED;

/** Throws `Invalid weather setting: <field>.` for anything that is not a known kind with optional 0..1 numbers. */
export function readWeatherSetting(v: unknown): WeatherSetting {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('Invalid weather setting: value.');
  const o = v as Record<string, unknown>;
  if (!isKind(o.kind)) throw new Error('Invalid weather setting: kind.');
  if (o.intensity !== undefined && !unit(o.intensity)) throw new Error('Invalid weather setting: intensity.');
  if (o.cloudCover !== undefined && !unit(o.cloudCover)) throw new Error('Invalid weather setting: cloudCover.');
  const s: WeatherSetting = { kind: o.kind };
  if (o.intensity !== undefined) s.intensity = o.intensity as number;
  if (o.cloudCover !== undefined) s.cloudCover = o.cloudCover as number;
  return s;
}

/** An integer from 0 to 2^31-1. */
export function readWeatherSeed(v: unknown): number {
  if (!isSeed(v)) throw new Error(`Invalid weather seed: expected an integer from 0 to ${MAX_SEED}.`);
  return v;
}

const NUMBER = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i; // same as parseOverrides in seasons.ts
/** Pure. Malformed or out-of-range values are dropped and described once each in `problems`; the rest are kept. */
export function parseWeatherOverrides(search: string): { overrides: WeatherOverride; problems: string[] } {
  const overrides: WeatherOverride = {};
  const problems: string[] = [];
  const q = new URLSearchParams(search);
  const kind = q.get('weather');
  if (kind !== null) {
    if (isKind(kind)) overrides.kind = kind;
    else problems.push(`weather=${kind}: expected one of ${KINDS.join(', ')}`);
  }
  for (const [name, field] of [['precip', 'intensity'], ['cloud', 'cloud']] as const) {
    const raw = q.get(name);
    if (raw === null) continue;
    const v = NUMBER.test(raw) ? Number(raw) : NaN;
    if (!(v >= 0 && v <= 1)) problems.push(`${name}=${raw}: expected a number from 0 to 1`);
    else overrides[field] = v;
  }
  const seed = q.get('weatherSeed');
  if (seed !== null) {
    const v = /^\s*\d+\s*$/.test(seed) ? Number(seed) : NaN;
    if (!isSeed(v)) problems.push(`weatherSeed=${seed}: expected an integer from 0 to ${MAX_SEED}`);
    else overrides.seed = v;
  }
  return { overrides, problems };
}

/** `weather=rain&precip=0.6&cloud=0.9`; absent fields are left out. */
export function formatWeatherSetting(s: WeatherSetting): string {
  let out = `weather=${s.kind}`;
  if (s.intensity !== undefined) out += `&precip=${s.intensity}`;
  if (s.cloudCover !== undefined) out += `&cloud=${s.cloudCover}`;
  return out;
}

/** Replace only the fields `set` names; never mutates `base`. A forced cover is honoured as given. */
export function applyWeather(base: WeatherState, set: Partial<WeatherSetting> & { cloud?: number }): WeatherState {
  const cover = set.cloudCover ?? set.cloud;
  let { precipitation, intensity, cloudCover } = base;
  let kind: WeatherKind | null = set.kind ?? null;
  if (kind === 'rain' || kind === 'snow') {
    precipitation = kind;
    intensity = set.intensity ?? DEFAULTS[kind];
    cloudCover = cover ?? Math.max(base.cloudCover, DEFAULTS.wet);
  } else if (kind !== null) {
    precipitation = 'none';
    intensity = 0;
    cloudCover = cover ?? DEFAULTS[kind];
  } else if (set.intensity !== undefined) {
    intensity = set.intensity;
    if (intensity > 0) {
      precipitation = base.precipitation === 'none' ? 'rain' : base.precipitation;
      cloudCover = cover ?? Math.max(base.cloudCover, DEFAULTS.wet);
    } else {
      precipitation = 'none';
      cloudCover = cover ?? base.cloudCover;
    }
  } else if (cover !== undefined) {
    cloudCover = cover;
  } else {
    return base;
  }
  const coverKey = keyOfCover(cloudCover);
  kind ??= intensity > 0.02 ? (precipitation === 'snow' ? 'snow' : 'rain') : coverKey <= 1 ? 'clear' : coverKey === 7 ? 'overcast' : 'cloudy';
  return { kind, precipitation, intensity, cloudCover, coverKey };
}

/** Override, then game setting, then generated weather; each layer replaces only the fields it names. */
export function resolveWeather(a: {
  worldSeed: number;
  weatherSeed: number | null;
  setting: WeatherSetting | null;
  override: WeatherOverride | null;
  day: number;
  hours: number;
}): { state: WeatherState; source: WeatherSource; seed: number } {
  const seed = a.override?.seed ?? a.weatherSeed ?? a.worldSeed;
  let state = weatherAtDay(seed, a.day, a.hours);
  let source: WeatherSource = 'generated';
  if (a.setting) {
    state = applyWeather(state, a.setting);
    source = 'game state';
  }
  const o = a.override;
  if (o && (o.kind !== undefined || o.intensity !== undefined || o.cloud !== undefined || o.seed !== undefined)) {
    state = applyWeather(state, o);
    source = 'override';
  }
  return { state, source, seed };
}
