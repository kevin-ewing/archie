// Sun times and legal time for the aerodrome. Pure functions of the calendar date.
//
// Sunrise and sunset use the NOAA general solar position series (fractional-year declination and
// equation of time) with the sun's centre at -0.833° (upper limb on the horizon, standard refraction).
// All hours here are local *solar* time unless a name says "legal".
//
// Legal time: France and Belgium ran on GMT from 11 March 1911 (no daylight saving) and put the clocks
// forward one hour in the night of 14-15 June 1916 (GMT+1). Source for the GMT change: Nature 1911;
// for 1916: Archives 71 "A la bonne heure". The end of the 1916 period and the 1917 and 1918 rows have
// no source yet and are [VERIFY].

import { dayNumber, dayOfYear, type CalDate } from './calendar.ts';

/** Ypres. Longitude is degrees east. */
export const LOCATION = { name: 'Ypres', latitude: 50.85, longitude: 2.88 };

const RAD = Math.PI / 180;
export const HORIZON_ALT = -0.833 * RAD;

export type SunDay = {
  date: CalDate;
  declination: number; // radians, at local noon of the date
  eqTime: number; // minutes (apparent - mean solar time)
  sunrise: number; // solar hours; sun centre at -0.833°
  sunset: number;
  noonElevation: number; // radians
  longitude: number; // degrees east, carried so legal conversions need no second argument
};

let last: { key: string; day: SunDay } | undefined;

export function sunDay(date: CalDate, loc: { latitude: number; longitude: number } = LOCATION): SunDay {
  const key = `${date.year}-${date.month}-${date.day}@${loc.latitude},${loc.longitude}`;
  if (last && last.key === key) return last.day;
  const n = dayOfYear(date); // validates the date
  const leap = dayOfYear({ year: date.year, month: 12, day: 31 }) === 366;
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (n - 1); // local noon: (hour - 12) / 24 = 0
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const phi = loc.latitude * RAD;
  const cosH = (Math.sin(HORIZON_ALT) - Math.sin(phi) * Math.sin(declination)) / (Math.cos(phi) * Math.cos(declination));
  const half = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD / 15; // clamp: rounding must not make NaN
  const noonElevation = Math.asin(Math.max(-1, Math.min(1, Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination))));
  const day: SunDay = { date, declination, eqTime, sunrise: 12 - half, sunset: 12 + half, noonElevation, longitude: loc.longitude };
  last = { key, day };
  return day;
}

/** French summer time, as UTC instants. `verify` rows have no source for an edge yet. */
export const SUMMER_TIME: readonly { from: CalDate; fromHour: number; to: CalDate; toHour: number; verify: boolean }[] = [
  { from: { year: 1916, month: 6, day: 14 }, fromHour: 23, to: { year: 1916, month: 10, day: 1 }, toHour: 23, verify: true }, // start sourced; end [VERIFY]
  { from: { year: 1917, month: 3, day: 24 }, fromHour: 23, to: { year: 1917, month: 10, day: 7 }, toHour: 23, verify: true }, // [VERIFY]
  { from: { year: 1918, month: 3, day: 9 }, fromHour: 23, to: { year: 1918, month: 10, day: 6 }, toHour: 23, verify: true }, // [VERIFY]
];

const SUMMER_HOURS = SUMMER_TIME.map((r) => ({ from: dayNumber(r.from) * 24 + r.fromHour, to: dayNumber(r.to) * 24 + r.toHour }));

/** Legal-time offset from GMT (0 or 1 hour) at a UTC instant. */
export const legalOffset = (utcDayNumber: number, utcHours: number): 0 | 1 => {
  const t = utcDayNumber * 24 + utcHours;
  return SUMMER_HOURS.some((r) => t >= r.from && t < r.to) ? 1 : 0;
};

const wrap24 = (h: number) => ((h % 24) + 24) % 24;

/** UTC instant (hours since 1900-01-01 00:00 UTC) for a solar hour on the sun day's date. */
const utcOf = (day: SunDay, solar: number) => dayNumber(day.date) * 24 + solar - day.longitude / 15 - day.eqTime / 60;

/** Legal clock time (0 ≤ h < 24) for a solar hour on `day`. */
export function legalHours(day: SunDay, solar: number): number {
  const t = utcOf(day, solar);
  const dn = Math.floor(t / 24);
  return wrap24(t - dn * 24 + legalOffset(dn, t - dn * 24));
}

/** Solar hour (0 ≤ h < 24) for a legal clock time on `day`. Exact outside the hour of a transition. */
export function solarHours(day: SunDay, legal: number): number {
  const shift = day.longitude / 15 + day.eqTime / 60;
  const d0 = dayNumber(day.date) * 24;
  // The legal date can be the day before or after the solar date (legal 23.8 for solar 00:00), so try
  // those too. Keep candidates whose solar time lands on `day`'s date, nearest to its solar noon.
  let best: number | undefined;
  for (const k of [-1, 0, 1]) {
    for (const off of [0, 1] as const) {
      const t = d0 + legal - off + 24 * k; // UTC instant if this offset applies
      const dn = Math.floor(t / 24);
      if (legalOffset(dn, t - dn * 24) !== off) continue;
      const solar = t + shift - d0;
      if (solar < -1e-6 || solar > 24 + 1e-6) continue; // tolerance: solar 0 and 24 are the same instant
      if (best === undefined || Math.abs(solar - 12) < Math.abs(best - 12)) best = solar;
    }
  }
  if (best !== undefined) return wrap24(best);
  return wrap24(legal - 1 + shift); // spring-forward gap: the clock hour does not exist; take summer time
}
