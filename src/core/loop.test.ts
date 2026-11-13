import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blend } from './loop.ts';

test('blend interpolates numbers, takes the short way round for angles, keeps flags from the newer state', () => {
  const a = { x: 0, heading: 3.1, on: false };
  const b = { x: 10, heading: -3.1, on: true };
  const m = blend(a, b, 0.5, ['heading']);
  assert.equal(m.x, 5);
  assert.ok(Math.abs(Math.abs(m.heading) - Math.PI) < 1e-9, 'crosses ±π, not through 0');
  assert.equal(m.on, true);
  assert.deepEqual(blend(a, b, 1, ['heading']).x, 10);
});
