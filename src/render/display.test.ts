import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitView, PIXEL_SIZE } from './display.ts';

const screens: [name: string, w: number, h: number, dpr: number][] = [
  ['1080p monitor', 1920, 1080, 1],
  ['Retina MacBook', 1440, 900, 2],
  ['Windows 125%', 1536, 864, 1.25],
  ['Android portrait', 412, 915, 2.625],
  ['iPhone portrait', 390, 844, 3],
  ['iPhone landscape', 844, 390, 3],
  ['tiny window', 300, 200, 1],
];

test('a game pixel is a whole number of device pixels, about the same physical size everywhere', () => {
  for (const [name, w, h, dpr] of screens) {
    const v = fitView(w, h, dpr);
    const target = v.compact ? PIXEL_SIZE.compact : PIXEL_SIZE.regular;
    assert.ok(Number.isInteger(v.scale) && v.scale >= 1, `${name}: integer scale`);
    // Within half a device pixel of the target size (the most whole-number scaling allows).
    assert.ok(Math.abs(v.scale / dpr - target) <= 0.5 / dpr + 1e-9, `${name}: pixel size`);
  }
  assert.deepEqual(fitView(1440, 900, 2), { scale: 4, compact: false, devW: 2880, devH: 1800, w: 720, h: 450 });
  assert.deepEqual(fitView(390, 844, 3), { scale: 3, compact: true, devW: 1170, devH: 2532, w: 390, h: 844 });
});

test('a collapsed (0-size) window still gives a drawable canvas', () => {
  const v = fitView(800, 0, 2);
  assert.ok(v.devW >= 1 && v.devH >= 1);
});
