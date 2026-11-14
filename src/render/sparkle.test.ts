import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glitterCentre, SPARKLE, sparkleLevel } from './sparkle.ts';

const lit = (sun: number, t: number) => Array.from({ length: 2000 }, (_, i) => sparkleLevel(i / 2000, t, sun)).filter((l) => l > 0).length;

test('water sparkles only in sunlight, more in strong sun, and the pattern changes over time', () => {
  assert.equal(lit(0, 3), 0, 'no sparkle at night');
  assert.ok(lit(1, 3) > lit(0.3, 3) && lit(0.3, 3) > 0, 'stronger sun, more sparkle');
  const a = Array.from({ length: 200 }, (_, i) => sparkleLevel(i / 200, 1, 1)).join('');
  const b = Array.from({ length: 200 }, (_, i) => sparkleLevel(i / 200, 1.5, 1)).join('');
  assert.notEqual(a, b, 'it twinkles');
  assert.ok(Array.from({ length: 2000 }, (_, i) => sparkleLevel(i / 2000, 2, 1)).includes(2), 'some flash into stars');
});

test('every sparkle uses the same slow cycle, at a staggered phase', () => {
  const levels = (t: number) => Array.from({ length: 200 }, (_, i) => sparkleLevel(i / 200, t, 1));
  assert.deepEqual(levels(1.234), levels(1.234 + 1 / SPARKLE.rate));
});

test('the glitter patch lies toward the sun: under you at noon, out by the horizon at sunset', () => {
  const east = { x: 1, y: 0 };
  const high = glitterCentre(0, 0, 500, east, 1.2);
  const low = glitterCentre(0, 0, 500, east, 0.05);
  assert.ok(high.x > 0 && low.x > high.x * 2 && Math.abs(low.y) < 1e-9);
});
