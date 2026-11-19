import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dayNumber, fromDayNumber, type CalDate } from './calendar.ts';
import { ANCHORS } from './climate.ts';
import { clearSeasonCache, seasonAt, stepGround, type Ground } from './seasons.ts';

const seeds = fc.integer({ min: 1, max: 1_000_000 });
const onDoy = (year: number, doy: number): CalDate => fromDayNumber(dayNumber({ year, month: 1, day: 1 }) + doy - 1);
/** First day of year (doy from..to) for which `hit` holds, or -1. */
const firstDay = (seed: number, year: number, from: number, to: number, hit: (s: ReturnType<typeof seasonAt>) => boolean) => {
  for (let d = from; d <= to; d++) if (hit(seasonAt(onDoy(year, d), seed))) return d;
  return -1;
};
const dayOf = (month: number, day: number, year: number) => dayNumber({ year, month, day }) - dayNumber({ year, month: 1, day: 1 }) + 1;

// Feature: seasons-system, Property 11: Phenology falls in its windows
test('P11: bud burst, autumn colour and wheat stubble fall in their windows', () => {
  fc.assert(
    fc.property(seeds, fc.integer({ min: 1900, max: 2100 }), (seed, year) => {
      const bud = firstDay(seed, year, 60, 180, (s) => s.budding >= 0.5 - 1e-9);
      assert.ok(bud >= dayOf(4, 10, year) && bud <= dayOf(5, 5, year), `bud ${bud} in ${year}`);
      const aut = firstDay(seed, year, 200, 365, (s) => s.autumnColour > 0.1);
      assert.ok(aut >= dayOf(9, 14, year) && aut <= dayOf(10, 14, year), `autumn ${aut} in ${year}`);
      const wheat = firstDay(seed, year, 150, 300, (s) => s.cropStages['young wheat'] >= 3.99);
      assert.ok(wheat >= dayOf(7, 20, year) && wheat <= dayOf(8, 20, year), `wheat ${wheat} in ${year}`);
    }),
    { numRuns: 20 },
  );
});

test('P11: bud-burst days span at least 7 days over 30 years', () => {
  fc.assert(
    fc.property(seeds, (seed) => {
      const days: number[] = [];
      for (let y = 1920; y < 1950; y++) days.push(firstDay(seed, y, 60, 180, (s) => s.budding >= 0.5 - 1e-9) - (dayOf(1, 1, y) - 1) + 0);
      assert.ok(Math.max(...days) - Math.min(...days) >= 7, `span ${Math.max(...days) - Math.min(...days)}`);
    }),
    { numRuns: 10 },
  );
});

// Feature: seasons-system, Property 12: Cold states are zero from May to September
test('P12: snow, ice and frost are exactly 0 from 1 May to 30 September', () => {
  fc.assert(
    fc.property(seeds, fc.integer({ min: 1900, max: 2100 }), (seed, year) => {
      for (let d = dayOf(5, 1, year); d <= dayOf(9, 30, year); d++) {
        const s = seasonAt(onDoy(year, d), seed);
        assert.equal(s.snow, 0, `snow doy ${d}`);
        assert.equal(s.ice, 0, `ice doy ${d}`);
        assert.equal(s.frost, 0, `frost doy ${d}`);
      }
    }),
    { numRuns: 10 },
  );
});

// Feature: seasons-system, Property 13: Thaw melts snow and ice
test('P13: with mean temperature above 3 C, snow and ice never rise and are gone in 30 days', () => {
  const day = fc.record({ t: fc.double({ min: 3.01, max: 15, noNaN: true }), rain: fc.double({ min: 0, max: 1, noNaN: true }) });
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.array(day, { minLength: 30, maxLength: 34 }),
      (snow, ice, days) => {
        // Lying snow takes a few days to a couple of weeks to go in a mild spell (slowest just above 3 C, in the dry).
        let g: Ground = { snow, mud: 0.3, water: 0.2, level: 0.3, ice, frost: 0 };
        days.forEach((w, i) => {
          const next = stepGround(g, { t: w.t, tmin: w.t - 5, rain: w.rain });
          assert.ok(next.snow <= g.snow && next.ice <= g.ice, `day ${i} rose`);
          g = next;
          if (i === 29) assert.ok(g.snow === 0 && g.ice === 0, `day 30: snow ${g.snow} ice ${g.ice}`);
        });
      },
    ),
    { numRuns: 200 },
  );
});

// Feature: seasons-system, Property 14: Ground-state budgets
test('P14: snow on under 22% of days on average (December always has some), frost on at most 70 days a year', () => {
  fc.assert(
    fc.property(seeds, (seed) => {
      let snowDays = 0;
      let days = 0;
      for (let y = 1920; y < 1950; y++) {
        let frostDays = 0;
        const n = dayOf(12, 31, y);
        for (let d = 1; d <= n; d++) {
          const s = seasonAt(onDoy(y, d), seed);
          if (s.snow > 0.05) snowDays++;
          if (s.frost > 0.05) frostDays++;
          days++;
        }
        assert.ok(frostDays <= 70, `frost ${frostDays} days in ${y}`);
      }
      assert.ok(snowDays / days < 0.22, `snow share ${snowDays / days}`);
    }),
    { numRuns: 3 },
  );
});

// ---------------------------------------------------------------- examples

/** Run `fn` with every anchor switched off, then restore. */
function withoutAnchors<T>(fn: () => T): T {
  const was = ANCHORS.map((a) => a.applies);
  ANCHORS.forEach((a) => ((a as { applies: boolean }).applies = false));
  clearSeasonCache();
  try {
    return fn();
  } finally {
    ANCHORS.forEach((a, i) => ((a as { applies: boolean }).applies = was[i]));
    clearSeasonCache();
  }
}

test('anchors raise mud on 15 Dec 1914 and 10 Jan 1915 (1.35x wet days, 1.3x amount)', () => {
  for (const date of [{ year: 1914, month: 12, day: 15 }, { year: 1915, month: 1, day: 10 }]) {
    let withA = 0;
    let without = 0;
    for (let seed = 1; seed <= 12; seed++) {
      withA += seasonAt(date, seed).mud;
      without += withoutAnchors(() => seasonAt(date, seed).mud);
    }
    assert.ok(withA > without, `${date.year}-${date.month}-${date.day}: ${withA} vs ${without}`);
  }
});

test('22 Nov 1914 snowfall leaves snow above 0.1 on 24 Nov 1914', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = seasonAt({ year: 1914, month: 11, day: 24 }, seed);
    assert.ok(s.snow > 0.1, `seed ${seed}: snow ${s.snow}`);
  }
});

test('loos-1915 is unverified, not applied, and changes nothing', () => {
  const loos = ANCHORS.find((a) => a.id === 'loos-1915');
  assert.ok(loos && !loos.applies && loos.status === 'verify');
  const date = { year: 1915, month: 10, day: 5 };
  const a = seasonAt(date, 7);
  const b = withoutAnchors(() => seasonAt(date, 7));
  assert.deepEqual(a, b);
});
