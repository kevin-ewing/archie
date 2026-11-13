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
