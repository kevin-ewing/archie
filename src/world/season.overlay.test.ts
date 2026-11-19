import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { MAY_LOOK, type SeasonState } from '../sim/seasons.ts';
import { DIRT, WATER, rgb, type RGB } from './palette.ts';
import { M } from './military.ts';
import { floodShare, isIce, overlay, surfaceOf, tone, withLook } from './season.ts';
import { landAt } from './ground.ts';
import { frontClearance } from './fronts.ts';

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
// Deep snow is never a flat sheet: where it lies white, about one pixel in five is a tuft of the grass poking
// through, half grass and half pale snow (overlay, world/season.ts). That pixel is under the snow cover too.
const TUFT = tone(GRASS, rgb(0xd9e0e6), 0.5);
const isCovered = (c: RGB) => isSnowTone(c) || (c[0] === TUFT[0] && c[1] === TUFT[1] && c[2] === TUFT[2]);

test('Property 19: snow-covered pixels only grow with snow, and the share tracks it on open ground', () => {
  fc.assert(
    fc.property(seeds, origin, origin, param, param, (seed, ox, oy, p, q) => {
      const [a, b] = p <= q ? [p, q] : [q, p];
      const lo = patch(winter({ snow: a }), seed, ox, oy, GRASS, 0);
      const hi = patch(winter({ snow: b }), seed, ox, oy, GRASS, 0);
      lo.forEach((c, i) => {
        if (isCovered(c)) assert.ok(isCovered(hi[i]), `pixel ${i} covered at snow ${a} but not at ${b}`);
      });
    }),
    { numRuns: 60 },
  );
});

test('Property 19: the snow share on open ground is about 1.25 x snow (full from 0.8)', () => {
  // Snow lies field by field and in drifts along the hedges (snowLie), so a 48-px patch is mostly one field:
  // averaged over 64 well-separated patches, i.e. a few dozen fields.
  fc.assert(
    fc.property(seeds, fc.double({ min: 0.1, max: 0.9, noNaN: true }), (seed, snow) => {
      let covered = 0;
      let n = 0;
      let fields = 0;
      for (let k = 0; k < 400 && fields < 64; k++) {
        const [ox, oy] = [k * 331, k * 197 - 800];
        // Open farmland only: woods and a front's zone hold snow their own way.
        if (landAt(seed, ox + SIZE / 2, oy + SIZE / 2) !== 'open' || frontClearance(seed, ox + SIZE / 2, oy + SIZE / 2) > 0) continue;
        fields++;
        const px = patch(winter({ snow }), seed, ox, oy, GRASS, 0);
        covered += px.filter(isCovered).length;
        n += px.length;
      }
      const want = Math.min(1, 1.25 * snow);
      assert.ok(Math.abs(covered / n - want) <= 0.2, `share ${covered / n} vs ${want} at snow ${snow}`);
    }),
    { numRuns: 30 },
  );
});

test('Property 19: open ground never floods; flooded trench floors only grow with standingWater', () => {
  const isPool = (c: RGB) => WATER.pool.includes(c);
  fc.assert(
    fc.property(seeds, origin, origin, param, (seed, ox, oy, sw) => {
      assert.ok(!patch(winter({ standingWater: sw, mud: sw }), seed, ox, oy, GRASS, 0).some(isPool), 'a field pixel flooded');
    }),
    { numRuns: 30 },
  );
  for (const [c, name] of [[M.bowl, 'trench']] as [RGB, string][]) {
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

test('Property 20: tracks, ruts and dugouts do not turn bright under snow out in the open (trenches and shell holes fill)', () => {
  const dark: RGB[] = [M.track, DIRT.rut, M.dugout];
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
