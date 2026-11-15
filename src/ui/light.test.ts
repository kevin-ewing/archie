import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPx } from '../core/pixels.ts';
import { applyLight, hudLight } from './light.ts';

test('small-raster lighting matches the diagonal SVG colour transform without changing transparency', () => {
  const px = createPx(2, 1);
  px.data.set([100, 150, 200, 255, 9, 8, 7, 0]);
  const key = '0.5 0 0 0 0.1 0 0.2 0 0 0 0 0 0.8 0 0.05 0 0 0 1 0';
  const light = hudLight(key);
  assert.equal(hudLight(key), light, 'reuse the channel tables while the light is unchanged');
  applyLight(px, light);
  assert.deepEqual([...px.data], [76, 30, 173, 255, 9, 8, 7, 0]);
  const before = px.data.slice();
  applyLight(px, hudLight('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'));
  assert.deepEqual(px.data, before, 'plain daylight needs no tint pass');
});
