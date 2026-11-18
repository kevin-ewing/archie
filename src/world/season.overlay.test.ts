import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { MAY_LOOK, type SeasonState } from '../sim/seasons.ts';
import { DIRT, WATER, rgb, type RGB } from './palette.ts';
import { M } from './military.ts';
import { floodShare, isIce, overlay, surfaceOf, withLook } from './season.ts';

// Feature: seasons-system, Property 19: Snow and flood coverage grow with their parameter
// **Validates: Requirements 10.2, 13.1**
// Feature: seasons-system, Property 20: Dark features stay dark under snow
// **Validates: Requirements 10.3, 13.3**

const winter = (p: Partial<SeasonState>): SeasonState => ({ ...MAY_LOOK, foliage: 0, ...p });
const lum = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const GRASS = rgb(0x4f5a2e);
const SIZE = 48; // a patch of pixels per sample
const seeds = fc.integer({ min: 0, max: 100000 });
const origin = fc.integer({ min: -5000, max: 5000 });
const param = fc.double({ min: 0, max: 1, noNaN: true });

/** Per-pixel results of `overlay` over a SIZE x SIZE patch under a look. */
const patch = (look: SeasonState, seed: number, ox: number, oy: number, c: RGB, h: number) =>
  withLook(look, () => {
    const out: RGB[] = [];
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) out.push(overlay(seed, ox + i, oy + j, c, h));
    return out;
  });

const isSnowTone = (c: RGB) => c[2] >= c[0] && c[0] >= 0xba && c[1] >= 0xc6; // 0xeef1f2, 0xd9e0e6, 0xbac6d2

test('Property 19: snow-covered pixels only grow with snow, and the share tracks it on open ground', () => {
  fc.assert(
    fc.property(seeds, origin, origin, param, param, (seed, ox, oy, p, q) => {
      const [a, b] = p <= q ? [p, q] : [q, p];
      const lo = patch(winter({ snow: a }), seed, ox, oy, GRASS, 0);
      const hi = patch(winter({ snow: b }), seed, ox, oy, GRASS, 0);
      lo.forEach((c, i) => {
        if (isSnowTone(c)) assert.ok(isSnowTone(hi[i]), `pixel ${i} covered at snow ${a} but not at ${b}`);
      });
    }),
    { numRuns: 60 },
  );
});

test('Property 19: the snow share on open ground is within 0.15 of snow', () => {
  // Averaged over many well-separated patches: the noise cells are 40 px wide, so each patch is only one or two
  // independent samples, and 16 of them left a per-seed sd of about 0.05 (a 0.15 miss in a few hundred runs).
  fc.assert(
    fc.property(seeds, fc.double({ min: 0.1, max: 0.9, noNaN: true }), (seed, snow) => {
      let covered = 0;
      let n = 0;
      for (let k = 0; k < 64; k++) {
        const px = patch(winter({ snow }), seed, k * 331, k * 197 - 800, GRASS, 0);
        covered += px.filter(isSnowTone).length;
        n += px.length;
      }
      assert.ok(Math.abs(covered / n - snow) <= 0.15, `share ${covered / n} vs snow ${snow}`);
    }),
    { numRuns: 30 },
  );
});

test('Property 19: flooded pixels only grow with standingWater (trench floors and open ground)', () => {
  const isPool = (c: RGB) => WATER.pool.includes(c);
  for (const [c, name] of [[M.bowl, 'trench'], [GRASS, 'field']] as [RGB, string][]) {
    fc.assert(
      fc.property(seeds, origin, origin, param, param, (seed, ox, oy, p, q) => {
        const [a, b] = p <= q ? [p, q] : [q, p];
        const lo = patch(winter({ standingWater: a }), seed, ox, oy, c, 0);
        const hi = patch(winter({ standingWater: b }), seed, ox, oy, c, 0);
        lo.forEach((px, i) => {
          if (isPool(px)) assert.ok(isPool(hi[i]), `${name} pixel ${i} flooded at ${a} but not at ${b}`);
        });
      }),
      { numRuns: 60 },
    );
  }
  // Trench share: bounded by the parameter (wetness only lowers it).
  fc.assert(
    fc.property(seeds, fc.double({ min: 0.1, max: 0.9, noNaN: true }), (seed, sw) => {
      let flooded = 0;
      let n = 0;
      for (let k = 0; k < 16; k++) {
        const px = patch(winter({ standingWater: sw }), seed, k * 331, k * 197, M.bowl, 0);
        flooded += px.filter((c) => WATER.pool.includes(c)).length;
        n += px.length;
      }
      assert.ok(flooded / n <= sw + 0.15, `flooded ${flooded / n} vs standingWater ${sw}`);
    }),
    { numRuns: 30 },
  );
});

test('Property 19: floodShare is monotone in standingWater and wetness, and within [0, 1]', () => {
  fc.assert(
    fc.property(param, param, param, (a, b, w) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      assert.ok(floodShare(lo, w) <= floodShare(hi, w));
      assert.ok(floodShare(w, lo) <= floodShare(w, hi));
      assert.ok(floodShare(a, b) >= 0 && floodShare(a, b) <= 1);
    }),
  );
});

test('Property 20: tracks, trench floors, ruts and dugouts do not turn bright under snow', () => {
  const dark: RGB[] = [M.track, DIRT.rut, M.dugout, M.bowl, ...M.relicFloor];
  fc.assert(
    fc.property(seeds, origin, origin, fc.constantFrom(...dark), fc.double({ min: 0.05, max: 1, noNaN: true }), (seed, ox, oy, c, snow) => {
      assert.ok(['dirt', 'trench'].includes(surfaceOf(c, 0)));
      const out = patch(winter({ snow }), seed, ox, oy, c, 0);
      out.forEach((px, i) => {
        // Pools and ice are other ground states; with only snow set none may appear.
        assert.ok(!isIce(px) && !WATER.pool.includes(px), `pixel ${i} changed class`);
        assert.ok(lum(px) <= lum(c) + 8, `pixel ${i}: luminance ${lum(px)} > ${lum(c)} for c=${c}, snow=${snow}`);
      });
    }),
    { numRuns: 80 },
  );
});
