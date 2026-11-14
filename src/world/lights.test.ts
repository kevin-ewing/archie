import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK } from './ground.ts';
import { LIGHTS, lampLevel, lampsIn } from './lights.ts';
import { structuresNear } from './structures.ts';

const SEED = 1915;
const homes = structuresNear(SEED, -30000, -30000, 30000, 30000).filter((s) => s.kind === 'farm' || s.kind === 'cottage' || s.kind === 'hamlet');
const lamps = [...new Set(homes.slice(0, 80).map((s) => `${Math.floor(s.x / CHUNK)},${Math.floor(s.y / CHUNK)}`))].flatMap((k) => {
  const [cx, cy] = k.split(',').map(Number);
  return lampsIn(SEED, cx, cy);
});
const lit = (minutes: number, t = 0) => lamps.filter((l) => lampLevel(l, minutes, t) > 0).length;

test('lamps come on around sunset, one house after another, and are out again after dusk', () => {
  assert.ok(lamps.length > 20, `lamps (${lamps.length})`);
  assert.equal(lit(LIGHTS.from - 1), 0, 'dark before');
  assert.ok(lit(20) > lit(LIGHTS.from + 5), 'more lit by dusk');
  assert.ok(lit(LIGHTS.to - 10) < lit(20), 'going out');
  assert.equal(lit(LIGHTS.to), 0, 'all out');
  assert.deepEqual(lampsIn(SEED, 3, 4), lampsIn(SEED, 3, 4));
});

test('each flame flickers on its own but never goes out while lit', () => {
  const on = lamps.filter((l) => lampLevel(l, 20, 0) > 0.5).slice(0, 10);
  for (const l of on) {
    const levels = Array.from({ length: 40 }, (_, k) => lampLevel(l, 20, k * 0.1));
    assert.ok(Math.max(...levels) - Math.min(...levels) > 0.05, 'it flickers');
    assert.ok(Math.min(...levels) > 0.5, 'but stays lit');
  }
  assert.notEqual(lampLevel(on[0], 20, 1), lampLevel(on[1], 20, 1), 'not in step');
});
