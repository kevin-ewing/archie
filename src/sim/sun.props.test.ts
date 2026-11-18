import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dayNumber, fromDayNumber } from './calendar.ts';
import { HORIZON_ALT, legalHours, solarHours, SUMMER_TIME, sunDay } from './sun.ts';
import { sunAt } from './daylight.ts';

const DAY_MIN = dayNumber({ year: 1900, month: 1, day: 1 });
const DAY_MAX = dayNumber({ year: 2100, month: 12, day: 31 });
const anyDate = fc.integer({ min: DAY_MIN, max: DAY_MAX }).map(fromDayNumber);
// Campaign years get extra weight so the summer-time rows are exercised.
const campaignDate = fc.integer({ min: dayNumber({ year: 1914, month: 1, day: 1 }), max: dayNumber({ year: 1918, month: 12, day: 31 }) }).map(fromDayNumber);
const date = fc.oneof(anyDate, campaignDate);

const ONE_MIN = 1 / 60;

// Feature: seasons-system, Property 8: Sunrise and sunset are the -0.833° crossings
test('Property 8: sunrise and sunset are the -0.833° crossings, symmetric about noon', () => {
  fc.assert(
    fc.property(date, (d) => {
      const day = sunDay(d);
      assert.ok(Number.isFinite(day.sunrise) && Number.isFinite(day.sunset));
      assert.ok(day.sunrise < 12 && 12 < day.sunset);
      assert.ok(Math.abs(12 - day.sunrise - (day.sunset - 12)) < 1e-9);
      for (const h of [day.sunrise, day.sunset]) {
        const at = sunAt(day, h).elevation;
        // elevation moves at most this much in one minute; the crossing must hold within that
        const step = Math.abs(sunAt(day, h + ONE_MIN).elevation - sunAt(day, h - ONE_MIN).elevation) / 2;
        assert.ok(Math.abs(at - HORIZON_ALT) <= step, `elevation ${at} at ${h} on ${JSON.stringify(d)}`);
      }
      assert.ok(Math.abs(sunAt(day, day.sunset).horizonMinutes) < 1);
      assert.ok(Math.abs(sunAt(day, 24 - day.sunset).horizonMinutes) < 1);
    }),
    { numRuns: 300 },
  );
});

// Feature: seasons-system, Property 9: Legal time round trip
const transitions = SUMMER_TIME.flatMap((r) => [dayNumber(r.from) * 24 + r.fromHour, dayNumber(r.to) * 24 + r.toHour]);

test('Property 9: solarHours(legalHours(h)) = h away from transitions; legal minus UTC is 0 or 1 h', () => {
  fc.assert(
    fc.property(date, fc.double({ min: 0, max: 24, maxExcluded: true, noNaN: true }), (d, h) => {
      const day = sunDay(d);
      const utc = dayNumber(d) * 24 + h - day.longitude / 15 - day.eqTime / 60;
      fc.pre(transitions.every((t) => Math.abs(utc - t) > 1));
      const legal = legalHours(day, h);
      assert.ok(legal >= 0 && legal < 24);
      const off = (((legal - utc) % 24) + 24) % 24;
      assert.ok(Math.abs(off) < 1e-6 || Math.abs(off - 1) < 1e-6 || Math.abs(off - 24) < 1e-6, `offset ${off}`);
      const back = solarHours(day, legal);
      const diff = Math.abs(((back - h + 12) % 24 + 24) % 24 - 12); // circular distance
      assert.ok(diff < 1 / 3600, `round trip ${h} -> ${legal} -> ${back}`);
    }),
    { numRuns: 500 },
  );
});
