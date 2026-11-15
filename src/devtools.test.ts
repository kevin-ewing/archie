import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { summarise, installDevApi } from './devtools.ts';
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


test('the console delegates session controls and rejects bad speeds before the simulation sees them', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const speeds: (number | null)[] = [];
  let pauses = 0, resumes = 0;
  const worldChanges: [string, boolean][] = [];
  Object.assign(globalThis, { window: {} });
  try {
    installDevApi({
      state: () => ({}), setHours: () => {}, setSpeed: (k) => speeds.push(k), goto: () => {},
      pause: () => { pauses++; }, resume: () => { resumes++; }, session: () => ({ version: 1 }),
      toggles: [{ id: 'military', on: true }], onToggle: (id, on) => worldChanges.push([id, on]), complete: () => true, canvases: [],
      prof: { start() {}, mark() {}, end() {}, history: () => [] },
    });
    const api = (globalThis.window as unknown as { archie: { pause(): void; resume(): void; session(): unknown; speed(k: number | null): void; toggle(id: string, on?: boolean): boolean } }).archie;
    api.pause(); api.resume(); api.speed(0); api.speed(null);
    assert.equal(pauses, 1);
    assert.equal(resumes, 1);
    assert.deepEqual(api.session(), { version: 1 });
    for (const k of [-1, NaN, Infinity, 1001]) assert.throws(() => api.speed(k));
    assert.deepEqual(speeds, [0, null]);
    assert.equal(api.toggle('military', false), false);
    assert.deepEqual(worldChanges, [['military', false]]);
    assert.throws(() => api.toggle('military', 'false' as never));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else Reflect.deleteProperty(globalThis, 'window');
  }
});
