import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK, groundAt, groundChunk } from './ground.ts';
import { tileStamp } from './generate.ts';

const ALL_FEATURES = { structures: true, military: true };
import { frontPoint, frontsNear } from './fronts.ts';
import { structuresNear, tracksNear } from './structures.ts';

// Guards against the whole class of "a stamp returned no colour" bugs (e.g. a negative index from %),
// which crash tile generation: sample thousands of pixels, at negative coordinates too, around fronts
// and buildings, and generate whole tiles there.
const SEED = 1915;
const valid = (c: unknown) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isFinite(v));

test('every stamp, anywhere, is a real colour and height; tiles at fronts and farms generate', () => {
  const places: { x: number; y: number }[] = [];
  for (const f of frontsNear(SEED, -40000, -40000, 40000, 40000).slice(0, 6)) {
    for (const s of [-f.half * 0.9, -300, 0, 450]) for (const u of [-1500, -700, -260, -f.nml, 0, f.nml, 300, 1450]) places.push(frontPoint(SEED, f, s, u));
  }
  for (const s of structuresNear(SEED, -40000, -40000, 40000, 40000).slice(0, 40)) places.push(s);
  for (const p of places) {
    const cx = Math.floor(p.x / CHUNK);
    const cy = Math.floor(p.y / CHUNK);
    const stamp = tileStamp(SEED, cx, cy, ALL_FEATURES, []);
    if (!stamp) continue;
    for (let k = 0; k < 400; k++) {
      const x = cx * CHUNK + (k % 20) * 6;
      const y = cy * CHUNK + Math.floor(k / 20) * 6;
      const st: readonly [readonly number[], number] | null = stamp(x, y);
      if (st) assert.ok(valid(st[0]) && Number.isFinite(st[1]) && st[1] >= 0, `bad stamp at ${x},${y}`);
    }
  }
  for (const p of places.slice(0, 12)) assert.doesNotThrow(() => groundChunk(SEED, Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK), tileStamp(SEED, Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK), ALL_FEATURES, [])));
});

test('tracks and worn earth run under trees and hedges, never over them', () => {
  const farms = { structures: true, military: false };
  let checked = 0;
  for (const t of tracksNear(SEED, -20000, -20000, 20000, 20000).slice(0, 60)) {
    for (let k = 0; k <= 40; k++) {
      const x = Math.round(t.ax + ((t.bx - t.ax) * k) / 40);
      const y = Math.round(t.ay + ((t.by - t.ay) * k) / 40);
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const g = groundAt(SEED, x + dx, y + dy);
          if (g[1] <= 0) continue;
          const st = tileStamp(SEED, Math.floor((x + dx) / CHUNK), Math.floor((y + dy) / CHUNK), farms, [])?.(x + dx, y + dy);
          if (!st || st[1] > 0) continue; // nothing flat stamped here (or a building, which may stand over it)
          assert.fail(`flat stamp over a tree or hedge at ${x + dx},${y + dy}`);
        }
      }
      checked++;
    }
  }
  assert.ok(checked > 100);
});

test('the front keeps out of water: its works are masked off lakes (texture-sampled, so only shore pixels slip)', async () => {
  const { landAt } = await import('./ground.ts');
  let stamped = 0;
  let wet = 0;
  for (const f of frontsNear(SEED, -40000, -40000, 40000, 40000).slice(0, 4)) {
    for (let s = -f.half * 0.8; s < f.half * 0.8; s += 900) {
      const p = frontPoint(SEED, f, s, -f.nml);
      const cx = Math.floor(p.x / CHUNK);
      const cy = Math.floor(p.y / CHUNK);
      const stamp = tileStamp(SEED, cx, cy, { structures: false, military: true }, []);
      if (!stamp) continue;
      for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y += 2) {
        for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x += 2) {
          if (!stamp(x, y)) continue;
          stamped++;
          if (landAt(SEED, x, y) === 'water') wet++;
        }
      }
    }
  }
  assert.ok(stamped > 1000, 'the front is there');
  assert.ok(wet / stamped < 0.01, `${wet} of ${stamped} stamped pixels on water`);
});
