import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeProgress } from './tiles.ts';

test('tile cross-fades progress smoothly and clamp at both ends', () => {
  assert.equal(fadeProgress(1000, 1000, 1500), 0);
  assert.equal(fadeProgress(1000, 1750, 1500), 0.5);
  assert.equal(fadeProgress(1000, 2500, 1500), 1);
  assert.equal(fadeProgress(1000, 3000, 1500), 1);
});
