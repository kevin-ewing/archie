import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { CalendarError, dateOf, dayNumber, dayOfYear, formatISO, fromDayNumber, parseISO, REFERENCE, type CalDate } from './calendar.ts';

const MS_DAY = 86_400_000;
const REF_MS = Date.UTC(1915, 4, 10);
const fromUTC = (ms: number): CalDate => {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y: number, m: number) => (m === 2 ? (leap(y) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);

const validDate = fc
  .record({ year: fc.integer({ min: 1900, max: 2100 }), month: fc.integer({ min: 1, max: 12 }), r: fc.integer({ min: 0, max: 30 }) })
  .map(({ year, month, r }) => ({ year, month, day: 1 + (r % dim(year, month)) }));

test('example: day -166 is 25 Nov 1914, -165 is 26 Nov, day 0 is the reference', () => {
  assert.deepEqual(dateOf(-166), { year: 1914, month: 11, day: 25 });
  assert.deepEqual(dateOf(-165), { year: 1914, month: 11, day: 26 });
  assert.deepEqual(dateOf(0), REFERENCE);
  assert.deepEqual(dateOf(295), { year: 1916, month: 2, day: 29 });
});

// Feature: seasons-system, Property 1: Calendar day round trip
test('Property 1: dateOf matches Date.UTC from 10 May 1915 and round-trips (negative days included)', () => {
  fc.assert(
    fc.property(fc.integer({ min: -200, max: 800 }), (n) => {
      const d = dateOf(n);
      assert.deepEqual(d, fromUTC(REF_MS + n * MS_DAY));
      assert.equal(dayNumber(d) - dayNumber(REFERENCE), n);
    }),
  );
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 80_000 }), (n) => {
      assert.equal(dayNumber(fromDayNumber(n)), n);
    }),
  );
});

// Feature: seasons-system, Property 2: Day-of-year range
test('Property 2: day of year is 1..366, and 366 only on 31 Dec of a leap year', () => {
  fc.assert(
    fc.property(validDate, (d) => {
      const n = dayOfYear(d);
      assert.ok(n >= 1 && n <= 366);
      assert.equal(n, Math.round((Date.UTC(d.year, d.month - 1, d.day) - Date.UTC(d.year, 0, 1)) / MS_DAY) + 1);
      if (n === 366) assert.ok(leap(d.year) && d.month === 12 && d.day === 31);
    }),
  );
});

// Feature: seasons-system, Property 3: ISO date round trip
test('Property 3: parseISO(formatISO(d)) equals d', () => {
  fc.assert(fc.property(validDate, (d) => assert.deepEqual(parseISO(formatISO(d)), d)));
});

// Feature: seasons-system, Property 4: Invalid dates are rejected by field
test('Property 4: invalid dates throw CalendarError naming the field', () => {
  const field = (d: CalDate) => {
    try {
      dayNumber(d);
    } catch (e) {
      assert.ok(e instanceof CalendarError);
      return e.field;
    }
    return 'none';
  };
  fc.assert(
    fc.property(validDate, fc.integer({ min: 13, max: 99 }), (d, m) => assert.equal(field({ ...d, month: m }), 'month')),
  );
  fc.assert(
    fc.property(validDate, fc.integer({ min: 1, max: 40 }), (d, extra) => {
      assert.equal(field({ ...d, day: dim(d.year, d.month) + extra }), 'day');
      assert.equal(field({ ...d, day: 1 - extra }), 'day');
    }),
  );
  fc.assert(fc.property(validDate, (d) => assert.equal(field({ ...d, year: d.year + 0.5 }), 'year')));
  assert.equal(field({ year: 1915, month: 2, day: 29 }), 'day');
  assert.equal(field({ year: 1916, month: 2, day: 29 }), 'none');
  assert.throws(() => parseISO('1915-5-10'), (e: unknown) => e instanceof CalendarError && e.field === 'format');
  assert.throws(() => parseISO('1915-02-29'), (e: unknown) => e instanceof CalendarError && e.field === 'day');
});
