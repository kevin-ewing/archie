import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barnDesk } from './desk-art.ts';

test('the barn desk is an opaque deterministic game-pixel raster', () => {
  const desk = barnDesk();
  assert.deepEqual([desk.w, desk.h], [256, 160]);
  assert.deepEqual(desk.data, barnDesk().data);
  for (let i = 3; i < desk.data.length; i += 4) assert.equal(desk.data[i], 255);
});
