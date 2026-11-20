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

test('a one-way view preloads only ahead of itself, and composes exactly its rectangle', async () => {
  const { createTileLayer } = await import('./tiles.ts');
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) } });
  try {
    const requested: string[] = [];
    const layer = createTileLayer((cx, cy) => (requested.push(`${cx},${cy}`), new Promise(() => {})), 16, { prefetchTiles: 1 });
    const out = layer.compose(0, 0, 32, 16, { n: 2, e: 0, s: 0, w: 0 }); // two tiles wide, one tall
    assert.equal(out.complete, false);
    assert.deepEqual(requested, ['0,0', '1,0', '0,-1', '1,-1', '0,-2', '1,-2'], 'the view, then the rows ahead (north), nearest first; nothing to the sides or behind');
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('reused tile canvases: every composite draws exactly the versions it should, through fades and evictions', async () => {
  const { createTileLayer } = await import('./tiles.ts');
  const saved = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'), ImageData: Object.getOwnPropertyDescriptor(globalThis, 'ImageData') };
  // A fake canvas records what it holds: putImageData replaces it; drawImage adds the source's content.
  type Fake = { width: number; height: number; held: string; getContext: () => unknown };
  const make = (): Fake => {
    const c: Fake = { width: 0, height: 0, held: '', getContext: () => ctx };
    const ctx = {
      putImageData: (img: { id: string }) => void (c.held = img.id),
      clearRect: () => void (c.held = ''),
      drawImage: (src: Fake) => void (c.held += `[${src.held}]`),
    };
    return c;
  };
  Object.assign(globalThis, { document: { createElement: make }, ImageData: class { id: string; constructor(d: { id: string }) { this.id = d.id; } } });
  try {
    for (const fadeMs of [1e9, 0.000001]) { // every arrival mid-fade; every fade already over
      let n = 0;
      const versions = new Map<string, number>();
      const pending: (() => void)[] = [];
      const layer = createTileLayer((cx, cy) => {
        const v = versions.get(`${cx},${cy}`) ?? 0;
        return new Promise((resolve) => pending.push(() => resolve({ rgba: { id: `${cx},${cy}#${v}` } as unknown as Uint8ClampedArray<ArrayBuffer> })));
      }, 16, { version: (cx, cy) => String(versions.get(`${cx},${cy}`) ?? 0), fadeMs, prefetchTiles: 0, maxInFlight: 99 });
      for (let step = 0; step < 40; step++) {
        const x = (step % 5) * 16 * 3; // move around, so older tiles are evicted (64 kept) and canvases recycled
        for (let k = 0; k < 4; k++) versions.set(`${x / 16 + k},0`, step);
        const out = layer.compose(x, 0, 64, 16);
        pending.splice(0).forEach((f) => f());
        await Promise.resolve();
        const again = layer.compose(x, 0, 64, 16) as unknown as { canvas: Fake };
        n++;
        assert.ok(out);
        // Each tile's newest drawn image is its newest version: never another tile's, never a stale reuse.
        for (let k = 0; k < 4; k++) assert.ok(again.canvas.held.includes(`[${x / 16 + k},0#${step}]`), `step ${step} tile ${k}: ${again.canvas.held}`);
        // And nothing else: only these four tiles' own versions (a fading tile also shows its earlier ones).
        for (const [, cx, v] of again.canvas.held.matchAll(/(-?\d+),0#(\d+)/g)) {
          assert.ok(+cx >= x / 16 && +cx < x / 16 + 4 && +v <= step, `step ${step}: a recycled canvas shows ${cx},0#${v}: ${again.canvas.held}`);
        }
      }
      assert.ok(n > 0);
    }
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else Reflect.deleteProperty(globalThis, k);
    }
  }
});
