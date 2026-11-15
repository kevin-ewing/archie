import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeProgress } from './tiles.ts';

test('tile cross-fades progress smoothly and clamp at both ends', () => {
  assert.equal(fadeProgress(1000, 1000, 1500), 0);
  assert.equal(fadeProgress(1000, 1750, 1500), 0.5);
  assert.equal(fadeProgress(1000, 2500, 1500), 1);
  assert.equal(fadeProgress(1000, 3000, 1500), 1);
});

test('cloud prefetch warms wider rings without composing, and limits pending jobs', async () => {
  const { createTileLayer } = await import('./tiles.ts');
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedImageData = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
  let draws = 0;
  const context = { putImageData() {}, clearRect() {}, drawImage() { draws++; } };
  Object.assign(globalThis, {
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
    ImageData: class {},
  });
  try {
    const requested: string[] = [];
    const jobs: (() => void)[] = [];
    const layer = createTileLayer((cx, cy) => {
      requested.push(`${cx},${cy}`);
      return new Promise((resolve) => jobs.push(() => resolve({ rgba: new Uint8ClampedArray(16 * 16 * 4) })));
    }, 16, { prefetchTiles: 2, maxInFlight: 2 });
    layer.prefetch(0, 0, 16);
    assert.deepEqual(requested, ['0,0', '-1,-1'], 'visible tiles are requested before the surrounding rings');
    for (let i = 0; i < 13; i++) {
      assert.ok(jobs.length <= 2, 'pending requests stay bounded');
      jobs.splice(0).forEach((finish) => finish());
      await Promise.resolve();
      layer.prefetch(0, 0, 16);
    }
    assert.equal(new Set(requested).size, 25, 'two full rings are loaded');
    assert.equal(requested.length, 25, 'cached tiles are reused');
    assert.equal(draws, 0, 'hidden clouds never compose an image');
    const visible = layer.compose(0, 0, 16);
    assert.ok(visible.complete);
    assert.equal(visible.canvas.width, 16, 'extra tiles do not enlarge the drawn image');
    assert.equal(draws, 1, 'only the visible tile is drawn');
    assert.ok(layer.compose(32, 32, 16).complete, 'moving into a preloaded ring reveals a ready tile');
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (savedImageData) Object.defineProperty(globalThis, 'ImageData', savedImageData);
    else Reflect.deleteProperty(globalThis, 'ImageData');
  }
});
