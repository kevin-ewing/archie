import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundChunk, groundColor, groundHeight, HEIGHT, treeAt, WATER } from './ground.ts';
import { cloudLevel } from './clouds.ts';

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
