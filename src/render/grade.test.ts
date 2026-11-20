import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { gradeFor, gradePixels, OVERCAST, skyFor } from './grade.ts';
import { REFERENCE } from '../sim/calendar.ts';
import { sunDay } from '../sim/sun.ts';
import { sunAt, sunsetHour } from '../sim/daylight.ts';

const D = sunDay(REFERENCE);
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

// Property 24: Winter evenings are plainer. Validates: Requirements 14.1, 14.2
test('winter evenings are overcast more often than summer ones, and skyBias 0 changes nothing', () => {
  const share = (seed: number, first: number, bias: number) => Array.from({ length: 200 }, (_, i) => skyFor(seed, first + i, true, bias)).filter((s) => s.palette === OVERCAST).length;
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 1000 }), (seed, day) => {
      assert.ok(share(seed, day, -1) > share(seed, day + 400, 0.5));
      for (const evening of [true, false]) assert.deepEqual(skyFor(seed, day, evening, 0), skyFor(seed, day, evening));
    }),
    { numRuns: 50 },
  );
});

// Stored output of the pre-seasons gradeFor at span 1 (REFERENCE date), sunset-1h, sunset+6min, 23:30. Validates: Requirements 14.3, 14.4
const STORED = [
  { h: -1, near: [253.328, 185.8497, 23.3065], far: [232.1976, 158.233, 150.8098], night: 0, cloud: { near: [228.7156, 207.4356, 148.9659], far: [206.7599, 169.6733, 161.8495], amount: 0.1836 }, tintAlpha: 0.5098, glow: [241.5098, 193.1043, 91.5003], glowAlpha: 0.2782, rays: 0.3417 },
  { h: 0.1, near: [68.7342, 73.9459, 121.1685], far: [38.5873, 40.7732, 93.6887], night: 0.0712, cloud: { near: [116.0785, 123.5733, 141.8039], far: [84.5243, 88.4227, 110.2871], amount: 0.4962 }, tintAlpha: 0.8, glow: [225.6802, 143.0475, 152.4164], glowAlpha: 0.1562, rays: 0.4225 },
  { h: null, near: [12, 23, 72], far: [12, 23, 72], night: 1, cloud: { near: [101, 112, 128], far: [101, 112, 128], amount: 0.65 }, tintAlpha: 0.8, glow: [225.1003, 141.2136, 154.6482], glowAlpha: 0, rays: 0 },
];
const near4 = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${v} vs ${b[i]}`));

test('with no season, or a neutral one, gradeFor equals the pre-seasons output', () => {
  assert.equal(sunAt(D, 13).span, 1);
  for (const s of STORED) {
    const sun = sunAt(D, s.h === null ? 23.5 : sunsetHour(D) + s.h);
    for (const g of [gradeFor(sun, sky), gradeFor(sun, sky, { skyBias: 0, haze: 0 })]) {
      near4(g.near, s.near);
      near4(g.far, s.far);
      near4(g.cloud.near, s.cloud.near);
      near4(g.cloud.far, s.cloud.far);
      near4(g.glow, s.glow);
      near4([g.night, g.cloud.amount, g.tintAlpha, g.glowAlpha, g.rays, g.haze], [s.night, s.cloud.amount, s.tintAlpha, s.glowAlpha, s.rays, 0]);
      assert.equal(g.active, true);
    }
  }
});

test('haze changes only the glow pass', () => {
  for (const h of [13, sunsetHour(D) - 1, 23.5]) {
    const sun = sunAt(D, h);
    const plain = gradeFor(sun, sky);
    const hazy = gradeFor(sun, sky, { skyBias: 0, haze: 0.5 });
    assert.deepEqual({ ...hazy, haze: 0, active: plain.active }, plain);
    assert.equal(hazy.haze, 0.5);
    assert.equal(hazy.active, true);
    const a = gradePixels(64, 64, plain, { x: 1, y: 0 });
    const b = gradePixels(64, 64, hazy, { x: 1, y: 0 });
    assert.deepEqual(b.tint, a.tint, 'tint pass is identical');
    assert.notDeepEqual(b.glow, a.glow, 'glow pass carries the veil');
  }
});

test('the winter tint cools and the summer tint warms daylight; both fade by night', () => {
  const sun = sunAt(D, sunsetHour(D) - 1);
  const base = gradeFor(sun, sky);
  const cold = gradeFor(sun, sky, { skyBias: -1, haze: 0 });
  const warm = gradeFor(sun, sky, { skyBias: 1, haze: 0 });
  assert.ok(cold.near[2] / cold.near[0] > base.near[2] / base.near[0] || cold.far[2] / cold.far[0] > base.far[2] / base.far[0]);
  assert.ok(warm.far[2] / warm.far[0] < base.far[2] / base.far[0]);
  const night = sunAt(D, 23.5);
  assert.deepEqual(gradeFor(night, sky, { skyBias: -1, haze: 0 }).near, gradeFor(night, sky).near);
});

test('cloud tint: dithered bands on the pixel grid, far colour away from the sun to near toward it, at the cloud amount', async () => {
  const { cloudPixels } = await import('./grade.ts');
  const c = { near: [250, 200, 120] as const, far: [90, 70, 140] as const, amount: 0.4 };
  const w = 120, h = 80;
  const px = cloudPixels(w, h, c, { x: 1, y: 0 }, w / 2); // (a radius of half the width: the ends fall on the screen's edges)
  const at = (x: number, y: number) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
  assert.deepEqual(at(0, 40), [90, 70, 140, 102], 'away from the sun: the far colour');
  assert.deepEqual(at(w - 1, 40), [250, 200, 120, 102], 'toward the sun: the near colour');
  const colours = new Set<string>();
  for (let i = 0; i < w * h; i++) colours.add(px.slice(i * 4, i * 4 + 3).join(','));
  assert.ok(colours.size <= 9, `only the band colours (${colours.size})`);
  const column = (x: number) => { let r = 0; for (let y = 0; y < h; y++) r += px[(y * w + x) * 4]; return r / h; };
  for (let x = 4; x < w; x += 4) assert.ok(column(x) >= column(x - 4), `brightens toward the sun (column ${x})`);
});
