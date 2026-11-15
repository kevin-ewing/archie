import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLEARANCE, frontPoint, frontsNear } from './fronts.ts';
import { landAt } from './ground.ts';
import { DEV } from './settings.ts';
import { structuresNear } from './structures.ts';

// The layers are generated in order (front plan → landscape → farms), and each respects the ones before.
const SEED = 1915;

test('no lake or wood in a front\'s core; behind it the landscape comes back', () => {
  DEV.fronts = true;
  const f = frontsNear(SEED, -10, -10, 10, 10)[0];
  let core = 0;
  let behind = 0;
  for (let s = -f.half + 9000; s < f.half - 9000; s += 97) {
    for (let u = -(f.nml + CLEARANCE.core); u <= f.nml + CLEARANCE.core; u += 37) {
      const p = frontPoint(SEED, f, s, u);
      assert.equal(landAt(SEED, Math.round(p.x), Math.round(p.y)), 'open', `core at s=${s}, u=${u}`);
      core++;
    }
    for (const u of [-2400, 2400]) {
      const p = frontPoint(SEED, f, s, u);
      if (landAt(SEED, Math.round(p.x), Math.round(p.y)) !== 'open') behind++;
    }
  }
  assert.ok(core > 1000);
  assert.ok(behind > 0, 'lakes and woods still found well behind the lines');
});

test('no farm in a front\'s core', () => {
  DEV.fronts = true;
  const f = frontsNear(SEED, -10, -10, 10, 10)[0];
  for (let s = -f.half + 9000; s < f.half - 9000; s += 400) {
    const p = frontPoint(SEED, f, s, 0);
    for (const site of structuresNear(SEED, p.x - 300, p.y - 300, p.x + 300, p.y + 300)) {
      assert.ok(Math.hypot(site.x - p.x, site.y - p.y) > f.nml + CLEARANCE.core, `farm in the core near s=${s}`);
    }
  }
});

test('with the front off, the landscape ignores it', () => {
  DEV.fronts = false;
  try {
    let wood = 0;
    for (let y = -20000; y < 20000; y += 400) for (let x = -20000; x < 20000; x += 400) if (landAt(SEED, x, y) !== 'open') wood++;
    assert.ok(wood > 0);
  } finally {
    DEV.fronts = true;
  }
});
