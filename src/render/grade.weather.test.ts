import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { gradeFor, gradePixels, skyFor, sunSide, type Grade } from './grade.ts';
import { dateOf } from '../sim/calendar.ts';
import { sunDay } from '../sim/sun.ts';
import { sunAt } from '../sim/daylight.ts';

const NEUTRAL = 9 / 16;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const EPS = 1e-9;

// Hours of the day: anywhere, or within 4 h of sunrise or sunset where the glow lives.
const arbHour = (day: number) => {
  const sd = sunDay(dateOf(day));
  const near = (centre: number) => fc.double({ min: -4, max: 4, noNaN: true }).map((o) => Math.min(23.99, Math.max(0, centre + o)));
  return fc.oneof(fc.double({ min: 0, max: 24, noNaN: true, maxExcluded: true }), near(sd.sunset), near(24 - sd.sunset));
};
const arbCase = fc.integer({ min: 0, max: 364 }).chain((day) => fc.record({
  day: fc.constant(day),
  hour: arbHour(day),
  seed: fc.integer({ min: 0, max: 100000 }),
  skyBias: fc.double({ min: -1, max: 1, noNaN: true }),
  seasonHaze: fc.double({ min: 0, max: 0.6, noNaN: true }),
}));
const arbCover = fc.double({ min: 0, max: 1, noNaN: true });
const arbIntensity = fc.double({ min: 0, max: 1, noNaN: true });

type Case = { day: number; hour: number; seed: number; skyBias: number; seasonHaze: number };
const setup = (c: Case) => {
  const sun = sunAt(sunDay(dateOf(c.day)), c.hour);
  const sky = skyFor(c.seed, c.day, sun.evening, c.skyBias);
  const season = { skyBias: c.skyBias, haze: c.seasonHaze };
  return { sun, sky, season };
};

/** Property 26: The Grade reduces glow in proportion to weather and nothing else.
 * **Validates: Requirements 9.3, 9.4, 9.5, 9.8, 9.15, 9.18** */
test('Property 26: neutral or lower cover with no precipitation leaves the Grade unchanged', () => {
  fc.assert(
    fc.property(arbCase, fc.double({ min: 0, max: NEUTRAL, noNaN: true }), (c, cover) => {
      const { sun, sky, season } = setup(c);
      assert.deepEqual(gradeFor(sun, sky, season, { cover, intensity: 0 }), gradeFor(sun, sky, season));
    }),
  );
});

test('Property 26: glow and rays scale by 1 - 0.75 * clamp01(exc + intensity); haze stays in range', () => {
  fc.assert(
    fc.property(arbCase, arbCover, arbIntensity, (c, cover, intensity) => {
      const { sun, sky, season } = setup(c);
      const base = gradeFor(sun, sky, season);
      const g = gradeFor(sun, sky, season, { cover, intensity });
      const scale = 1 - 0.75 * clamp01(clamp01((cover - NEUTRAL) / (1 - NEUTRAL)) + intensity);
      assert.ok(scale >= 0.25 - EPS && scale <= 1);
      assert.ok(Math.abs(g.glowAlpha - base.glowAlpha * scale) < EPS, `glowAlpha ${g.glowAlpha} vs ${base.glowAlpha * scale}`);
      assert.ok(Math.abs(g.rays - base.rays * scale) < EPS, `rays ${g.rays} vs ${base.rays * scale}`);
      assert.ok(g.haze >= 0 && g.haze <= 0.6 + EPS);
      assert.ok(Math.abs(g.haze - Math.min(0.6, season.haze + 0.35 * intensity)) < EPS);
      // Nothing else depends on the weather.
      for (const k of ['near', 'far', 'tintAlpha', 'night', 'cloud', 'glow'] as const) assert.deepEqual(g[k], base[k], k);
    }),
  );
});

test('Property 26: glow is non-increasing in cover and intensity; haze is non-decreasing in intensity', () => {
  fc.assert(
    fc.property(arbCase, arbCover, arbCover, arbIntensity, arbIntensity, (c, c1, c2, i1, i2) => {
      const { sun, sky, season } = setup(c);
      const [lc, hc] = c1 <= c2 ? [c1, c2] : [c2, c1];
      const [li, hi] = i1 <= i2 ? [i1, i2] : [i2, i1];
      const lo = gradeFor(sun, sky, season, { cover: lc, intensity: li });
      const hiG = gradeFor(sun, sky, season, { cover: hc, intensity: hi });
      assert.ok(hiG.glowAlpha <= lo.glowAlpha + EPS, 'glowAlpha');
      assert.ok(hiG.rays <= lo.rays + EPS, 'rays');
      assert.ok(hiG.haze >= lo.haze - EPS, 'haze');
    }),
  );
});

test('Property 26: with the night grade (sun below the horizon, no rays) only haze and active differ from no weather', () => {
  const night = arbCase.filter((c) => {
    const sun = sunAt(sunDay(dateOf(c.day)), c.hour);
    return sun.elevation < 0 && sun.horizonMinutes > 20; // past the 20 minutes the glow and shafts linger
  });
  fc.assert(
    fc.property(night, arbCover, arbIntensity, (c, cover, intensity) => {
      const { sun, sky, season } = setup(c);
      const { haze: _h, active: _a, ...base } = gradeFor(sun, sky, season);
      const { haze: _h2, active: _a2, ...g } = gradeFor(sun, sky, season, { cover, intensity });
      assert.deepEqual(g, base);
    }),
  );
});

/** Property 30: The sun-side helper is the Grade's own mapping.
 * **Validates: Requirements 9.15, 9.18** */
test('Property 30: sunSide falls in the band gradePixels assigns each pixel, to within the 0.45 dither', () => {
  const BANDS = 9;
  // A grade whose tint red channel reads back the band: far is black, near is red, no alpha variation with band.
  const g = { near: [255, 0, 0], far: [0, 0, 0], tintAlpha: 0.5, glow: [0, 0, 0], glowAlpha: 0, rays: 0, night: 1, active: true, cloud: { near: [0, 0, 0], far: [0, 0, 0], amount: 0 }, haze: 0 } as Grade;
  fc.assert(
    fc.property(
      fc.integer({ min: 16, max: 64 }),
      fc.integer({ min: 16, max: 64 }),
      fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
      (w, h, ang) => {
        const dir = { x: Math.cos(ang), y: Math.sin(ang) };
        const R = Math.hypot(w, h) / 2;
        const { tint } = gradePixels(w, h, g, dir, undefined, R);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const band = Math.round((tint[(y * w + x) * 4] / 255) * (BANDS - 1));
            const f = sunSide(x - w / 2, y - h / 2, dir, R) * BANDS;
            const lo = Math.min(BANDS - 1, Math.max(0, Math.floor(f - 0.45)));
            const hi = Math.min(BANDS - 1, Math.max(0, Math.floor(f + 0.45)));
            assert.ok(band >= lo && band <= hi, `(${x},${y}) band ${band} not in ${lo}..${hi}`);
          }
        }
      },
    ),
    { numRuns: 25 },
  );
});

test('Property 30: sunSide is 0.5 at the centre, 1 and 0 a radius toward and away from the sun, and clamped', () => {
  const dir = { x: 0, y: 1 };
  assert.equal(sunSide(0, 0, dir, 100), 0.5);
  assert.equal(sunSide(0, 100, dir, 100), 1);
  assert.equal(sunSide(0, -100, dir, 100), 0);
  assert.equal(sunSide(0, 500, dir, 100), 1);
  assert.equal(sunSide(50, 0, dir, 100), 0.5, 'across the sun direction nothing changes');
});
