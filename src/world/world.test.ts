import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundChunk, groundColor, groundHeight, HAY, HEIGHT, treeAt, WATER } from './ground.ts';
import { cloudLevel } from './clouds.ts';
import { withLook } from './season.ts';
import { seasonAt } from '../sim/seasons.ts';

const water = Object.values(WATER);

test('generation is deterministic per seed', () => {
  assert.deepEqual(groundChunk(1915, -3, 7), groundChunk(1915, -3, 7));
  assert.notDeepEqual(groundChunk(1915, 0, 0), groundChunk(1916, 0, 0));
});

test('the landscape mix stays in sensible bands (guards noise thresholds)', () => {
  for (const seed of [1915, 7, 42]) {
    let wet = 0, wood = 0, cloud = 0, n = 0;
    for (let y = -30000; y < 30000; y += 211) {
      for (let x = -30000; x < 30000; x += 211) {
        n++;
        if (water.includes(groundColor(seed, x, y))) wet++;
        if (groundHeight(seed, x, y) >= HEIGHT.understory) wood++; // crowns and deep forest floor
        if (cloudLevel(seed, x, y) >= 0) cloud++;
      }
    }
    assert.ok(wet / n > 0.01 && wet / n < 0.1, `seed ${seed}: water ${wet / n}`);
    assert.ok(wood / n > 0.05 && wood / n < 0.3, `seed ${seed}: woods ${wood / n}`);
    assert.ok(cloud / n > 0.08 && cloud / n < 0.35, `seed ${seed}: cloud ${cloud / n}`);
  }
});

test('trees are always drawn whole: every pixel of a crown is tree, wherever it stands', () => {
  let checked = 0;
  for (let y = -4000; y < 4000; y += 37) {
    for (let x = -4000; x < 4000; x += 37) {
      const t = treeAt(1915, x, y);
      if (!t) continue;
      checked++;
      const cx = x - t.dx;
      const cy = y - t.dy;
      const centre = treeAt(1915, cx, cy)!;
      assert.ok(centre.dist < 1e-8, 'an overlapping rim must never hide a crown centre');
      for (let py = Math.floor(cy - t.r); py <= cy + t.r; py++) {
        for (let px = Math.floor(cx - t.r); px <= cx + t.r; px++) {
          if (Math.hypot(px - cx, py - cy) >= t.r) continue;
          assert.ok(groundHeight(1915, px, py) >= HEIGHT.tree, `crown at ${cx},${cy} is cut at ${px},${py}`);
        }
      }
    }
  }
  assert.ok(checked > 100, `enough trees sampled (${checked})`);
});

test('some meadows are being mown in June: whole hay cocks out in the fields', () => withLook(seasonAt({ year: 1915, month: 6, day: 21 }, 1915), () => {
  let cocks = 0;
  let cut = 0;
  for (let y = -6000; y < 6000; y += 3) {
    for (let x = -6000; x < 6000; x += 3) {
      if (groundColor(1915, x, y) !== HAY.light || groundHeight(1915, x, y) < 2.5) continue; // a cock's top
      cocks++;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ![HAY.light, HAY.dark].includes(groundColor(1915, x + dx, y + dy) as never))) cut++;
    }
  }
  assert.ok(cocks > 3, `hay cocks (${cocks})`);
  // Never cut by a field edge or a wood; the landscape's rare stray scrub speck may still land on one.
  assert.ok(cut / cocks < 0.08, `whole cocks (${cut}/${cocks} cut)`);
}));

test('a colza field is in flower or not as a whole: never split across the field', async () => {
  const { cellular, valueNoise } = await import('../core/noise.ts');
  const SEED = 3;
  const yellow = new Set(['196,176,58', '169,154,54']); // colza in flower
  const green = new Set(['91,103,52', '78,90,45']); // colza not yet flowering (drawn as young wheat)
  const state = new Map<number, Set<string>>();
  for (let y = -12000; y < 12000; y += 19) {
    for (let x = -12000; x < 12000; x += 19) {
      // The field under (x, y), as ground.ts finds it (same warp and cells).
      const wx = x + (valueNoise(SEED + 30, x / 220, y / 220) - 0.5) * 110 + (valueNoise(SEED + 43, x / 7, y / 7) - 0.5) * 10;
      const wy = y + (valueNoise(SEED + 31, x / 220, y / 220) - 0.5) * 110 + (valueNoise(SEED + 44, x / 7, y / 7) - 0.5) * 10;
      const c = cellular(SEED + 32, wx, wy, 420);
      if (c.f2 - c.f1 < 40) continue; // field interiors only
      const k = groundColor(SEED, x, y).join(',');
      const st = yellow.has(k) ? 'yellow' : green.has(k) ? 'green' : null;
      if (!st) continue;
      if (!state.has(c.id)) state.set(c.id, new Set());
      state.get(c.id)!.add(st);
    }
  }
  const flowering = [...state.values()].filter((s) => s.has('yellow'));
  assert.ok(flowering.length >= 3, 'some colza is in flower');
  assert.equal(flowering.filter((s) => s.has('green')).length, 0, 'no field is half yellow, half green');
});
