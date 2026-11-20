import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrecipLayer, type PrecipFrame } from './precip.ts';
import { ALPHA_LEVELS } from './precipmodel.ts';
import { fitView } from './display.ts';
import type { WeatherState } from '../sim/weather.ts';

type Call = { name: string; args: unknown[] };
type Rec = { ctx: CanvasRenderingContext2D; calls: Call[]; sets: Map<string, unknown[]>; canvas: { width: number; height: number; hidden: boolean } };

// A 2D context that records every method call and property write, and implements nothing else.
function recorder(store = true): Rec {
  const calls: Call[] = [];
  const sets = new Map<string, unknown[]>();
  const canvas = { width: 1000, height: 700, hidden: false };
  const ctx = new Proxy({ canvas } as Record<string, unknown>, {
    get: (t, p: string) => (p in t ? t[p] : (...args: unknown[]) => { if (store) calls.push({ name: p, args }); }),
    set: (t, p: string, v) => { t[p] = v; (sets.get(p) ?? sets.set(p, []).get(p)!).push(v); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, sets, canvas };
}

const view = fitView(1000, 700, 1);
const wet = (precipitation: 'rain' | 'snow' | 'none', intensity: number): WeatherState =>
  Object.freeze({ kind: precipitation === 'none' ? 'clear' : precipitation, precipitation, intensity, cloudCover: 0.9, coverKey: 7 });

// ponytail: boardRects are in game px, the same space as the particle pixel list (precip.ts compares them directly).
const wholeBoard = Object.freeze([Object.freeze({ x: -100, y: -100, w: view.w + 200, h: view.h + 200 })]);

const frame = (rec: Rec | null, weather: WeatherState, t: number, extra: Partial<PrecipFrame> = {}): PrecipFrame => ({
  ctx: rec ? rec.ctx : null, view, weather, seed: 7, grade: undefined, sunScreen: undefined, heading: 0.3, bank: 0.1, camAngle: 0, t, ...extra,
});

/** Run `seconds` of 30 fps frames from `t0`; returns the next t. */
function run(layer: ReturnType<typeof createPrecipLayer>, rec: Rec | null, weather: WeatherState, t0: number, seconds: number, extra: Partial<PrecipFrame> = {}) {
  let t = t0;
  for (let i = 0; i < seconds * 30; i++, t += 1 / 30) layer.draw(frame(rec, weather, t, extra));
  return t;
}
const fills = (r: Rec) => r.calls.filter((c) => c.name === 'fillRect');
const alphaOf = (s: unknown) => Number(/rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(String(s))![1]);

test('hidden phases and idle weather make no context calls', () => {
  const r = recorder();
  const layer = createPrecipLayer(false);
  layer.hide(); // before any draw: nothing to hide
  run(layer, r, wet('none', 0), 0, 2);
  assert.equal(r.calls.length, 0);
  assert.equal(r.sets.size, 0);

  run(layer, r, wet('rain', 1), 2, 3); // draw something, then leave the playing phase
  assert.ok(fills(r).length > 0);
  layer.hide();
  assert.equal(r.canvas.hidden, true);
  const n = r.calls.length;
  layer.hide();
  assert.equal(r.calls.length, n, 'a second hide draws nothing');
});

test('a null context is a no-op', () => {
  const layer = createPrecipLayer(false);
  assert.doesNotThrow(() => run(layer, null, wet('rain', 1), 0, 1));
  assert.doesNotThrow(() => layer.hide());
});

test('rain that ends clears once, hides the canvas, then draws nothing', () => {
  const r = recorder();
  const layer = createPrecipLayer(false);
  const t = run(layer, r, wet('rain', 1), 0, 3);
  const t2 = run(layer, r, wet('none', 0), t, 6); // fade out (2 s) and settle
  assert.equal(r.canvas.hidden, true);
  r.calls.length = 0;
  run(layer, r, wet('none', 0), t2, 1);
  assert.equal(r.calls.length, 0);
});

test('draws only fillRect (plus clear and transform), never a full-screen fill', () => {
  for (const kind of ['rain', 'snow'] as const) {
    const r = recorder();
    run(createPrecipLayer(false), r, wet(kind, 1), 0, 3);
    const names = new Set(r.calls.map((c) => c.name));
    for (const n of names) assert.ok(['fillRect', 'clearRect', 'setTransform'].includes(n), `unexpected call ${n}`);
    assert.ok(fills(r).length > 0, kind);
    for (const c of fills(r)) {
      const [, , w, h] = c.args as number[];
      assert.ok(w < view.w / 2 && h < view.h / 2, 'sprite-sized fill');
    }
  }
});

test('fillRect coordinates are integers, the transform is a whole device scale, smoothing is off', () => {
  for (const kind of ['rain', 'snow'] as const) {
    const r = recorder();
    run(createPrecipLayer(false), r, wet(kind, 1), 0, 3, { heading: 1.1, bank: -0.4 });
    for (const c of fills(r)) for (const v of c.args as number[]) assert.ok(Number.isInteger(v), `${kind}: ${v}`);
    for (const c of r.calls.filter((c) => c.name === 'setTransform').slice(1)) {
      const a = c.args as number[];
      assert.ok(Number.isInteger(a[0]) && a[0] === a[3] && a[1] === 0 && a[2] === 0, 'no rotation, whole scale');
    }
    assert.ok(r.sets.get('imageSmoothingEnabled')!.every((v) => v === false));
  }
});

test('only the four alpha levels are used, and at most 0.5', () => {
  const r = recorder();
  run(createPrecipLayer(false), r, wet('rain', 1), 0, 3);
  run(createPrecipLayer(false), r, wet('snow', 1), 0, 3);
  const alphas = new Set((r.sets.get('fillStyle') ?? []).map(alphaOf));
  assert.ok(alphas.size > 1);
  for (const a of alphas) assert.ok((ALPHA_LEVELS as readonly number[]).includes(a), `alpha ${a}`);
  assert.ok(Math.max(...alphas) <= 0.5);
});

test('over the instrument board alpha is halved, so at most 0.25', () => {
  const r = recorder();
  run(createPrecipLayer(false), r, wet('rain', 1), 0, 3, { boardRects: wholeBoard });
  const alphas = (r.sets.get('fillStyle') ?? []).map(alphaOf);
  assert.ok(alphas.length > 0);
  assert.ok(Math.max(...alphas) <= 0.25 + 1e-9, `max ${Math.max(...alphas)}`);
  const levels = (ALPHA_LEVELS as readonly number[]).map((a) => a * 0.5);
  for (const a of alphas) assert.ok(levels.some((l) => Math.abs(l - a) < 1e-9), `alpha ${a}`);

  // Control: with no board the same weather uses an alpha above 0.25.
  const free = recorder();
  run(createPrecipLayer(false), free, wet('rain', 1), 0, 3);
  assert.ok(Math.max(...(free.sets.get('fillStyle') ?? []).map(alphaOf)) > 0.25);
});

test('no per-frame growth: the fill style set stays bounded over many frames', () => {
  const r = recorder(false); // counts nothing, keeps nothing but property writes
  const layer = createPrecipLayer(false);
  let t = run(layer, r, wet('rain', 1), 0, 3, { boardRects: wholeBoard });
  const early = new Set(r.sets.get('fillStyle')).size;
  const writes = r.sets.get('fillStyle')!.length;
  t = run(layer, r, wet('rain', 1), t, 20, { boardRects: wholeBoard });
  assert.equal(new Set(r.sets.get('fillStyle')).size, early, 'no new styles after warm-up');
  assert.ok(r.sets.get('fillStyle')!.length > writes);
  assert.ok(early <= 2 * 2 * ALPHA_LEVELS.length * 5, 'bounded by kind x board x level x band');
});

test('weather, view, grade inputs and board rects are not mutated', () => {
  const w = wet('snow', 0.8);
  const sun = Object.freeze({ x: 0.6, y: -0.8 });
  const before = JSON.stringify([w, view, wholeBoard, sun]);
  const r = recorder();
  // Frozen objects throw on writes in strict mode, so a successful run already proves it; the JSON check covers deep fields.
  run(createPrecipLayer(false), r, w, 0, 3, { boardRects: wholeBoard, sunScreen: sun });
  assert.equal(JSON.stringify([w, view, wholeBoard, sun]), before);
});
