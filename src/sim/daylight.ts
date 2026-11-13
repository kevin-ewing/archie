// The campaign clock and the real sun. Time of day drives shadows, light and the watch.
// Sun position is computed properly for Ypres's latitude and the calendar date, so morning shadows
// fall west, noon shadows north, evening shadows east, and long June evenings run late.
// Times are local *solar* time (noon = sun due south); wartime clocks differed, but the sun doesn't.

export const DAYLIGHT = {
  latitude: 50.85, // Ypres
  startDayOfYear: 130, // 10 May 1915 (Second Battle of Ypres)
  startHour: 10, // a sortie starts mid-morning
  /** Game seconds per real second: 05:00 → 22:00 (17 h) in about 12 real minutes. */
  rate: (17 * 3600) / (12 * 60),
  maxShadow: 3, // cap on shadow length per unit of height (very low sun → absurdly long shadows)
  /** The clock slows near sunrise and sunset so the colourful hours last longer: up to this much slower. */
  horizonSlowdown: 0.7,
};

export type Clock = { day: number; hours: number }; // day 0 = the campaign's first day

export const createClock = (hours = DAYLIGHT.startHour): Clock => ({ day: 0, hours });

/** Clock rate multiplier: 1 in full day and deep night, slower while the sun is near the horizon. */
export function clockPace(elevation: number): number {
  const el = elevation / RAD;
  return 1 - DAYLIGHT.horizonSlowdown * Math.max(0, 1 - Math.abs(el - 1) / 16);
}

export function advanceClock(c: Clock, realDt: number, speed = 1): void {
  c.hours += (realDt * DAYLIGHT.rate * speed * clockPace(sunNow(c).elevation)) / 3600;
  while (c.hours >= 24) {
    c.hours -= 24;
    c.day++;
  }
}

export type Sun = {
  azimuth: number; // radians clockwise from north
  elevation: number; // radians above the horizon (negative = below)
  /** Horizontal unit vector toward the sun, world coords (x east, y south). */
  toward: { x: number; y: number };
  /** Horizontal shadow travel per unit of height (0 when the sun is down). */
  shadow: { x: number; y: number };
  /** Direct sunlight, 0 (night / sun on the horizon) … 1 (well up). */
  strength: number;
  /** How visible cast shadows are, 0 … 1: they fade out as the sun drops, so only midday shadows are crisp. */
  shadowStrength: number;
  evening: boolean; // after solar noon
  /** Game minutes from the sun's rising (morning) or setting (evening): negative before, positive after. */
  horizonMinutes: number;
};

const RAD = Math.PI / 180;
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

export const dayOfYear = (c: Clock) => (DAYLIGHT.startDayOfYear + c.day) % 365;

/** Sun position for a day of the year and solar hour. */
export function sunAt(dayOfYearN: number, hours: number, latitude = DAYLIGHT.latitude): Sun {
  const phi = latitude * RAD;
  const decl = -23.44 * RAD * Math.cos((2 * Math.PI * (dayOfYearN + 10)) / 365);
  const hourAngle = (hours - 12) * 15 * RAD;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(decl) * Math.cos(phi) - Math.sin(phi) * Math.cos(hourAngle));
  const toward = { x: Math.sin(azimuth), y: -Math.cos(azimuth) };
  const len = elevation > 0.5 * RAD ? Math.min(DAYLIGHT.maxShadow, 1 / Math.tan(elevation)) : 0;
  return {
    azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI),
    elevation,
    toward,
    shadow: { x: -toward.x * len, y: -toward.y * len },
    strength: smooth(elevation / (8 * RAD)),
    shadowStrength: smooth((elevation - 12 * RAD) / (36 * RAD)), // none below 12°, full from 48° (May noon here is ~57°)
    evening: hours > 12,
    horizonMinutes: (hours - (hours > 12 ? sunsetHour(dayOfYearN, latitude) : 24 - sunsetHour(dayOfYearN, latitude))) * 60,
  };
}

export const sunNow = (c: Clock) => sunAt(dayOfYear(c), c.hours);

/** Solar hour the sun sets (elevation crosses 0) on a day. */
export function sunsetHour(dayOfYearN: number, latitude = DAYLIGHT.latitude): number {
  const phi = latitude * RAD;
  const decl = -23.44 * RAD * Math.cos((2 * Math.PI * (dayOfYearN + 10)) / 365);
  const cosH = -Math.tan(phi) * Math.tan(decl);
  return 12 + (Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD) / 15;
}
