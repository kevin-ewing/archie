import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFor, OVERCAST, skyFor } from './grade.ts';
import { DAYLIGHT, sunAt, sunsetHour } from '../sim/daylight.ts';

const D = DAYLIGHT.startDayOfYear;
const sky = { palette: skyFor(1915, 0, true).palette, beauty: 1 };

test('plain daylight draws nothing; sunset glows; night is darker than dusk', () => {
  assert.equal(gradeFor(sunAt(D, 13), sky).active, false);
  const set = sunsetHour(D);
  const sunset = gradeFor(sunAt(D, set), sky);
  assert.ok(sunset.active && sunset.glowAlpha > 0.2 && sunset.rays > 0, 'sunset blazes');
  const dusk = gradeFor(sunAt(D, set + 0.6), sky);
  const night = gradeFor(sunAt(D, 23.5), sky);
  assert.ok(night.tintAlpha > dusk.tintAlpha * 0.9 && night.night === 1, 'night is darkest');
  assert.deepEqual(night.near.map(Math.round), night.far.map(Math.round), 'night is one flat blue, no gradient');
  assert.equal(night.glowAlpha, 0, 'no glow at night');
});

test('skies vary: deterministic per day, some evenings dull, some spectacular', () => {
  assert.deepEqual(skyFor(1915, 3, true), skyFor(1915, 3, true));
  const days = Array.from({ length: 80 }, (_, d) => skyFor(1915, d, true));
  assert.ok(days.some((s) => s.palette === OVERCAST), 'some grey evenings');
  assert.ok(days.some((s) => s.beauty > 1.1), 'some blazing ones');
  assert.ok(new Set(days.map((s) => s.palette.name)).size >= 5, 'many palettes in rotation');
});
