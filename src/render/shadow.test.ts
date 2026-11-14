import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTITUDE, easeHeight, projectShadow, shadowCentre, softSilhouette } from './shadow.ts';
import { SPRITE_H, SPRITE_W } from './plane.ts';

const SUN = { x: 0.45, y: 0.6 };

test('the shadow falls down-sun at altitude, and closer to the plane over trees', () => {
  const flat = shadowCentre(100, 200, SUN, 0);
  assert.ok(Math.abs(flat.x - (100 + ALTITUDE * SUN.x)) < 1e-9 && Math.abs(flat.y - (200 + ALTITUDE * SUN.y)) < 1e-9);
  const trees = shadowCentre(100, 200, SUN, 14);
  assert.ok(trees.x < flat.x && trees.y < flat.y);
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

test('each pixel lifts toward the plane only where it is over raised ground', () => {
  const iw = 8;
  const ih = 8;
  const alpha = new Uint8ClampedArray(iw * ih).fill(255);
  const run = (heightAt: (x: number, y: number) => number) => {
    const out = new Uint8ClampedArray(40 * 40 * 4);
    // Heading 0 (nose up), shadow falling down-screen (+y); plane centre at the origin.
    projectShadow({ alpha, iw, ih, plane: { x: 0, y: 0, heading: 0 }, shadow: { x: 0, y: 1 }, heightAt, heights: new Float32Array(iw * ih), dt: 10, out, bw: 40, bh: 40 });
    const rows: number[] = [];
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (out[(y * 40 + x) * 4 + 3]) rows.push(y);
    return { top: Math.min(...rows), bottom: Math.max(...rows), count: rows.length };
  };
  const flat = run(() => 0);
  assert.equal(flat.bottom - flat.top, ih - 1, 'flat ground: the plain silhouette');
  // The right half of the shadow lands on a 3 px tall hedge: that half moves up (toward the plane), the left stays.
  const bumpy = run((x) => (x > 0 ? 3 : 0));
  assert.ok(bumpy.top < flat.top, 'part of it lifted');
  assert.ok(bumpy.bottom === flat.bottom, 'the rest stayed put');
  assert.ok(bumpy.count >= flat.count, 'no gaps opened up');
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

test('the shadow silhouette can be drawn smaller (perspective), same bitmap size, centred', () => {
  const mask = new Uint8Array(SPRITE_W * SPRITE_H).fill(1);
  const count = (s: ReturnType<typeof softSilhouette>) => s.rgba.filter((v, i) => i % 4 === 3 && v === 255).length;
  const full = softSilhouette(mask, 1);
  const small = softSilhouette(mask, 1, 0.8);
  assert.equal(small.w, full.w);
  const ratio = count(small) / count(full);
  assert.ok(ratio > 0.55 && ratio < 0.75, `area shrinks by about 0.8² (${ratio.toFixed(2)})`);
  assert.equal(small.rgba[((small.h >> 1) * small.w + (small.w >> 1)) * 4 + 3], 255, 'still centred');
});
