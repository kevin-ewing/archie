import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK, HEIGHT_STEPS } from './ground.ts';
import { shadeTile } from './shading.ts';

// One tall "tree" (a cone) in the middle of an otherwise flat 3×3 tile block.
const W = 3 * CHUNK;
const heights = new Uint8Array(W * W);
const cx = CHUNK + 64;
const cy = CHUNK + 64;
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const d = Math.hypot(x - cx, y - cy);
  if (d < 6) heights[y * W + x] = Math.round((12 + 4 * (1 - d / 6)) * HEIGHT_STEPS);
}
const alphaAt = (img: Uint8ClampedArray, x: number, y: number) => img[((y - CHUNK) * CHUNK + (x - CHUNK)) * 4 + 3];
const litAt = (img: Uint8ClampedArray, x: number, y: number) => img[((y - CHUNK) * CHUNK + (x - CHUNK)) * 4] === 255;

test('a tree shades the ground down-sun of it, and is lit on its sun-facing side', () => {
  // Morning: sun low in the east (toward = +x). The shadow should fall west (−x) of the tree.
  const img = shadeTile(heights, { tx: 1, ty: 0, elevation: 0.35 }, 0, 0);
  assert.ok(alphaAt(img, cx - 15, cy) > 0, 'ground west of the tree is in shadow');
  assert.equal(alphaAt(img, cx + 15, cy), 0, 'ground east of the tree is in sunlight');
  assert.ok(litAt(img, cx + 4, cy) && !litAt(img, cx - 4, cy), 'east side of the crown lit, west side not');

  // Evening: sun in the west. Everything flips.
  const eve = shadeTile(heights, { tx: -1, ty: 0, elevation: 0.35 }, 0, 0);
  assert.ok(alphaAt(eve, cx + 15, cy) > 0 && alphaAt(eve, cx - 15, cy) === 0);
});

test('the lower the sun, the longer the shadow', () => {
  const reach = (elevation: number) => {
    const img = shadeTile(heights, { tx: 1, ty: 0, elevation }, 0, 0);
    let x = cx - 7;
    while (x > CHUNK && alphaAt(img, x, cy) > 0) x--;
    return cx - x;
  };
  assert.ok(reach(0.2) > reach(0.6) + 10);
});
