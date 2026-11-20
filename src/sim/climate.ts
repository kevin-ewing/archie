// Climatology, historical anchors and phenology for the seasons system. Data only, pure.
//
// Sources and units, one line per row. [VERIFY] marks a value that does not come from
// northern France 1914-16 and must be checked before it is relied on.
//
// NORMALS.meanC    °C   Lille-Lesquin 1991-2020 monthly daily mean, Météo-France as tabulated at
//                       https://en.wikipedia.org/wiki/Lille . [VERIFY] Lille stands in for Ypres
//                       (about 100 km away) and a modern climate stands in for 1915.
// NORMALS.rangeC   °C   Same source: daily max minus daily min per month. [VERIFY] same stand-ins.
// NORMALS.precipMm mm   Same source: monthly precipitation. [VERIFY] same stand-ins.
// NORMALS.wetDays  days Same source: days with at least 1 mm per month. [VERIFY] same stand-ins.
// ERA_OFFSET_C     °C   Guess for 1915 against 1991-2020. [VERIFY] no source.
// ANCHORS                Guardian Weatherwatch (2014-12-21, 2015-03-22), The Times "Weather Eye".
//                       Every anchor is `verify` until read in full; Loos 1915 has no source and applies nothing.
// PHENOLOGY        days  Day of year. [VERIFY] every value: bud burst, autumn colour, harvest,
//                       bloom and haymaking windows are tuning values, no northern-France source yet.

import type { CalDate } from './calendar';

export type Row = 'meanC' | 'rangeC' | 'precipMm' | 'wetDays' | 'eraOffsetC';

export const NORMALS = {
  meanC: [4.1, 4.7, 7.5, 10.5, 13.8, 16.7, 18.9, 18.8, 15.8, 11.9, 7.6, 4.7],
  rangeC: [4.9, 5.6, 7.4, 9.1, 9.1, 9.2, 9.5, 9.7, 8.8, 7.0, 5.4, 4.7],
  precipMm: [58.2, 50.8, 52.1, 45.3, 61.6, 63.7, 67.8, 71.3, 56.8, 64.1, 75.0, 73.3],
  wetDays: [11.2, 10.6, 10.1, 9.2, 9.5, 9.8, 9.9, 9.9, 9.7, 10.8, 13.3, 12.2],
} as const;

export const ERA_OFFSET_C = -0.8;

/** Source and unit per row, for the header's promise (3.6, 3.7). `verify` = not northern France 1915. */
export const NORMALS_META: Record<Row, { source: string; unit: string; verify: boolean }> = {
  meanC: { source: 'Lille-Lesquin 1991-2020, Météo-France via Wikipedia: Lille', unit: '°C', verify: true },
  rangeC: { source: 'Lille-Lesquin 1991-2020, Météo-France via Wikipedia: Lille', unit: '°C', verify: true },
  precipMm: { source: 'Lille-Lesquin 1991-2020, Météo-France via Wikipedia: Lille', unit: 'mm', verify: true },
  wetDays: { source: 'Lille-Lesquin 1991-2020, Météo-France via Wikipedia: Lille', unit: 'days', verify: true },
  eraOffsetC: { source: 'guess, no source', unit: '°C', verify: true },
};

export type AnchorBias = {
  temp?: number; // °C added to the daily mean
  wetProb?: number; // multiplier on wet-day probability
  wetAmount?: number; // multiplier on wet-day amount
  force?: { rain: number; t: number }; // sets the day outright (rain 0-1, temperature °C)
};

export type Anchor = {
  id: string;
  from: CalDate;
  to: CalDate;
  source: string;
  status: 'sourced' | 'verify';
  applies: boolean;
  bias: AnchorBias;
};

const GUARDIAN_2014 = 'https://www.theguardian.com/news/2014/dec/21/weatherwatch-trenches-first-world-war';
const GUARDIAN_2015 = 'https://www.theguardian.com/news/2015/mar/22/weatherwatch-first-world-war-guns-rain';
const TIMES = 'https://www.thetimes.com/article/weather-eye-misery-on-the-western-front-z8sc7c65p7g';

export const ANCHORS: readonly Anchor[] = [
  {
    id: 'wet-winter-1914-15',
    from: { year: 1914, month: 10, day: 25 },
    to: { year: 1915, month: 3, day: 31 },
    source: `${GUARDIAN_2014} ; ${GUARDIAN_2015}`,
    status: 'verify',
    applies: true,
    bias: { wetProb: 1.35, wetAmount: 1.3 },
  },
  {
    id: 'snow-1914-11-22',
    from: { year: 1914, month: 11, day: 22 },
    to: { year: 1914, month: 11, day: 23 },
    source: GUARDIAN_2014,
    status: 'verify',
    applies: true,
    bias: { force: { rain: 1, t: -1 } },
  },
  {
    id: 'wet-dec-1915',
    from: { year: 1915, month: 12, day: 1 },
    to: { year: 1915, month: 12, day: 31 },
    source: TIMES,
    status: 'verify',
    applies: true,
    bias: { wetProb: 1.4, wetAmount: 1.25 },
  },
  {
    id: 'loos-1915',
    from: { year: 1915, month: 9, day: 25 },
    to: { year: 1915, month: 10, day: 15 },
    source: 'no source found for the weather of the Loos period',
    status: 'verify',
    applies: false,
    bias: {},
  },
];

/** Messages for anchors that are malformed; [] when the table is valid (4.8). */
export function checkAnchors(list: readonly Anchor[]): string[] {
  const out: string[] = [];
  for (const a of list) {
    if (a.status !== 'sourced' && a.status !== 'verify') out.push(`anchor ${a.id}: missing verification status`);
    if (!a.source) out.push(`anchor ${a.id}: missing source`);
  }
  return out;
}

/** Day-of-year windows [from, to] and centres. Every value [VERIFY]. */
export const PHENOLOGY = {
  budDay: { centre: 97, spread: 7 }, // bud burst about 7 April; full foliage ten days earlier
  autumnDay: { centre: 270, spread: 6 }, // autumn colour starts, about 27 September
  harvest: { from: 206, to: 227 }, // winter cereal harvest, late July to mid August
  harvestShift: 5,
  bloomShift: 6,
  bloomRamp: 16, // days a flower takes to come fully into bloom, and to go over
  // Mostly over by mid August, all gone by early September.
  bloom: {
    bluebell: [100, 145],
    hawthorn: [112, 155],
    cowParsley: [100, 180], // from mid April
    colza: [92, 150],
    buttercup: [105, 205],
    daisy: [105, 215], // from late April, so 10 May is in flower
    poppy: [140, 210],
    cornflower: [150, 215],
    clover: [145, 235],
  },
  hay: [152, 190], // haymaking, late May/June to before cereal harvest
} as const;

const MID_MONTH = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5]; // day of year, non-leap

/** Smooth, periodic daily value from 12 monthly values: smoothstep between mid-month points. */
export function dailyValue(monthly: readonly number[], doy: number): number {
  const d = ((((doy - 1) % 365) + 365) % 365) + 1;
  let j = 11;
  for (let i = 0; i < 12; i++) if (MID_MONTH[i] <= d) j = i;
  const a = d < MID_MONTH[0] ? MID_MONTH[11] - 365 : MID_MONTH[j];
  const b = j === 11 && d >= MID_MONTH[0] ? MID_MONTH[0] + 365 : MID_MONTH[(j + 1) % 12];
  const t = (d - a) / (b - a);
  const s = t * t * (3 - 2 * t);
  return monthly[j] + (monthly[(j + 1) % 12] - monthly[j]) * s;
}

/** Climatological daily mean temperature, °C, for a day of year (1..366). */
export const meanTempC = (doy: number) => dailyValue(NORMALS.meanC, doy);
