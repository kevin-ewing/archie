import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPx, textWidth } from './pixels.ts';

test('an empty raster is still at least 1×1 (ImageData rejects 0-size)', () => {
  const px = createPx(textWidth(''), 5);
  assert.ok(px.w >= 1 && px.h === 5 && px.data.length === px.w * px.h * 4);
});
