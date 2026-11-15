import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { summarise } from './devtools.ts';
import { encodePng } from './core/png.ts';

test('frame stats: fps from the gaps, work mean/p95/max, per-stage means, drops', () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({ at: i * 10, work: i === 99 ? 9 : 1, gap: i === 50 ? 40 : 10, stages: new Map([['ground', 0.5], ['hud', i === 99 ? 8.5 : 0.5]]) }));
  const s = summarise(frames);
  assert.equal(s.frames, 100);
  assert.equal(s.work.max, 9);
  assert.equal(s.work.p95, 1);
  assert.equal(s.stages.ground, 0.5);
  assert.equal(s.drops, 1, 'the one long gap');
  assert.ok(s.fps > 90 && s.fps < 100);
});

test('PNG encoder: a valid signature, header and pixel data', () => {
  const rgb = Uint8Array.from({ length: 2 * 2 * 3 }, (_, i) => i * 10);
  const png = encodePng(2, 2, rgb);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 2); // width
  const idat = png.indexOf('IDAT');
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  assert.deepEqual([...raw], [0, ...rgb.subarray(0, 6), 0, ...rgb.subarray(6)]);
});
