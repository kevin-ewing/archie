import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { MAY_LOOK } from '../sim/seasons.ts';
import { leafCover, withLook } from './season.ts';

// Feature: seasons-system, Property 17: Per-tree leaf timing
// **Validates: Requirements 8.3, 8.4**

const coverAt = (species: number, id: number, leafDays: number, fallDays = -60) => withLook({ ...MAY_LOOK, leafDays, fallDays }, () => leafCover(species, id).cover);

/** The (fractional) leafDays at which this tree's cover reaches 0.5, by bisection (cover is monotone before the fall). */
function halfDay(species: number, id: number): number {
  let lo = -20;
  let hi = 60;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (coverAt(species, id, mid) >= 0.5) hi = mid;
    else lo = mid;
  }
  return hi;
}

test('trees of one species in a wood reach half cover over a spread of at least 5 days', () => {
  // ponytail: the ±3 day offsets give an expected spread near 5.9 days for 50 trees; the 5-day bound is
  // statistical, so the seeds are fixed and the wood is 50 adjacent tree ids.
  fc.assert(
    fc.property(fc.constantFrom(0, 1, 2), fc.integer({ min: 0, max: 1_000_000 }), (species, base) => {
      const days = Array.from({ length: 50 }, (_, i) => halfDay(species, base + i));
      const spread = Math.max(...days) - Math.min(...days);
      assert.ok(spread >= 5, `species ${species} base ${base}: spread ${spread.toFixed(2)} days`);
    }),
    { seed: 1915, numRuns: 20 },
  );
});

test('a single tree never loses leaf cover as leafDays grows before the fall', () => {
  fc.assert(
    fc.property(fc.constantFrom(0, 1, 2), fc.integer({ min: 0, max: 1_000_000 }), fc.double({ min: -30, max: 60, noNaN: true }), fc.double({ min: 0, max: 20, noNaN: true }), (species, id, d, step) => {
      assert.ok(coverAt(species, id, d + step) >= coverAt(species, id, d));
    }),
    { seed: 1915, numRuns: 200 },
  );
});

test('species leaf on different days: oak after elm after poplar', () => {
  assert.ok(halfDay(1, 7) < halfDay(2, 7) && halfDay(2, 7) < halfDay(0, 7));
});
