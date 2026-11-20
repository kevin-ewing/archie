import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { FRONTS, frontPoint, frontsNear, nearest, type Front } from './fronts.ts';
import { DEV } from './settings.ts';

const SEG = 64; // fronts.ts: the curve's sample spacing
/** The plain search the pruned one in fronts.ts must match: every segment, the first nearest on a tie. */
function bruteS(seed: number, f: Front, x: number, y: number): number {
  const n = Math.max(2, Math.round((2 * f.half) / SEG) + 1);
  const X: number[] = [];
  const Y: number[] = [];
  for (let k = 0; k < n - 1; k++) { // (the last vertex isn't exactly reachable through frontPoint; points are kept off that end)
    const p = frontPoint(seed, f, -f.half + k * SEG, 0);
    X.push(p.x);
    Y.push(p.y);
  }
  let best = Infinity, bk = 0, bt = 0;
  for (let k = 0; k < X.length - 1; k++) {
    const dx = X[k + 1] - X[k], dy = Y[k + 1] - Y[k];
    const t = Math.max(0, Math.min(1, ((x - X[k]) * dx + (y - Y[k]) * dy) / (dx * dx + dy * dy)));
    const ex = x - X[k] - dx * t, ey = y - Y[k] - dy * t;
    const d = ex * ex + ey * ey;
    if (d < best) (best = d), (bk = k), (bt = t);
  }
  return -f.half + (bk + bt) * SEG;
}

test('nearest: the pruned curve search finds exactly the segment and point a full search does', () => {
  Object.assign(DEV, { density: 2.5, fronts: true, atStart: true });
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.array(fc.tuple(fc.double({ min: 0.05, max: 0.9, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true })), { minLength: 20, maxLength: 60 }), (seed, picks) => {
      const f = frontsNear(seed, -1, -1, 1, 1)[0];
      if (!f) return;
      let checked = 0;
      // Scattered points (the search starts from the last one's segment, so order matters), then a raster row.
      const pts = picks.map(([a, b]) => frontPoint(seed, f, -f.half + 3 * SEG + a * (2 * f.half - 6 * SEG), b * FRONTS.reach));
      const row = frontPoint(seed, f, 0, 0);
      for (let x = -200; x < 200; x += 3) pts.push({ x: row.x + x, y: row.y + 17 });
      for (const p of pts) {
        const got = nearest(seed, [f], p.x, p.y);
        if (!got) continue;
        assert.equal(got.s, bruteS(seed, f, p.x, p.y), `at (${p.x}, ${p.y})`);
        checked++;
      }
      assert.ok(checked > 0 || picks.length === 0);
    }),
    { numRuns: 40 },
  );
});
