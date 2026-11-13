import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceClock, createClock, DAYLIGHT, sunAt, sunNow, sunsetHour } from './daylight.ts';

const MAY10 = DAYLIGHT.startDayOfYear;

test('the sun is where it should be over Ypres in May: shadows west at dawn, north at noon, east at dusk', () => {
  const morning = sunAt(MAY10, 7);
  assert.ok(morning.elevation > 0 && morning.shadow.x < 0, 'morning sun in the east, shadows to the west');
  const noon = sunAt(MAY10, 12);
  assert.ok(Math.abs(noon.azimuth - Math.PI) < 0.01 && noon.shadow.y < 0 && Math.abs(noon.shadow.x) < 1e-6, 'noon sun due south, shadows north');
  assert.ok(noon.strength === 1 && Math.hypot(noon.shadow.x, noon.shadow.y) < 1, 'high sun: short shadows');
  const evening = sunAt(MAY10, 18);
  assert.ok(evening.shadow.x > 0 && evening.evening, 'evening sun in the west, shadows to the east');
  const midnight = sunAt(MAY10, 0);
  assert.ok(midnight.elevation < 0 && midnight.strength === 0 && midnight.shadow.x === 0, 'night: no sun, no shadows');
});

test('long May days at 51°N: sunset a little after 19:30 solar time; the clock rolls over at midnight', () => {
  const s = sunsetHour(MAY10);
  assert.ok(s > 19.2 && s < 20.2, `sunset ${s}`);
  const c = createClock(23.9);
  advanceClock(c, (0.2 * 3600) / DAYLIGHT.rate);
  assert.equal(c.day, 1);
  assert.ok(Math.abs(c.hours - 0.1) < 1e-6, 'full speed at night');
});

test('the clock slows around sunset, so the colourful hours last longer in real time', () => {
  const realSeconds = (from: number, to: number) => {
    const c = createClock(from);
    let s = 0;
    while (c.hours < to) {
      advanceClock(c, 0.1);
      s += 0.1;
    }
    return s;
  };
  const set = sunsetHour(MAY10);
  const evening = realSeconds(set - 1, set + 1);
  const midday = realSeconds(11, 13);
  assert.ok(evening > midday * 1.8, `sunset hours take longer (${evening.toFixed(0)}s vs ${midday.toFixed(0)}s)`);
  assert.ok(sunNow(createClock(12)).elevation > 0);
});

test('shadows are full around midday and fade out as the sun drops', () => {
  const s = (h: number) => sunAt(130, h).shadowStrength;
  assert.ok(s(12) > 0.99 && s(10.5) > 0.9, 'midday: full');
  assert.ok(s(16) < 0.8 && s(16) > 0.3, 'afternoon: fading');
  assert.equal(s(18.5), 0, 'low evening sun: gone');
});
