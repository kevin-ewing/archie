import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BarnScene } from './barn-art.ts';
import type { BarnJob } from './barn-worker.ts';

test('the desk worker can hand off a complete scene with its pixel buffers', async () => {
  let prepared: BarnScene | undefined;
  const worker = {
    onmessage: (_event: { data: BarnJob }) => {},
    postMessage: (scene: BarnScene, transfer: ArrayBuffer[]) => {
      prepared = structuredClone(scene, { transfer });
      assert.equal(scene.px.data.byteLength, 0);
    },
  };
  Object.defineProperty(globalThis, 'self', { value: worker, configurable: true });
  try {
    await import('./barn-worker.ts');
    worker.onmessage({ data: [300, 200, { day: 10, month: 'MAY', year: 1915, sortie: 1, date: '10 MAY 1915' }, [], [], 2] });
    assert.equal(prepared?.px.data.length, 300 * 200 * 4);
    assert.ok(prepared?.spots.some(({ id }) => id === 'orders'));
    assert.ok(prepared?.drawn.every(({ art, shadow }) => art.data.length && shadow.data.length));
  } finally {
    Reflect.deleteProperty(globalThis, 'self');
  }
});
