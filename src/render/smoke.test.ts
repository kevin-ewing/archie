import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlane } from '../sim/flight.ts';
import { createSmoke, updateSmoke, SMOKE } from './smoke.ts';

test('exhaust smoke: none when fine, light when hot, thick and dark when overheated; puffs fade out', () => {
  const p = createPlane();
  const s = createSmoke();
  for (let i = 0; i < 60; i++) updateSmoke(s, p, 0, 1 / 60);
  assert.equal(s.puffs.length, 0);
  for (let i = 0; i < 60; i++) updateSmoke(s, p, 1, 1 / 60);
  const light = s.puffs.length;
  assert.ok(light >= 3 && s.puffs.every((q) => !q.dark));
  for (let i = 0; i < 60; i++) updateSmoke(s, p, 2, 1 / 60);
  assert.ok(s.puffs.length > light && s.puffs.some((q) => q.dark));
  for (let i = 0; i < 60 * SMOKE.life + 2; i++) updateSmoke(s, p, 0, 1 / 60);
  assert.equal(s.puffs.length, 0, 'all puffs fade away');
});
