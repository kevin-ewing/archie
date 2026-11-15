import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrange, barnScene } from './barn-art.ts';
import type { ItemId } from './desk-items.ts';

const info = { day: 10, month: 'May', year: 1915, sortie: 1, date: '10 MAY 1915' };
// Screens in flight's game px: desktop, wide, small laptop, phones upright, phone sideways.
const SIZES = [[512, 384], [960, 540], [400, 300], [195, 422], [234, 506], [422, 195]];
const IDS: ItemId[] = ['orders', 'chart', 'letters', 'photo', 'logbook', 'clockcode', 'helmet', 'calendar'];
const area = (s: { w: number; h: number }) => s.w * s.h;
const cover = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

test('the desk fills any screen, every usable thing is on it, on screen, and mostly in view', () => {
  for (const [W, H] of SIZES) {
    const { px, spots } = barnScene(W, H, info);
    assert.deepEqual([px.w, px.h], [W, H]);
    for (let i = 3; i < px.data.length; i += 4) assert.equal(px.data[i], 255, `${W}x${H}: no holes`);
    assert.deepEqual(new Set(spots.map((s) => s.id)), new Set(IDS), `${W}x${H}: everything is there`);
    for (const s of spots) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= W && s.y + s.h <= H, `${W}x${H}: ${s.id} on screen`);
    // Scattered, but each thing keeps at least a third of itself uncovered by the things above it.
    spots.forEach((s, i) => {
      const covered = spots.slice(i + 1).reduce((sum, t) => sum + cover(s, t), 0);
      assert.ok(covered <= area(s) * 0.67, `${W}x${H}: ${s.id} stays in view (${Math.round((covered / area(s)) * 100)}% covered)`);
    });
  }
  assert.deepEqual(barnScene(512, 384, info).px.data, barnScene(512, 384, info).px.data, 'the same for everyone');
});

test('picking a thing up brings it to the top of the pile, without moving anything', () => {
  const before = barnScene(512, 384, info).spots;
  const after = barnScene(512, 384, info, ['chart']).spots;
  assert.equal(after.at(-1)!.id, 'chart');
  for (const s of before) assert.deepEqual(after.find((a) => a.id === s.id), s);
  assert.equal(arrange(512, 384, info).usable.length, IDS.length);
});
