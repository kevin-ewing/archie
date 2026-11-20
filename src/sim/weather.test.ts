import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dayNumber, fromDayNumber, type CalDate } from './calendar.ts';
import { NORMALS } from './climate.ts';
import { seasonAt, seasonKey, weatherDay } from './seasons.ts';
import { clearWeatherCache, weatherAt, weatherAtDay, type WeatherState } from './weather.ts';

const DAY_MIN = dayNumber({ year: 1900, month: 1, day: 1 });
const DAY_MAX = dayNumber({ year: 2100, month: 12, day: 31 });
// Campaign years, leap days and year boundaries get extra weight.
const campaignN = fc.integer({ min: dayNumber({ year: 1914, month: 1, day: 1 }), max: dayNumber({ year: 1918, month: 12, day: 31 }) });
const edgeN = fc.constantFrom(
  DAY_MIN,
  DAY_MAX,
  dayNumber({ year: 1904, month: 2, day: 29 }),
  dayNumber({ year: 1915, month: 12, day: 31 }),
  dayNumber({ year: 1916, month: 1, day: 1 }),
  dayNumber({ year: 2000, month: 2, day: 29 }),
);
const dayN = fc.oneof(fc.integer({ min: DAY_MIN, max: DAY_MAX }), campaignN, edgeN);
const seed = fc.integer({ min: 0, max: 0x7fffffff });
const hours = fc.oneof(fc.double({ min: 0, max: 24, maxExcluded: true, noNaN: true }), fc.constantFrom(0, 23.999999, 12));

// ---------------------------------------------------------------- Properties 1-4: purity, range, validation, seeds

// Feature: weather-system, Property 1: Weather_State is a pure function of seed, date and time
// Validates: Requirements 1.1, 1.2, 1.3, 3.5, 3.6, 13.9
test('Property 1: same seed, date and hour give deeply equal states, cache or no cache, any route', () => {
  fc.assert(
    fc.property(seed, dayN, hours, dayN, hours, (s, n, h, otherN, otherH) => {
      const date = fromDayNumber(n);
      const first = structuredClone(weatherAt(s, date, h));
      weatherAt(s + 1, fromDayNumber(otherN), otherH); // unrelated query between the two
      assert.deepEqual(weatherAt(s, date, h), first);
      assert.deepEqual(weatherAtDay(s, n, h), first); // day-number route
      clearWeatherCache();
      assert.deepEqual(weatherAt(s, date, h), first);
    }),
    { numRuns: 200 },
  );
});

// Feature: weather-system, Property 2: Every state field is finite and in range
// Validates: Requirements 1.5, 3.1, 5.11
const KINDS = ['clear', 'cloudy', 'overcast', 'rain', 'snow'];
const PRECIP = ['none', 'rain', 'snow'];
const unitRange = (v: number, what: string) => assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${what} = ${v} not in [0, 1]`);

test('Property 2: fields are finite, in range and consistent', () => {
  fc.assert(
    fc.property(seed, dayN, hours, (s, n, h) => {
      const w: WeatherState = weatherAtDay(s, n, h);
      unitRange(w.intensity, 'intensity');
      unitRange(w.cloudCover, 'cloudCover');
      assert.ok(Number.isInteger(w.coverKey) && w.coverKey >= 0 && w.coverKey <= 7, `coverKey = ${w.coverKey}`);
      assert.ok(PRECIP.includes(w.precipitation), `precipitation = ${w.precipitation}`);
      assert.ok(KINDS.includes(w.kind), `kind = ${w.kind}`);
      if (w.kind === 'rain' || w.kind === 'snow') assert.equal(w.precipitation, w.kind);
      if (w.intensity > 0) assert.notEqual(w.precipitation, 'none');
    }),
    { numRuns: 400 },
  );
});

// Feature: weather-system, Property 3: Invalid input is rejected by name
// Validates: Requirements 1.8, 3.7
const badHours = fc.oneof(
  fc.double({ min: -1e6, max: -Number.MIN_VALUE, noNaN: true }),
  fc.double({ min: 24, max: 1e6, noNaN: true }),
  fc.constantFrom(NaN, Infinity, -Infinity),
);
const badDate = fc.oneof(
  fc.record({ year: fc.integer({ min: 1, max: 1899 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) }),
  fc.record({ year: fc.integer({ min: 2101, max: 9999 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) }),
  fc.record({ year: fc.integer({ min: 1900, max: 2100 }), month: fc.oneof(fc.integer({ min: -5, max: 0 }), fc.integer({ min: 13, max: 40 })), day: fc.integer({ min: 1, max: 28 }) }),
  fc.record({ year: fc.integer({ min: 1900, max: 2100 }), month: fc.integer({ min: 1, max: 12 }), day: fc.oneof(fc.integer({ min: -5, max: 0 }), fc.integer({ min: 32, max: 60 })) }),
  fc.constantFrom<CalDate>({ year: 1915, month: 2, day: 29 }, { year: 1900, month: 2, day: 29 }, { year: 1915, month: 4, day: 31 }, { year: NaN, month: 1, day: 1 }),
);

test('Property 3: bad hours or bad date throw a RangeError that names the argument', () => {
  fc.assert(
    fc.property(seed, dayN, badHours, badDate, hours, (s, n, h, d, okHours) => {
      assert.throws(() => weatherAt(s, fromDayNumber(n), h), (e: unknown) => e instanceof RangeError && /hours/.test(e.message));
      assert.throws(() => weatherAt(s, d, okHours), (e: unknown) => e instanceof RangeError && /date/.test(e.message));
    }),
    { numRuns: 200 },
  );
});

// Feature: weather-system, Property 4: Different seeds give different weather
// Validates: Requirements 1.6
test('Property 4: two distinct seeds differ on at least one of 365 consecutive days at a fixed hour', () => {
  fc.assert(
    fc.property(seed, seed, dayN, hours, (a, b, n0, h) => {
      fc.pre(a !== b);
      const start = Math.min(n0, DAY_MAX - 364);
      let differs = false;
      for (let i = 0; i < 365 && !differs; i++) {
        differs = JSON.stringify(weatherAtDay(a, start + i, h)) !== JSON.stringify(weatherAtDay(b, start + i, h));
      }
      assert.ok(differs, `seeds ${a} and ${b} agree on every day from ${start} at hour ${h}`);
    }),
    { numRuns: 50 },
  );
});

// ---------------------------------------------------------------- Properties 5-10 (task 1.3) append below

const MIN = 1 / 60;
const peakOfRain = (r: number) => Math.min(1, 0.15 + 0.85 * Math.pow(r, 0.6)); // design: day peak intensity
/** States of one day every `step` minutes, 00:00 to 23:59. */
const scan = (s: number, n: number, step: number) => {
  const out: WeatherState[] = [];
  for (let m = 0; m < 1440; m += step) out.push(weatherAtDay(s, n, m / 60));
  return out;
};
/** Contiguous runs of intensity > 0, as [firstIndex, lastIndex]. */
const runs = (states: WeatherState[]) => {
  const out: [number, number][] = [];
  states.forEach((w, i) => {
    if (w.intensity > 0) {
      if (out.length && out[out.length - 1][1] === i - 1) out[out.length - 1][1] = i;
      else out.push([i, i]);
    }
  });
  return out;
};
const monthDay = (months: number[]) =>
  fc.record({ year: fc.integer({ min: 1900, max: 2100 }), month: fc.constantFrom(...months), day: fc.integer({ min: 1, max: 28 }) }).map((d) => dayNumber(d));

// Feature: weather-system, Property 5: Precipitation follows the Daily_Model
// Validates: Requirements 2.1, 2.2, 2.11
test('Property 5: wet exactly on weatherDay rain > 0, snow below 1.5 C, none at the day boundaries', () => {
  fc.assert(
    fc.property(seed, dayN, (s, n) => {
      const w = weatherDay(n, s);
      const states = scan(s, n, 10);
      const wet = states.some((x) => x.intensity > 0);
      assert.equal(wet, w.rain > 0);
      const want = w.t < 1.5 ? 'snow' : 'rain';
      for (const x of states) if (x.intensity > 0) assert.equal(x.precipitation, want);
      assert.equal(states[0].intensity, 0);
      assert.equal(weatherAtDay(s, n, 24 - MIN / 60).intensity, 0);
    }),
    { numRuns: 150 },
  );
});

// Feature: weather-system, Property 6: No snow from 1 May to 30 September
// Validates: Requirements 2.4
test('Property 6: never snow from May to September', () => {
  fc.assert(
    fc.property(seed, monthDay([5, 6, 7, 8, 9]), (s, n) => {
      for (const x of scan(s, n, 30)) assert.notEqual(x.precipitation, 'snow');
    }),
    { numRuns: 300 },
  );
  // every day of the campaign summers, for a few seeds
  for (const s of [1, 77, 123456]) {
    for (let year = 1915; year <= 1918; year++) {
      for (let n = dayNumber({ year, month: 5, day: 1 }); n <= dayNumber({ year, month: 9, day: 30 }); n++) {
        if (weatherDay(n, s).rain > 0 && weatherDay(n, s).t < 1.5) assert.fail(`summer day ${n} seed ${s} is below 1.5 C`);
      }
    }
  }
});

// Feature: weather-system, Property 7: Seasonal frequencies follow the climate
// Validates: Requirements 2.3, 2.5, 2.9
test('Property 7: wet-day share per month, snow share by season, winter cloudier than summer', () => {
  const WET_DAYS = NORMALS.wetDays;
  const YEARS = 24; // 1925..1948, outside every anchor
  const dim = (y: number, m: number) => dayNumber({ year: m === 12 ? y + 1 : y, month: m === 12 ? 1 : m + 1, day: 1 }) - dayNumber({ year: y, month: m, day: 1 });
  for (const s of [7, 20240601]) {
    const wet = Array(12).fill(0);
    const days = Array(12).fill(0);
    const snow = Array(12).fill(0);
    let winterCover = 0, winterN = 0, summerCover = 0, summerN = 0;
    for (let y = 1925; y < 1925 + YEARS; y++) {
      for (let m = 1; m <= 12; m++) {
        const first = dayNumber({ year: y, month: m, day: 1 });
        for (let n = first; n < first + dim(y, m); n++) {
          days[m - 1]++;
          let isWet = false;
          let isSnow = false;
          for (let mi = 0; mi < 1440; mi += 30) {
            const x = weatherAtDay(s, n, mi / 60);
            if (x.intensity > 0) {
              isWet = true;
              if (x.precipitation === 'snow') isSnow = true;
            } else if (mi === 720) {
              if (m === 11 || m === 12 || m === 1 || m === 2) { winterCover += x.cloudCover; winterN++; }
              if (m >= 6 && m <= 8) { summerCover += x.cloudCover; summerN++; }
            }
          }
          if (isWet) wet[m - 1]++;
          if (isSnow) snow[m - 1]++;
        }
      }
    }
    for (let i = 0; i < 12; i++) {
      const expected = WET_DAYS[i] / (days[i] / YEARS);
      assert.ok(Math.abs(wet[i] / days[i] - expected) <= 0.08, `seed ${s} month ${i + 1}: wet share ${wet[i] / days[i]} vs ${expected}`);
    }
    const share = (i: number) => snow[i] / Math.max(1, wet[i]);
    for (const cold of [11, 0, 1]) for (const mild of [9, 10, 2, 3]) assert.ok(share(cold) > share(mild), `seed ${s}: snow share month ${cold + 1} (${share(cold)}) vs ${mild + 1} (${share(mild)})`);
    assert.ok(winterCover / winterN > summerCover / summerN, `seed ${s}: winter cover ${winterCover / winterN} vs summer ${summerCover / summerN}`);
  }
});

// Feature: weather-system, Property 8: Showers are short and separated
// Validates: Requirements 2.6
test('Property 8: March to September spells last at most 2 h, sit at least 1 h apart, gaps are dry clear or cloudy', () => {
  fc.assert(
    fc.property(seed, monthDay([3, 4, 5, 6, 7, 8, 9]), (s, n) => {
      const step = 2;
      const states = scan(s, n, step);
      const rs = runs(states);
      for (const [a, b] of rs) assert.ok((b - a + 1) * step <= 120, `spell of ${(b - a + 1) * step} min`);
      for (let i = 1; i < rs.length; i++) assert.ok((rs[i][0] - rs[i - 1][1] - 1) * step >= 60, 'gap under 1 h');
      for (let i = 1; i < rs.length; i++) {
        for (let k = rs[i - 1][1] + 1; k < rs[i][0]; k++) {
          assert.equal(states[k].intensity, 0);
          assert.ok(states[k].kind === 'clear' || states[k].kind === 'cloudy', `kind ${states[k].kind} between showers at minute ${k * step}`);
        }
      }
    }),
    { numRuns: 300 },
  );
});

// Feature: weather-system, Property 9: Steady months have a long spell
// Validates: Requirements 2.7
test('Property 9: a wet October to February day has a spell of at least 3 h', () => {
  fc.assert(
    fc.property(seed, monthDay([10, 11, 12, 1, 2]), (s, n) => {
      const states = scan(s, n, 2);
      const rs = runs(states);
      if (weatherDay(n, s).rain === 0) return assert.equal(rs.length, 0);
      assert.ok(rs.some(([a, b]) => (b - a + 1) * 2 >= 180), 'no spell of 3 h');
    }),
    { numRuns: 300 },
  );
});

// Feature: weather-system, Property 10: Intensity does not decrease with rain amount
// Validates: Requirements 2.10
test('Property 10: day peak follows 0.15 + 0.85 r^0.6, so it rises with rain, and no state exceeds it', () => {
  const dayPeak = (s: number, n: number) => Math.max(...scan(s, n, 1).map((x) => x.intensity));
  fc.assert(
    fc.property(seed, dayN, seed, dayN, (s1, n1, s2, n2) => {
      const r1 = weatherDay(n1, s1).rain;
      const r2 = weatherDay(n2, s2).rain;
      fc.pre(r1 > 0 && r2 > 0);
      const [lo, hi] = r1 <= r2 ? [peakOfRain(r1), peakOfRain(r2)] : [peakOfRain(r2), peakOfRain(r1)];
      assert.ok(lo <= hi);
      const p1 = dayPeak(s1, n1);
      const p2 = dayPeak(s2, n2);
      assert.ok(p1 <= peakOfRain(r1) + 1e-9 && p2 <= peakOfRain(r2) + 1e-9, 'intensity above the day peak');
      assert.ok(p1 >= peakOfRain(r1) - 0.02 && p2 >= peakOfRain(r2) - 0.02, 'day never reaches its peak');
      if (r1 <= r2) assert.ok(p1 <= peakOfRain(r2) + 1e-9);
    }),
    { numRuns: 60 },
  );
});

test('22 November 1914 snows at peak intensity 1', () => {
  const n = dayNumber({ year: 1914, month: 11, day: 22 });
  for (const s of [0, 1915, 987654]) {
    const states = scan(s, n, 1);
    assert.ok(Math.max(...states.map((x) => x.intensity)) >= 0.999);
    for (const x of states) if (x.intensity > 0) assert.equal(x.precipitation, 'snow');
  }
});

// ---------------------------------------------------------------- Properties 11-14 (task 1.4) append below
// Feature: weather-system, Property 11: Weather changes smoothly, including across midnight
// Validates: Requirements 3.2, 3.3, 3.4
test('Property 11: one minute moves intensity by at most 0.03 and cover by 0.02, across midnight, and clear never jumps to overcast', () => {
  const EPS = 1e-9;
  fc.assert(
    fc.property(seed, fc.oneof(dayN.filter((n) => n < DAY_MAX), campaignN), (s, n) => {
      let prev = weatherAtDay(s, n, 0);
      for (let m = 1; m < 1440; m++) {
        const w = weatherAtDay(s, n, m / 60);
        assert.ok(Math.abs(w.intensity - prev.intensity) <= 0.03 + EPS, `intensity step ${w.intensity - prev.intensity} at minute ${m}`);
        assert.ok(Math.abs(w.cloudCover - prev.cloudCover) <= 0.02 + EPS, `cover step ${w.cloudCover - prev.cloudCover} at minute ${m}`);
        assert.ok(!(prev.kind === 'clear' && w.kind === 'overcast') && !(prev.kind === 'overcast' && w.kind === 'clear'), `kind jumps ${prev.kind} -> ${w.kind} at minute ${m}`);
        prev = w;
      }
      // 23:59 to 00:00 of the next day
      const next = weatherAtDay(s, n + 1, 0);
      assert.ok(Math.abs(next.intensity - prev.intensity) <= 0.03 + EPS, 'intensity jumps at midnight');
      assert.ok(Math.abs(next.cloudCover - prev.cloudCover) <= 0.02 + EPS, 'cover jumps at midnight');
    }),
    { numRuns: 40 },
  );
});

// Feature: weather-system, Property 12: Rain never falls from a clear sky
// Validates: Requirements 5.8
test('Property 12: any precipitation has cover >= 0.8 and key 6 or 7; rain and snow kinds draw bucket 6 or 7', () => {
  fc.assert(
    fc.property(seed, dayN, (s, n) => {
      for (let m = 0; m < 1440; m += 3) {
        const w = weatherAtDay(s, n, m / 60);
        if (w.intensity > 0) {
          assert.ok(w.cloudCover >= 0.8, `cover ${w.cloudCover} at minute ${m}`);
          assert.ok(w.coverKey >= 6, `key ${w.coverKey} at minute ${m}`);
        }
        if (w.kind === 'rain' || w.kind === 'snow') assert.ok(w.coverKey === 6 || w.coverKey === 7);
      }
    }),
    { numRuns: 150 },
  );
});

// Feature: weather-system, Property 13: The cover key changes only on 10-minute grid lines
// Validates: Requirements 5.12
test('Property 13: coverKey is constant inside a 10-minute cell and changes at most once in any 10 minutes', () => {
  fc.assert(
    fc.property(seed, dayN, (s, n) => {
      const keys: number[] = [];
      for (let m = 0; m < 1440; m++) keys.push(weatherAtDay(s, n, m / 60).coverKey);
      for (let m = 0; m < 1440; m++) assert.equal(keys[m], keys[m - (m % 10)], `key differs inside the cell at minute ${m}`);
      for (let a = 0; a + 10 <= 1440; a++) {
        let changes = 0;
        for (let m = a + 1; m < a + 10; m++) if (keys[m] !== keys[m - 1]) changes++;
        assert.ok(changes <= 1, `${changes} key changes in the 10 minutes from ${a}`);
      }
      // sub-minute hours stay in their cell too
      const h = fc.sample(fc.double({ min: 0, max: 24, maxExcluded: true, noNaN: true }), 1)[0];
      assert.equal(weatherAtDay(s, n, h).coverKey, weatherAtDay(s, n, Math.floor(h * 6) / 6).coverKey);
    }),
    { numRuns: 60 },
  );
});

// Feature: weather-system, Property 16: Weather never changes the seasons
// Validates: Requirements 4.1, 4.6, 4.7
test('Property 16: weatherAt leaves seasonAt, seasonKey and weatherDay results unchanged', () => {
  fc.assert(
    fc.property(seed, dayN, hours, (s, n, h) => {
      const date = fromDayNumber(n);
      const before = structuredClone(seasonAt(date, s));
      const keyBefore = seasonKey(seasonAt(date, s));
      const wdBefore = structuredClone(weatherDay(n, s));
      weatherAt(s, date, h);
      weatherAtDay(s, n, h);
      assert.deepEqual(seasonAt(date, s), before);
      assert.equal(seasonKey(seasonAt(date, s)), keyBefore);
      assert.deepEqual(weatherDay(n, s), wdBefore);
    }),
    { numRuns: 200 },
  );
});
