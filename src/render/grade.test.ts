import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFor, gradePixels, OVERCAST, skyFor } from './grade.ts';
import { DAYLIGHT, sunAt, sunsetHour } from '../sim/daylight.ts';

const D = DAYLIGHT.startDayOfYear;
const sky = { ...skyFor(1915, 0, true), beauty: 1 };

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

test('clouds blaze at sunset, go blue the moment the rays stop, and the night is only a little darker than dusk', () => {
  const at = (el: number, morning = false) => {
    // The hour on this day when the sun is at `el` degrees, found by scanning.
    const off = (h: number) => Math.abs((sunAt(D, h).elevation * 180) / Math.PI - el);
    let best = morning ? 0 : 12;
    for (let h = best; h < (morning ? 12 : 24); h += 0.005) if (off(h) < off(best)) best = h;
    return sunAt(D, best);
  };
  const noon = gradeFor(sunAt(D, 12), sky);
  const sunset = gradeFor(at(1), sky);
  const twilight = gradeFor(at(-1), sky);
  const dusk = gradeFor(at(-6), sky);
  const night = gradeFor(at(-30), sky);
  assert.equal(noon.cloud.amount, 0, 'midday clouds stay white');
  assert.ok(sunset.cloud.amount > 0.35 && sunset.cloud.near[0] > sunset.cloud.near[2], 'sunset clouds are warm, and tinted more than at any other hour');
  assert.ok(sunset.rays > 0 && dusk.rays === 0 && dusk.glowAlpha === 0, 'no rays or glow once the sun is well down');
  assert.ok(dusk.near[2] > dusk.near[0], 'dusk is blue');
  assert.ok(night.cloud.near[2] > night.cloud.near[0] && Math.max(...night.cloud.near) < 140, 'night clouds use a dark, muted blue-grey');
  assert.ok(night.cloud.amount > twilight.cloud.amount, 'the darker cloud tint strengthens gradually into full night');
  assert.ok(night.tintAlpha >= dusk.tintAlpha && night.tintAlpha - dusk.tintAlpha <= 0.25, 'late night is no lighter than early night');
  const set = sunsetHour(D);
  const minutes = (m: number) => gradeFor(sunAt(D, set + m / 60), sky);
  assert.ok(minutes(0).rays > 0 && minutes(10).rays > 0 && minutes(-10).rays > 0 && minutes(-25).rays > 0, 'rays at sunset, and well before it');
  assert.ok(minutes(21).rays === 0 && minutes(21).glowAlpha === 0, 'no rays or glow more than 20 minutes after sunset');
  const predawn = gradeFor(at(-6, true), sky);
  assert.ok(predawn.near[2] > predawn.near[0] && predawn.rays === 0, 'before sunrise the sky is blue, with no rays yet');
});

test('the light shafts change colour as the sun sinks, from the palette glow toward its ray colour', () => {
  const high = gradeFor(sunAt(D, sunsetHour(D) - 1.5), sky).glow;
  const low = gradeFor(sunAt(D, sunsetHour(D) + 0.3), sky).glow;
  assert.notDeepEqual(high.map(Math.round), low.map(Math.round));
  assert.deepEqual(low.map(Math.round), sky.rayEnd.map(Math.round), 'ends on the ray colour once the sun is on the horizon');
});

test('it is already pretty dark just after the sun sets, and still dark just before it rises', () => {
  const set = sunsetHour(D);
  const rise = 24 - set;
  const day = gradeFor(sunAt(D, 14), sky).tintAlpha;
  const after = gradeFor(sunAt(D, set + 10 / 60), sky);
  const before = gradeFor(sunAt(D, rise - 10 / 60), sky);
  const fullAfter = gradeFor(sunAt(D, set + 45 / 60), sky);
  const fullBefore = gradeFor(sunAt(D, rise - 45 / 60), sky);
  assert.ok(after.tintAlpha > 0.5 && after.near[2] > after.near[0], 'ten minutes after sunset: dark and blue');
  assert.ok(before.tintAlpha > 0.5 && before.near[2] > before.near[0], 'ten minutes before sunrise: dark and blue');
  assert.equal(fullAfter.night, 1, 'full night arrives well before an hour after sunset');
  assert.equal(fullBefore.night, 1, 'full night holds until well within an hour of sunrise');
  assert.ok(day === 0);
});

test('the fast row-copying paint matches the full per-pixel computation', () => {
  for (const h of [sunsetHour(D) - 0.1, sunsetHour(D) - 1, 23.5]) {
    const g = gradeFor(sunAt(D, h), sky);
    for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }]) {
      const fast = gradePixels(301, 211, g, dir, undefined, 190);
      const full = gradePixels(301, 211, g, dir, undefined, 190, false);
      assert.deepEqual(fast.tint, full.tint);
      assert.deepEqual(fast.glow, full.glow);
    }
  }
});
