import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dayNumber, fromDayNumber } from './calendar.ts';
import { BLOOM_KINDS, clearSeasonCache, CROP_NAMES, seasonAt, type SeasonState } from './seasons.ts';

const DAY_MIN = dayNumber({ year: 1900, month: 1, day: 1 });
const DAY_MAX = dayNumber({ year: 2100, month: 12, day: 31 });
// Campaign years get extra weight: anchors and the reference blend live there.
const campaignN = fc.integer({ min: dayNumber({ year: 1914, month: 1, day: 1 }), max: dayNumber({ year: 1918, month: 12, day: 31 }) });
const dayN = fc.oneof(fc.integer({ min: DAY_MIN, max: DAY_MAX }), campaignN);
const seed = fc.integer({ min: 0, max: 0x7fffffff });

// Feature: seasons-system, Property 5: Season_State is a pure function of date and seed
test('Property 5: same date and seed give deeply equal states, cache or no cache', () => {
  fc.assert(
    fc.property(dayN, seed, dayN, (n, s, other) => {
      const date = fromDayNumber(n);
      const first = structuredClone(seasonAt(date, s));
      seasonAt(fromDayNumber(other), s); // unrelated query between the two
      assert.deepEqual(seasonAt(date, s), first);
      clearSeasonCache();
      assert.deepEqual(seasonAt(date, s), first);
    }),
    { numRuns: 200 },
  );
});

// Feature: seasons-system, Property 6: Season_State stays in range
const unit = ['foliage', 'budding', 'autumnColour', 'grassGreen', 'hay', 'snow', 'frost', 'mud', 'standingWater', 'ice', 'waterLevel', 'haze'] as const;
const inRange = (v: number, lo: number, hi: number, what: string) =>
  assert.ok(Number.isFinite(v) && v >= lo && v <= hi, `${what} = ${v} not in [${lo}, ${hi}]`);

test('Property 6: every parameter is finite and inside its documented range', () => {
  fc.assert(
    fc.property(dayN, seed, (n, s) => {
      const st = seasonAt(fromDayNumber(n), s);
      for (const k of unit) inRange(st[k], 0, 1, k);
      inRange(st.daylength, 7, 17, 'daylength');
      inRange(st.skyBias, -1, 1, 'skyBias');
      inRange(st.doy, 1, 366, 'doy');
      for (const k of CROP_NAMES) inRange(st.cropStages[k], 0, 4, `cropStages.${k}`);
      for (const k of BLOOM_KINDS) inRange(st.bloom[k], 0, 1, `bloom.${k}`);
      assert.ok(Number.isFinite(st.leafDays) && Number.isFinite(st.fallDays));
    }),
    { numRuns: 400 },
  );
});

// Feature: seasons-system, Property 7: Day-to-day continuity
const slow = ['foliage', 'autumnColour', 'budding', 'grassGreen', 'waterLevel', 'daylength'] as const;
const fast = ['snow', 'ice', 'mud', 'frost', 'standingWater'] as const;
const EPS = 1e-9;

test('Property 7: consecutive dates differ by at most 0.1 (slow) and 0.35 (ground states)', () => {
  fc.assert(
    fc.property(dayN, seed, (n, s) => {
      const a: SeasonState = seasonAt(fromDayNumber(n), s);
      const b: SeasonState = seasonAt(fromDayNumber(n + 1), s);
      for (const k of slow) assert.ok(Math.abs(a[k] - b[k]) <= 0.1 + EPS, `${k}: ${a[k]} -> ${b[k]} on day ${n}`);
      for (const k of fast) assert.ok(Math.abs(a[k] - b[k]) <= 0.35 + EPS, `${k}: ${a[k]} -> ${b[k]} on day ${n}`);
    }),
    { numRuns: 400 },
  );
});
