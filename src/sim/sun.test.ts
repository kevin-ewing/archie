import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber } from './calendar.ts';
import { legalHours, legalOffset, solarHours, sunDay } from './sun.ts';

const DEG = 180 / Math.PI;
const MIN = 1 / 60;

// Reference sunrise and sunset in local solar hours at 50.85 N, sun centre at -0.833 deg.
// Computed with the NOAA spreadsheet algorithm (Julian century, true obliquity, full equation of time),
// which is independent of the fractional-year series in sun.ts. The online calculator was not reachable.
const TABLE: [string, number, number, number, number, number][] = [
  // label, year, month, day, sunrise, sunset
  ['spring equinox', 1915, 3, 21, 5.9187, 18.0813],
  ['summer solstice', 1915, 6, 21, 3.7394, 20.2606],
  ['autumn equinox', 1915, 9, 23, 5.8916, 18.1084],
  ['winter solstice', 1915, 12, 21, 8.0334, 15.9666],
  ['10 May 1915', 1915, 5, 10, 4.3894, 19.6106],
  ['29 Feb 1916', 1916, 2, 29, 6.5709, 17.4291],
  ['25 Sep 1915', 1915, 9, 25, 5.9554, 18.0446],
  ['21 Jan', 1915, 1, 21, 7.6746, 16.3254],
  ['21 Apr', 1915, 4, 21, 4.9348, 19.0652],
  ['21 Jul', 1915, 7, 21, 4.0552, 19.9448],
  ['21 Oct', 1915, 10, 21, 6.7781, 17.2219],
  ['21 Jan 1916', 1916, 1, 21, 7.6799, 16.3201],
].map(([l, y, m, d, r, s]) => [l, y, m, d, r, s] as [string, number, number, number, number, number]);

for (const [label, year, month, day, rise, set] of TABLE) {
  test(`sunrise and sunset within 2 min of NOAA: ${label}`, () => {
    const s = sunDay({ year, month, day });
    assert.ok(Math.abs(s.sunrise - rise) <= 2 * MIN, `sunrise ${s.sunrise} vs ${rise}`);
    assert.ok(Math.abs(s.sunset - set) <= 2 * MIN, `sunset ${s.sunset} vs ${set}`);
  });
}

test('day length: 21 Dec 7 h 56 and 21 Jun 16 h 31, each within 10 min', () => {
  const dec = sunDay({ year: 1915, month: 12, day: 21 });
  const jun = sunDay({ year: 1915, month: 6, day: 21 });
  assert.ok(Math.abs(dec.sunset - dec.sunrise - (7 + 56 / 60)) <= 10 * MIN);
  assert.ok(Math.abs(jun.sunset - jun.sunrise - (16 + 31 / 60)) <= 10 * MIN);
});

test('noon elevation: 15.7 deg at the winter solstice, 62.6 deg at the summer solstice', () => {
  const dec = sunDay({ year: 1915, month: 12, day: 21 });
  const jun = sunDay({ year: 1915, month: 6, day: 21 });
  assert.ok(Math.abs(dec.noonElevation * DEG - 15.7) <= 1);
  assert.ok(Math.abs(jun.noonElevation * DEG - 62.6) <= 1);
});

test('10 May 1915 sunset is within 8 min of 19:31', () => {
  const s = sunDay({ year: 1915, month: 5, day: 10 });
  assert.ok(Math.abs(s.sunset - (19 + 31 / 60)) <= 8 * MIN);
});

test('legal time: GMT at 22:59 UTC and GMT+1 at 23:00 UTC on 14 June 1916', () => {
  const dn = dayNumber({ year: 1916, month: 6, day: 14 });
  assert.equal(legalOffset(dn, 22 + 59 / 60), 0);
  assert.equal(legalOffset(dn, 23), 1);
});

test('legal time: no offset on 10 May 1915', () => {
  const date = { year: 1915, month: 5, day: 10 };
  const dn = dayNumber(date);
  for (const h of [0, 6, 12, 18, 23.9]) assert.equal(legalOffset(dn, h), 0);
  const s = sunDay(date);
  // legal = solar + (15 deg longitude correction) - eqTime, with no summer-time hour
  const expected = s.sunset - s.longitude / 15 - s.eqTime / 60;
  assert.ok(Math.abs(legalHours(s, s.sunset) - expected) < 1e-9);
});

test('solarHours inverts legalHours in winter and in summer time', () => {
  for (const date of [{ year: 1915, month: 5, day: 10 }, { year: 1916, month: 7, day: 20 }]) {
    const s = sunDay(date);
    assert.ok(Math.abs(solarHours(s, legalHours(s, 15)) - 15) < 1e-9);
  }
});
