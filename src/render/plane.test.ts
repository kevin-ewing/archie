import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROP, propWidth } from './plane.ts';

test('prop width stays in range, covers it, and narrows as the plane banks', () => {
  const level = new Set<number>();
  for (let i = 0; i < 1000; i++) level.add(propWidth(i / 1000, 0));
  assert.equal(Math.min(...level), PROP.minW);
  assert.equal(Math.max(...level), PROP.maxW);
  const banked = Math.max(...Array.from({ length: 1000 }, (_, i) => propWidth(i / 1000, 1)));
  assert.ok(banked < PROP.maxW && banked >= PROP.minW);
});

test('the plane shades itself down-sun: the upper wing\'s shadow falls on what\'s below, and only there', async () => {
  const { selfShadowPixels, selfShadowKey, planePixels, SPRITE_W, SPRITE_H } = await import('./plane.ts');
  // A height map: a high "wing" row over a low "body" column.
  const h = new Int8Array(SPRITE_W * SPRITE_H).fill(-1);
  const px = new Uint8ClampedArray(SPRITE_W * SPRITE_H * 4).fill(200);
  for (let x = 5; x < 20; x++) h[5 * SPRITE_W + x] = 5;
  for (let y = 0; y < SPRITE_H; y++) h[y * SPRITE_W + 10] = Math.max(h[y * SPRITE_W + 10], 0);
  const out = selfShadowPixels(px, h, 0, 1); // sun from the north: shadows fall south
  assert.ok(out[(9 * SPRITE_W + 10) * 4] < 200, 'body below the wing (south of it) is shaded');
  assert.equal(out[(3 * SPRITE_W + 10) * 4], 200, 'north of the wing: lit');
  assert.equal(out[(5 * SPRITE_W + 12) * 4], 200, 'the wing itself: lit');
  // Keys: same light = same bake; no sun = none; a quarter turn of the plane moves the direction.
  assert.equal(selfShadowKey(8, { x: 0, y: 1 }, 0, 0.05), null);
  assert.equal(selfShadowKey(8, { x: 0, y: 1 }, 0, 1)!.key, selfShadowKey(8, { x: 0, y: 1.02 }, 0.01, 1)!.key);
  assert.notEqual(selfShadowKey(8, { x: 0, y: 1 }, 0, 1)!.key, selfShadowKey(8, { x: 0, y: 1 }, Math.PI / 2, 1)!.key);
  assert.ok(planePixels(0).length === SPRITE_W * SPRITE_H * 4);
});
