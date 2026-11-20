import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { PALETTES, RAIN_COLOUR, SNOW_COLOUR, gradeFor, type Grade, type Sky } from './grade.ts';
import { BANDS, bandOf, particleColour } from './preciptint.ts';
import { ALPHA_LEVELS } from './precipmodel.ts';
import { dateOf } from '../sim/calendar.ts';
import { sunDay } from '../sim/sun.ts';
import { clockPace, sunAt } from '../sim/daylight.ts';

type Kind = 'rain' | 'snow';
type RGB = readonly [number, number, number];
const NEUTRAL = 9 / 16;
const KINDS: Kind[] = ['rain', 'snow'];
const FRAME_MIN = 0.95; // one frame at 40x and 60 fps: 85 game s/s * 40 / 60 is about 0.94 game minutes, times clockPace
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const FS = Array.from({ length: BANDS }, (_, i) => (i + 0.5) / BANDS); // one f per band
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meanColour = (g: Grade, kind: Kind, fs: number[] = FS): RGB => {
  const cs = fs.map((f) => particleColour(g, kind, f));
  return [mean(cs.map((c) => c[0])), mean(cs.map((c) => c[1])), mean(cs.map((c) => c[2]))];
};
const hue = (c: RGB) => {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const chroma = (c: RGB): [number, number] => [(c[2] - lum(c)) / 255, (c[0] - lum(c)) / 255];

const arbPalette = fc.constantFrom(...PALETTES);
const arbDay = fc.integer({ min: 0, max: 364 });
const arbEvening = fc.boolean();
const arbKind = fc.constantFrom(...KINDS);
const arbF = fc.double({ min: 0, max: 1, noNaN: true });
const arbBeauty = fc.double({ min: 0.6, max: 1.4, noNaN: true });

const sky = (palette: (typeof PALETTES)[number], beauty = 1): Sky => ({ palette, beauty, rayEnd: palette.hot });
const horizonHour = (day: number, evening: boolean, minutes: number) => {
  const sd = sunDay(dateOf(day)).sunset;
  return (evening ? sd : 24 - sd) + minutes / 60;
};
const gradeAt = (palette: (typeof PALETTES)[number], day: number, hour: number, beauty = 1, cover = NEUTRAL, intensity = 0.5): Grade =>
  gradeFor(sunAt(sunDay(dateOf(day)), hour), sky(palette, beauty), undefined, { cover, intensity });
const gradeNear = (palette: (typeof PALETTES)[number], day: number, evening: boolean, minutes: number, beauty = 1, cover = NEUTRAL) =>
  gradeAt(palette, day, horizonHour(day, evening, minutes), beauty, cover);
/** Frame times (minutes from the horizon) from `from` to `to`: the clock runs slower near the horizon. */
const frameMinutes = (day: number, evening: boolean, from: number, to: number): number[] => {
  const out = [from];
  for (let m = from; m < to; ) {
    const el = sunAt(sunDay(dateOf(day)), horizonHour(day, evening, m)).elevation;
    m = Math.min(to, m + FRAME_MIN * clockPace(el));
    out.push(m);
  }
  return out;
};
const glowStrength = (g: Grade) => clamp01(g.glowAlpha / 0.68);
/** The Hour_Tint formula of the design, without any glow. */
const hourTint = (g: Grade, kind: Kind, f: number): RGB => {
  const base = kind === 'rain' ? RAIN_COLOUR : SNOW_COLOUR;
  const fm = (bandOf(f) + 0.5) / BANDS;
  const c = [0, 1, 2].map((i) => g.far[i] + (g.near[i] - g.far[i]) * fm);
  // Same hue and 1.5x the tint's chroma at the base's luminance, scaled down (never clipped) to fit 0..255.
  const y = lum(base), ch = c.map((v) => (v - lum(c as unknown as RGB)) * 1.5);
  const s = Math.min(1, Math.max(...ch) > 0 ? (255 - y) / Math.max(...ch) : 1, Math.min(...ch) < 0 ? y / -Math.min(...ch) : 1);
  const lit = ch.map((v) => y + v * s);
  const a = clamp01(g.tintAlpha / 0.15);
  const dim = 1 - 0.35 * g.night;
  return [0, 1, 2].map((i) => (base[i] + (lit[i] - base[i]) * a) * dim) as unknown as RGB;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** Property 27: Particles are lit by the hour, at every hour, whatever the cover.
 * **Validates: Requirements 9.7, 9.12, 9.13, 9.14, 9.17, 9.21** */
test('Property 27: particleColour equals the Hour_Tint formula, and cover 1 equals NEUTRAL_COVER', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, fc.double({ min: 0, max: 24, noNaN: true, maxExcluded: true }), arbBeauty, arbKind, arbF, (p, day, hour, beauty, kind, f) => {
      const full = gradeAt(p, day, hour, beauty, 1);
      const neutral = gradeAt(p, day, hour, beauty, NEUTRAL);
      // The Hour_Tint ignores cover: with the glow off, the two covers give the same colour, and it is the formula.
      const a = particleColour({ ...full, glowAlpha: 0 }, kind, f);
      const b = particleColour({ ...neutral, glowAlpha: 0 }, kind, f);
      assert.deepEqual(a, b);
      const t = hourTint(neutral, kind, f);
      for (let i = 0; i < 3; i++) assert.ok(near(a[i], t[i], 1e-6), `channel ${i}: ${a[i]} vs ${t[i]}`);
      // Whatever the cover, the colour stays in range.
      for (const c of [particleColour(full, kind, f), particleColour(neutral, kind, f)]) for (const v of c) assert.ok(v >= 0 && v <= 255);
    }),
  );
});

test('Property 27: at night every particle is at least 25% of the range above the dark world', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, arbBeauty, arbKind, arbF, fc.double({ min: -2, max: 2, noNaN: true }), (p, day, beauty, kind, f, o) => {
      const g = gradeAt(p, day, o < 0 ? 24 + o : o, beauty); // within 2 h of midnight
      assert.equal(g.night, 1);
      assert.ok(lum(particleColour(g, kind, f)) - lum(g.near) >= 0.25 * 255, `lum ${lum(particleColour(g, kind, f))} world ${lum(g.near)}`);
    }),
  );
});

test('Property 27: the daylit half of each Sun_Window moves the mean colour and rain hue away from midday', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, arbEvening, fc.double({ min: 0, max: 45, noNaN: true }), arbBeauty, arbKind, (p, day, evening, m, beauty, kind) => {
      const g = gradeNear(p, day, evening, evening ? -m : m, beauty);
      const noon = gradeAt(p, day, 12, beauty);
      const a = chroma(meanColour(g, kind)), b = chroma(meanColour(noon, kind));
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.08, `${kind} chroma moved ${Math.hypot(a[0] - b[0], a[1] - b[1])}`);
      if (kind === 'rain') assert.ok(hueGap(hue(meanColour(g, kind)), hue(meanColour(noon, kind))) >= 15, 'rain hue');
    }),
  );
});

test('Property 27: in twilight beyond 15 minutes from the horizon the mean rain hue is nearer 240 degrees', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, arbEvening, fc.double({ min: 15, max: 45, noNaN: true }), arbBeauty, (p, day, evening, m, beauty) => {
      const sun = sunAt(sunDay(dateOf(day)), horizonHour(day, evening, evening ? m : -m));
      fc.pre(sun.elevation >= (-6 * Math.PI) / 180); // civil twilight: the sun no further than 6 degrees below the horizon
      const g = gradeNear(p, day, evening, evening ? m : -m, beauty);
      const noon = gradeAt(p, day, 12, beauty);
      const d = hueGap(hue(meanColour(g, 'rain')), 240), d0 = hueGap(hue(meanColour(noon, 'rain')), 240);
      assert.ok(d0 - d >= 15, `hue gap to 240: twilight ${d}, midday ${d0}`);
    }),
  );
});

/** Property 28: Sun_Glow lights the sun side, starts and ends smoothly, never touches alpha.
 * **Validates: Requirements 9.15, 9.16, 9.18** */
test('Property 28: with glow strength >= 0.3 the sun side is brighter by 5% to 25% of the range, divided by gs', () => {
  let checked = 0;
  fc.assert(
    fc.property(arbPalette, arbDay, arbEvening, fc.double({ min: -45, max: 45, noNaN: true }), arbBeauty, arbKind, (p, day, evening, m, beauty, kind) => {
      const g = gradeNear(p, day, evening, m, beauty, 0);
      const gs = glowStrength(g);
      fc.pre(gs >= 0.3);
      checked++;
      const grid = Array.from({ length: 101 }, (_, i) => i / 100);
      const sunSide = mean(grid.filter((f) => f >= 0.5).map((f) => lum(particleColour(g, kind, f))));
      const away = mean(grid.filter((f) => f < 0.5).map((f) => lum(particleColour(g, kind, f))));
      const r = (sunSide - away) / gs / 255;
      assert.ok(r >= 0.05 && r <= 0.25, `gs ${gs}: (sun - away)/gs = ${r}`);
    }),
    { numRuns: 300 },
  );
  assert.ok(checked > 0, 'no sample had gs >= 0.3');
});

test('Property 28: outside the glow (midnight, midday) the glow term is 0 and the colour is the Hour_Tint', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, fc.constantFrom(0, 12), arbKind, arbF, (p, day, hour, kind, f) => {
      const g = gradeAt(p, day, hour);
      assert.equal(glowStrength(g), 0);
      const t = hourTint(g, kind, f), c = particleColour(g, kind, f);
      for (let i = 0; i < 3; i++) assert.ok(near(c[i], t[i], 1e-6));
    }),
  );
});

test('Property 28: glow strength changes by at most 5% per frame at 40x, through the ray window', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, arbEvening, arbBeauty, (p, day, evening, beauty) => {
      const ms = frameMinutes(day, evening, -120, 120);
      let prev = glowStrength(gradeNear(p, day, evening, ms[0], beauty));
      for (const m of ms.slice(1)) {
        const gs = glowStrength(gradeNear(p, day, evening, m, beauty));
        assert.ok(Math.abs(gs - prev) <= 0.05, `gs ${prev} to ${gs} at ${m} min`);
        prev = gs;
      }
    }),
    { numRuns: 40 },
  );
});

test('Property 28: particleColour carries no alpha, and the sprite alpha levels are four values at most 0.6', () => {
  assert.equal(ALPHA_LEVELS.length, 4);
  for (const a of ALPHA_LEVELS) assert.ok(a <= 0.6);
  const g = gradeNear(PALETTES[0], 100, true, 0);
  for (const kind of KINDS) assert.equal(particleColour(g, kind, 0.7).length, 3);
});

/** Property 29: Particle colours change continuously through sunrise, sunset and twilight.
 * **Validates: Requirements 9.19, 9.20, 9.21** */
test('Property 29: every particle colour channel changes by at most 5% of the range per frame', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, arbEvening, arbBeauty, fc.constantFrom(NEUTRAL, 1), (p, day, evening, beauty, cover) => {
      const ms = frameMinutes(day, evening, -120, 120);
      let prev = gradeNear(p, day, evening, ms[0], beauty, cover);
      for (const m of ms.slice(1)) {
        const g = gradeNear(p, day, evening, m, beauty, cover);
        for (const kind of KINDS) {
          for (const f of FS) {
            const a = particleColour(prev, kind, f), b = particleColour(g, kind, f);
            for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 0.05 * 255, `${kind} f=${f} channel ${i} jumps ${a[i]} to ${b[i]} at ${m} min`);
          }
        }
        // The Grade's own channels are just as smooth.
        const pairs: [readonly number[], readonly number[]][] = [[prev.near, g.near], [prev.far, g.far], [prev.glow, g.glow], [prev.cloud.near, g.cloud.near], [prev.cloud.far, g.cloud.far]];
        for (const [a, b] of pairs) for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 0.05 * 255, `grade channel jumps ${a[i]} to ${b[i]} at ${m} min`);
        assert.ok(Math.abs(prev.tintAlpha - g.tintAlpha) <= 0.05 && Math.abs(prev.glowAlpha - g.glowAlpha) <= 0.05 && Math.abs(prev.cloud.amount - g.cloud.amount) <= 0.05);
        prev = g;
      }
    }),
    { numRuns: 40 },
  );
});

test('Property 29: a kind\'s colour depends only on the Grade, kind and f, not on when it was spawned', () => {
  fc.assert(
    fc.property(arbPalette, arbDay, arbEvening, fc.double({ min: -60, max: 60, noNaN: true }), arbKind, arbF, (p, day, evening, m, kind, f) => {
      const g = gradeNear(p, day, evening, m);
      const first = particleColour(g, kind, f);
      particleColour(gradeNear(p, day, evening, m + 7), kind === 'rain' ? 'snow' : 'rain', 1 - f);
      assert.deepEqual(particleColour(structuredClone(g), kind, f), first);
      assert.deepEqual(particleColour(g, kind, bandOf(f) / BANDS + 0.5 / BANDS), first); // same band, same colour
    }),
  );
});
