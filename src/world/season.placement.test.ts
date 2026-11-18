import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { MAY_LOOK, applyOverrides, seasonAt } from '../sim/seasons.ts';
import { isWater, landAt, treeAt } from './ground.ts';
import { frontsNear } from './fronts.ts';
import { withLook } from './season.ts';
import { structuresNear, tracksNear } from './structures.ts';
// Feature: seasons-system, Property 18: Placement ignores the season
// **Validates: Requirements 8.8, 9.7, 11.6, 12.5**

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const state = fc.record({
  seed: fc.integer({ min: 0, max: 0x7fffffff }),
  year: fc.integer({ min: 1900, max: 2100 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  snow: unit,
  frost: unit,
  mud: unit,
  standingWater: unit,
  ice: unit,
  foliage: unit,
}).map(({ seed, year, month, day, ...params }) => ({ seed, state: applyOverrides(seasonAt({ year, month, day }, seed), { params }) }));

const coord = fc.integer({ min: -20000, max: 20000 });

/** Everything that places things in the world, as plain data. (cropOf is module-private and id-only, so not reachable here.) */
const placement = (seed: number, x: number, y: number) => ({
  tree: treeAt(seed, x, y),
  land: landAt(seed, x, y),
  water: isWater(seed, x, y),
  structures: structuresNear(seed, x, y, x + 256, y + 256),
  tracks: tracksNear(seed, x, y, x + 256, y + 256),
  fronts: frontsNear(seed, x, y, x + 256, y + 256),
});

test('placement queries return the same result under any season state as under MAY_LOOK', () => {
  fc.assert(
    fc.property(state, coord, coord, ({ seed, state }, x, y) => {
      const base = withLook(MAY_LOOK, () => placement(seed, x, y));
      const seasonal = withLook(state, () => placement(seed, x, y));
      assert.deepEqual(seasonal, base);
    }),
    { numRuns: 100 },
  );
});
