import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontInfo, frontPoint, FRONTS, frontsNear, militaryAt } from './military.ts';

const SEED = 1915;
const fronts = frontsNear(SEED, -60000, -60000, 60000, 60000);
const f = fronts[0];
const at = (s: number, u: number) => {
  const p = frontPoint(SEED, f, s, u);
  return militaryAt(SEED, [f], Math.round(p.x), Math.round(p.y));
};

test('fronts are scattered: many of them, at different angles, far apart, the same every time', () => {
  const wide = frontsNear(SEED, -200000, -200000, 200000, 200000);
  assert.ok(wide.length >= 8, `found ${wide.length}`);
  const angles = new Set(wide.map((g) => Math.round((Math.atan2(g.ty, g.tx) * 4) / Math.PI)));
  assert.ok(angles.size >= 3, 'lines run every which way');
  assert.deepEqual(frontsNear(SEED, 0, 0, 5000, 5000), frontsNear(SEED, 0, 0, 5000, 5000));
  assert.ok(fronts.every((g) => g.half * 2 >= FRONTS.length[0] * 0.9), 'each stretches for kilometres');
});

test('fronts never overlap: each lives in its own territory, so within it no other front is ever there', async () => {
  const { nearest, territoryAt } = await import('./military.ts');
  const wide = frontsNear(SEED, -200000, -200000, 200000, 200000);
  let checked = 0;
  for (const a of wide) {
    for (let s = -a.half; s <= a.half; s += 200) {
      for (const u of [-a.nml - 300, 0, a.nml + 300]) {
        const p = frontPoint(SEED, a, s, u);
        if (territoryAt(SEED, p.x, p.y).id !== a.territory) continue; // past its territory's edge: the neighbour's ground
        const n = nearest(SEED, wide, p.x, p.y);
        if (!n) continue; // faded out near the edge
        checked++;
        assert.equal(n.f, a, `front ${n.f.id} intrudes on front ${a.id}`);
      }
    }
  }
  assert.ok(checked > 500, 'checked plenty of points on the fronts');
});

test('a maze around each line: traversed sandbag fire trenches, saps, communication trenches, craters', () => {
  const row = Array.from({ length: 120 }, (_, i) => at(0, -f.nml - 60 + i));
  assert.ok(row.some((s) => s && s[1] === 3), 'sandbag breastworks');
  assert.ok(frontInfo(SEED, frontPoint(SEED, f, 0, 0).x, frontPoint(SEED, f, 0, 0).y).dev > 0.7, 'no-man\'s land is churned');
  // Traverses: the trench floor steps sideways between adjacent bays.
  const floor = (s: number) => {
    for (let u = -f.nml - 40; u < -f.nml + 10; u++) if (at(s, u)?.[1] === 0) return u;
    return NaN;
  };
  assert.ok(new Set(Array.from({ length: 12 }, (_, k) => floor(5 + 26 * k))).size >= 2, 'bays alternate (each bay steps to a random side, so look along a dozen)');
  let trenchPixels = 0;
  for (let s = -2000; s < 2000; s += 7) for (let u = -700; u < -f.nml - 30; u += 3) if (at(s, u)?.[1] === 0) trenchPixels++;
  assert.ok(trenchPixels > 300, 'plenty of trench behind the fire line (support, reserve, communication, old works)');
});

test('gun batteries sit well behind the lines', () => {
  let guns = 0;
  for (let s = -4000; s < 4000 && guns <= 20; s += 1) for (let u = -FRONTS.battery - 200; u < -FRONTS.battery + 200; u += 1) if (at(s, u)?.[1] === 1.5) guns++;
  assert.ok(guns > 20);
});

test('trenches alone, in every style: each draws its fire trench, and nothing else of the front shows', async () => {
  const { DEV, TRENCH_STYLES } = await import('./military.ts');
  DEV.onlyTrenches = true;
  try {
    for (const style of TRENCH_STYLES) {
      DEV.trenchStyle = style;
      // Through the British fire trench, at a few points along it (hasty scrapes have gaps between them).
      const across = [100, 250, 400, 550].flatMap((s) => Array.from({ length: 81 }, (_, i) => at(s, -f.nml - 52 + i)));
      assert.ok(across.some((s) => s !== null), `${style}: draws a fire trench`);
      assert.equal(at(100, 0), null, `${style}: no-man's land is left bare (no craters)`);
      assert.equal(at(100, -FRONTS.battery), null, `${style}: no batteries`);
    }
  } finally {
    DEV.onlyTrenches = false;
    DEV.trenchStyle = 'traversed';
  }
});

test('hasty trenches run in long joined stretches (about a minute at cruise), broken by gaps', async () => {
  const { DEV } = await import('./military.ts');
  DEV.onlyTrenches = true;
  DEV.trenchStyle = 'hasty';
  try {
    // Along the British fire line, every 4 px: is anything of the trench (ditch, bank, spoil) there?
    const present = (s: number) => Array.from({ length: 31 }, (_, i) => at(s, -f.nml - 42 + i * 2)).some((p) => p !== null);
    const runs: number[] = [];
    let n = 0;
    for (let s = -6000; s < 6000; s += 4) {
      if (present(s)) n += 4;
      else if (n) runs.push(n), (n = 0);
    }
    assert.ok(runs.length >= 3, `separate stretches, with gaps (found ${runs.length})`);
    assert.ok(Math.max(...runs) > 1000, 'long, joined-up stretches');
    assert.ok(Math.max(...runs) < 2600, 'none runs on for more than about a minute at cruise');
  } finally {
    DEV.onlyTrenches = false;
    DEV.trenchStyle = 'traversed';
  }
});

test('a front curves (C, hook, S or wander) but never crosses or comes back near itself', () => {
  const wide = frontsNear(SEED, -300000, -300000, 300000, 300000);
  let curly = 0;
  for (const g of wide) {
    const pts: { x: number; y: number }[] = [];
    for (let s = -g.half; s <= g.half; s += 250) pts.push(frontPoint(SEED, g, s, 0));
    // Turning: the heading at the start vs the end.
    const a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const b = Math.atan2(pts.at(-1)!.y - pts.at(-2)!.y, pts.at(-1)!.x - pts.at(-2)!.x);
    if (Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) > Math.PI / 2) curly++;
    // Any two points more than 6 km apart along the line stay well apart on the ground (room for both sides' trenches).
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 24; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        assert.ok(d > 2 * (g.nml + 400), `front ${g.id} comes back within ${d.toFixed(0)} px of itself`);
      }
    }
  }
  assert.ok(curly >= 3, `some fronts curl round more than a right angle (found ${curly} of ${wide.length})`);
});
