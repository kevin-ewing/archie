import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontInfo, frontPoint, FRONTS, frontsNear } from './fronts.ts';
import { isChurned, isWire, militaryAt, sapAt, trenchBearing } from './military.ts';

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
  const { nearest, territoryAt } = await import('./fronts.ts');
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
  const { DEV, TRENCH_STYLES } = await import('./settings.ts');
  DEV.onlyTrenches = true;
  try {
    for (const style of TRENCH_STYLES) {
      DEV.trenchStyle = style;
      // Through the British fire trench, at a few points along it (hasty scrapes have gaps between them).
      const across = [100, 250, 400, 550].flatMap((s) => Array.from({ length: 81 }, (_, i) => at(s, -f.nml - 52 + i)));
      assert.ok(across.some((s) => s !== null && !isChurned(s)), `${style}: draws a fire trench`);
      assert.ok(at(100, 0) === null || isChurned(at(100, 0)), `${style}: no-man's land is only shelled ground (no works)`);
      assert.equal(at(100, -FRONTS.battery), null, `${style}: no batteries`);
    }
  } finally {
    DEV.onlyTrenches = false;
    DEV.trenchStyle = 'traversed';
  }
});

test('hasty trenches run in long joined stretches (about a minute at cruise), broken by gaps', async () => {
  const { DEV } = await import('./settings.ts');
  DEV.onlyTrenches = true;
  DEV.trenchStyle = 'hasty';
  try {
    // Along the British fire line, every 4 px: is anything of the trench (ditch, bank, spoil) there?
    const present = (s: number) => Array.from({ length: 31 }, (_, i) => at(s, -f.nml - 42 + i * 2)).some((p) => p !== null && !isWire(p) && !isChurned(p));
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

test('each army wires its own way: German wire runs deeper than British, and neither crosses the divide', async () => {
  const { DEV } = await import('./settings.ts');
  DEV.onlyTrenches = true;
  DEV.trenchStyle = 'hasty';
  try {
    // How deep each side's wire runs (its nearest to its furthest wired pixel across the line), along the front.
    const depth = (side: -1 | 1) => {
      const spans: number[] = [];
      for (let s = -3000; s < 3000; s += 37) {
        const wired = Array.from({ length: f.nml + 120 }, (_, i) => i).filter((a) => isWire(at(s, side * a)));
        if (wired.length) spans.push(wired[wired.length - 1] - wired[0]);
        assert.ok(wired.every((a) => a >= 12), 'wire stops short of the divide');
      }
      spans.sort((p, q) => p - q);
      return spans[spans.length >> 1];
    };
    const british = depth(-1);
    const german = depth(1);
    assert.ok(british > 8, `British wire is there (median ${british} px deep)`);
    assert.ok(german > british * 2, `German wire runs deeper: ${german} vs ${british} px`);
  } finally {
    DEV.onlyTrenches = false;
    DEV.trenchStyle = 'traversed';
  }
});

test('saps: the British push out more and longer saps into no-man\'s land than the Germans', async () => {
  const { DEV } = await import('./settings.ts');
  DEV.onlyTrenches = true;
  DEV.trenchStyle = 'hasty';
  try {
    // Dug ground (trench floor) well out in front of each side's fire trench, past where its own walls reach.
    const dug = (side: -1 | 1) => {
      let n = 0;
      for (let s = -6000; s < 6000; s += 3) for (let a = 24; a < f.nml - 70; a += 3) {
        const p = at(s, side * a);
        if (p && p[1] === 0 && !isWire(p) && !isChurned(p)) n++;
      }
      return n;
    };
    const british = dug(-1);
    const german = dug(1);
    assert.ok(british > 50, `British saps are there (${british})`);
    assert.ok(british > german * 2, `more British sap than German: ${british} vs ${german}`);
  } finally {
    DEV.onlyTrenches = false;
    DEV.trenchStyle = 'traversed';
  }
});

test('saps only start where their fire trench is dug, never in one of its gaps', async () => {
  const { DEV } = await import('./settings.ts');
  DEV.onlyTrenches = true;
  DEV.trenchStyle = 'hasty';
  try {
    const dugNear = (s: number, side: number, a: number): boolean => {
      for (let i = -40; i <= 40; i++) {
        const p = at(s, side * (a + i));
        if (p && p[1] === 0 && !isWire(p)) return true;
      }
      return false;
    };
    let saps = 0;
    for (let s = -20000; s < 20000; s += 380) {
      for (const side of [-1, 1] as const) {
        let sp: ReturnType<typeof sapAt> = null;
        for (let q = s; q < s + 380 && !sp; q += 10) sp = sapAt(SEED, side, q, f.nml, f.id % 9973, 1);
        if (!sp) continue;
        saps++;
        // The fire trench runs on past the sap on both sides: its ditch near where the sap leaves it.
        for (const ds of [-40, 40]) assert.ok(dugNear(sp.cs + ds, side, sp.start), `fire trench dug beside the sap at ${Math.round(sp.cs)}`);
      }
    }
    assert.ok(saps > 20, `checked plenty of saps (${saps})`);
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
test('toward a front\'s end the walls give out from the back, and the fire trench keeps its place (no pinch)', async () => {
  const { DEV } = await import('./settings.ts');
  const { nearest } = await import('./fronts.ts');
  DEV.onlyTrenches = true;
  DEV.trenchStyle = 'hasty';
  try {
    const endAt = (s: number) => {
      const p = frontPoint(SEED, f, s, 0);
      return nearest(SEED, [f], p.x, p.y)?.end ?? 0;
    };
    // Trench floor in the fire trench's band and in the back walls' band, over 2,000 px from s0.
    const count = (s0: number) => {
      let fire = 0;
      let back = 0;
      for (let s = s0; s < s0 + 2000; s += 4) {
        for (const side of [-1, 1]) {
          for (let a = f.nml - 20; a < f.nml + 50; a += 2) if (at(s, side * a)?.[1] === 0) fire++;
          for (let a = f.nml + 100; a < f.nml + 250; a += 2) if (at(s, side * a)?.[1] === 0) back++;
        }
      }
      return { fire, back };
    };
    let s1 = f.half;
    while (endAt(s1) < 0.3) s1 -= 100; // where the front has eased out to about a third
    const tip = count(s1 - 1000);
    const mid = count(-1000);
    assert.ok(mid.back > 50, `the back walls are there mid-front (${mid.back})`);
    assert.ok(tip.back < mid.back * 0.25, `near the end the back walls have mostly gone (${tip.back} vs ${mid.back})`);
    assert.ok(tip.fire > mid.fire * 0.5, `the fire trench is still there, in its usual place (${tip.fire} vs ${mid.fire})`);
  } finally {
    DEV.onlyTrenches = false;
    DEV.trenchStyle = 'traversed';
  }
});
test('shell holes: lots in no-man\'s land, a few holding water, and that water sparkles', async () => {
  const { generateTile } = await import('./generate.ts');
  const { CHUNK, WATER } = await import('./ground.ts');
  const { DEV } = await import('./settings.ts');
  const saved = { ...DEV };
  try {
    let holes = 0;
    let pools = 0;
    let glints = 0;
    for (let k = 0; k < 12; k++) {
      const p = frontPoint(SEED, f, k * 400 - 2400, 0);
      const cx = Math.floor(p.x / CHUNK);
      const cy = Math.floor(p.y / CHUNK);
      const tile = generateTile({ kind: 'ground', seed: SEED, cx, cy, features: { structures: false, military: true, density: DEV.density, onlyTrenches: true, trenchStyle: 'hasty' } }); // (this file's world: its fronts are found at this density)
      for (const i of tile.glints ?? []) {
        const st = militaryAt(SEED, [f], cx * CHUNK + (i % CHUNK), cy * CHUNK + Math.floor(i / CHUNK));
        if (st && WATER.pool.includes(st[0] as (typeof WATER.pool)[number])) glints++;
      }
      for (let y = 0; y < CHUNK; y += 2) for (let x = 0; x < CHUNK; x += 2) {
        const st = militaryAt(SEED, [f], cx * CHUNK + x, cy * CHUNK + y);
        if (st && isChurned(st) && st[1] === 0.2) holes++;
        if (st && isChurned(st) && st[1] === 0.05) pools++;
      }
    }
    assert.ok(holes > 12 * 200, `plenty of shell holes (${holes} samples)`);
    assert.ok(pools > 0 && pools < holes * 0.3, `a few hold water (${pools} vs ${holes})`);
    assert.ok(glints > 0, `the water in them catches the sun (${glints} glints, ${pools} pool samples)`);
  } finally {
    Object.assign(DEV, saved); // (generateTile sets the shared settings from its request)
  }
});


test('a map bearing points toward a trench floor in both styles, and respects fronts being disabled', async () => {
  const { DEV } = await import('./settings.ts');
  const before = { ...DEV };
  try {
    DEV.frontLine = false;
    DEV.onlyTrenches = true;
    for (const style of ['hasty', 'traversed'] as const) {
      DEV.trenchStyle = style;
      const p = frontPoint(SEED, f, 0, -f.nml - 1000);
      const bearing = trenchBearing(SEED, p.x, p.y);
      assert.notEqual(bearing, null);
      let found = false;
      // The plotted map samples every 64 px: a narrow strip around the heading must meet a real floor.
      for (let along = 1; along < 2000 && !found; along += 8) {
        for (let across = -32; across <= 32; across += 2) {
          const x = p.x + Math.sin(bearing!) * along + Math.cos(bearing!) * across;
          const y = p.y - Math.cos(bearing!) * along + Math.sin(bearing!) * across;
          if (militaryAt(SEED, fronts, x, y)?.[1] === 0) { found = true; break; }
        }
      }
      assert.ok(found, `${style}: heading leads to a floor, not the empty front divide`);
      assert.equal(trenchBearing(SEED, p.x, p.y), bearing, 'same map fix is deterministic');
    }
    DEV.fronts = false;
    assert.equal(trenchBearing(SEED, 0, 0), null);
  } finally {
    Object.assign(DEV, before);
  }
});
