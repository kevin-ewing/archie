import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dayNumber, formatISO, fromDayNumber, REFERENCE } from './calendar.ts';
import { PHENOLOGY } from './climate.ts';
import {
  BLOOM_KINDS, CROP_NAMES, parseOverrides, seasonAt, seasonKey, SEASON_DATES,
  type OverrideParam, type SeasonState,
} from './seasons.ts';

const REF_N = dayNumber(REFERENCE);
const seed = fc.integer({ min: 0, max: 0x7fffffff });
const dayN = fc.integer({ min: dayNumber({ year: 1900, month: 1, day: 1 }), max: dayNumber({ year: 2100, month: 12, day: 31 }) });
const campaignN = fc.integer({ min: dayNumber({ year: 1914, month: 1, day: 1 }), max: dayNumber({ year: 1918, month: 12, day: 31 }) });

// Feature: seasons-system, Property 15: the look eases day to day (no date is pulled toward a fixed look)
test('Property 15: the season-driven values move by small daily steps all year', () => {
  fc.assert(
    fc.property(seed, fc.integer({ min: 0, max: 364 }), (s, k) => {
      const a = seasonAt(fromDayNumber(REF_N - 130 + k), s);
      const b = seasonAt(fromDayNumber(REF_N - 129 + k), s);
      for (const key of ['foliage', 'budding', 'autumnColour', 'grassGreen', 'grassDry', 'hay'] as const)
        assert.ok(Math.abs(a[key] - b[key]) <= 0.1, `${key} jumped ${a[key]} -> ${b[key]} at day ${k}`);
      for (const c of CROP_NAMES) assert.ok(Math.abs(a.cropStages[c] - b.cropStages[c]) <= 0.25, `${c} jumped`);
      for (const f of BLOOM_KINDS) assert.ok(Math.abs(a.bloom[f] - b.bloom[f]) <= 0.1, `${f} bloom jumped`);
      assert.ok(Math.abs(a.leafDays - b.leafDays - -1) < 1e-9 || Math.abs(a.leafDays - b.leafDays) > 300, 'leafDays counts days');
    }),
    { numRuns: 300 },
  );
});

// Feature: seasons-system, Property 16: Bloom and hay windows
test('Property 16: bloom and hay are in [0, 1] and zero outside their widened windows', () => {
  fc.assert(
    fc.property(seed, fc.oneof(dayN, campaignN), (s, n) => {
      const st = seasonAt(fromDayNumber(n), s);
      const P = PHENOLOGY;
      const outside = (doy: number, a: number, b: number, shift: number) => doy < a - shift || doy > b + shift;
      for (const k of BLOOM_KINDS) {
        assert.ok(st.bloom[k] >= 0 && st.bloom[k] <= 1, `bloom ${k} = ${st.bloom[k]}`);
        const [a, b] = P.bloom[k];
        if (outside(st.doy, a, b, P.bloomShift)) assert.equal(st.bloom[k], 0, `${k} on doy ${st.doy}`);
      }
      assert.ok(st.hay >= 0 && st.hay <= 1, `hay = ${st.hay}`);
      if (outside(st.doy, P.hay[0], P.hay[1], P.harvestShift)) assert.equal(st.hay, 0, `hay on doy ${st.doy}`);
    }),
    { numRuns: 300 },
  );
});

// Feature: seasons-system, Property 22: Season key is a function of the bucketed state
const BUCKETS: Partial<Record<keyof SeasonState, number>> = {
  foliage: 16, budding: 8, autumnColour: 8, grassGreen: 8, grassDry: 8, hay: 4, snow: 10, frost: 6, mud: 8, standingWater: 8, waterLevel: 6, ice: 8,
};

/** Same buckets as `seasonKey`, so the key must not change; fields outside the key are scrambled. */
function sameBuckets(s: SeasonState): SeasonState {
  const centre = (v: number, steps: number) => Math.round(v * steps) / steps;
  const out: SeasonState = { ...s, cropStages: { ...s.cropStages }, cropRange: { ...s.cropRange }, bloom: { ...s.bloom } };
  for (const [k, steps] of Object.entries(BUCKETS)) (out as Record<string, unknown>)[k] = centre(s[k as keyof SeasonState] as number, steps!);
  for (const k of CROP_NAMES) out.cropRange[k] = s.cropRange[k].map((v) => centre(v, 16));
  for (const k of CROP_NAMES) out.cropStages[k] = 1 - s.cropStages[k]; // read only through cropRange
  for (const k of BLOOM_KINDS) out.bloom[k] = centre(s.bloom[k], 4);
  out.haze = 1 - s.haze;
  out.skyBias = -s.skyBias;
  out.leafDays = Math.round(s.leafDays) + 0.2; // the day counts are keyed by whole days
  out.fallDays = Math.round(s.fallDays) - 0.2;
  return out;
}

test('Property 22: equal buckets give equal keys, and the key is deterministic', () => {
  fc.assert(
    fc.property(seed, fc.oneof(dayN, campaignN), (s, n) => {
      const st = seasonAt(fromDayNumber(n), s);
      assert.equal(seasonKey(st), seasonKey(st));
      assert.equal(seasonKey(sameBuckets(st)), seasonKey(st));
      assert.ok(Number.isInteger(seasonKey(st)) && seasonKey(st) >= 0);
    }),
    { numRuns: 300 },
  );
});

test('Property 22: a visible change (a snow bucket) changes the key', () => {
  const st = seasonAt(REFERENCE, 1);
  assert.notEqual(seasonKey({ ...st, snow: 0.5 }), seasonKey(st));
});

// Feature: seasons-system, Property 23: Override parsing
const PARAMS: Record<string, OverrideParam> = { snow: 'snow', frost: 'frost', mud: 'mud', water: 'standingWater', ice: 'ice', foliage: 'foliage', haze: 'haze' };
const paramName = fc.constantFrom(...Object.keys(PARAMS));
const goodNum = fc.double({ min: 0, max: 1, noNaN: true }).filter((v) => !Object.is(v, -0));
const badNum = fc.oneof(
  fc.double({ min: 1.0001, max: 1e6, noNaN: true }).map(String),
  fc.double({ min: -1e6, max: -0.0001, noNaN: true }).map(String),
  fc.constantFrom('', 'abc', 'NaN', 'Infinity', '0x1', '1,5', '.', '--1'),
);
const goodDate = campaignN.map((n) => formatISO(fromDayNumber(n)));
const badDate = fc.constantFrom('1915-02-29', '1915-13-01', '1915-00-10', 'tomorrow', '', '15-5-1915', '1915-04-31');
const SEASONS = Object.keys(SEASON_DATES);
const badSeason = fc.constantFrom('monsoon', '', 'Winter', 'constructor', '__proto__');

test('Property 23: valid values come back unchanged, bad ones are dropped and reported, others survive', () => {
  const entry = fc.record({
    name: paramName,
    good: goodNum,
    bad: badNum,
    useBad: fc.boolean(),
    include: fc.boolean(),
  });
  fc.assert(
    fc.property(
      fc.array(entry, { minLength: 7, maxLength: 7 }),
      fc.option(fc.tuple(goodDate, badDate, fc.boolean()), { nil: undefined }),
      fc.option(fc.tuple(fc.constantFrom(...SEASONS), badSeason, fc.boolean()), { nil: undefined }),
      (rows, date, season) => {
        // One row per parameter name (seven rows, mapped in order), each with its own include/bad flags.
        const names = Object.keys(PARAMS);
        const q = new URLSearchParams();
        const expectGood: Partial<Record<OverrideParam, number>> = {};
        const expectBad: string[] = [];
        rows.forEach((r, i) => {
          if (!r.include) return;
          const name = names[i];
          if (r.useBad) {
            q.set(name, r.bad);
            expectBad.push(`${name}=`);
          } else {
            q.set(name, String(r.good));
            expectGood[PARAMS[name]] = r.good;
          }
        });
        let wantDate: string | undefined;
        if (date) {
          q.set('date', date[2] ? date[1] : date[0]);
          if (date[2]) expectBad.push('date=');
          else wantDate = date[0];
        }
        let wantSeason: string | undefined;
        if (season) {
          q.set('season', season[2] ? season[1] : season[0]);
          if (season[2]) expectBad.push('season=');
          else wantSeason = season[0];
        }
        const { overrides, problems } = parseOverrides(q.toString());
        assert.deepEqual(overrides.params ?? {}, expectGood);
        assert.equal(overrides.date ? formatISO(overrides.date) : undefined, wantDate);
        assert.equal(overrides.season, wantSeason);
        assert.deepEqual(problems.map((p) => p.slice(0, p.indexOf('=') + 1)).sort(), expectBad.sort());
      },
    ),
    { numRuns: 300 },
  );
});

test('Property 23: a query with no recognised keys gives no overrides and no problems', () => {
  assert.deepEqual(parseOverrides('?debug=1&x=2'), { overrides: {}, problems: [] });
});
