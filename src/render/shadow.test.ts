import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTITUDE, easeHeight, heightUnder, shadowCentre, softSilhouette } from './shadow.ts';
import { SPRITE_H, SPRITE_W } from './plane.ts';

const SUN = { x: 0.45, y: 0.6 };

test('the shadow falls down-sun at altitude, and closer to the plane over trees', () => {
  const flat = shadowCentre(100, 200, SUN, 0);
  assert.ok(Math.abs(flat.x - (100 + ALTITUDE * SUN.x)) < 1e-9 && Math.abs(flat.y - (200 + ALTITUDE * SUN.y)) < 1e-9);
  const trees = shadowCentre(100, 200, SUN, 14);
  assert.ok(trees.x < flat.x && trees.y < flat.y);
  assert.equal(heightUnder((x) => (x > 105 ? 14 : 0), 100, 0), 14, 'a crown at the edge of the shadow catches it');
});

test('it slides onto new ground smoothly (no snapping), and moves smoothly with the plane (no jitter)', () => {
  let h = 0;
  const steps: number[] = [];
  for (let i = 0; i < 30; i++) steps.push((h = easeHeight(h, 14, 1 / 60)));
  assert.ok(steps.every((v, i) => i === 0 || v > steps[i - 1]) && steps[0] < 2 && h > 10, 'eases in');
  // Sub-pixel plane motion gives sub-pixel shadow motion: proportional, never quantised.
  const a = shadowCentre(100, 200, SUN, 0);
  const b = shadowCentre(100.3, 200, SUN, 0);
  assert.ok(Math.abs(b.x - a.x - 0.3) < 1e-9);
});

test('soft silhouette: solid inside, a soft fringe at the edge, nothing far away', () => {
  const mask = new Uint8Array(SPRITE_W * SPRITE_H);
  for (let y = 8; y < 16; y++) for (let x = 8; x < 24; x++) mask[y * SPRITE_W + x] = 1;
  const s = softSilhouette(mask, 1);
  const a = (x: number, y: number) => s.rgba[(y * s.w + x) * 4 + 3];
  const pad = 2;
  assert.equal(a(16 + pad, 12 + pad), 255);
  assert.ok(a(7 + pad, 12 + pad) > 0 && a(7 + pad, 12 + pad) < 255, 'fringe');
  assert.equal(a(0, 0), 0);
});
