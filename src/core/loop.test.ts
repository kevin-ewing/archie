import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blend, startLoop } from './loop.ts';
import { createPlane, updatePlane, FLIGHT } from '../sim/flight.ts';

test('blend interpolates numbers, takes the short way round for angles, keeps flags from the newer state', () => {
  const a = { x: 0, heading: 3.1, on: false };
  const b = { x: 10, heading: -3.1, on: true };
  const m = blend(a, b, 0.5, ['heading']);
  assert.equal(m.x, 5);
  assert.ok(Math.abs(Math.abs(m.heading) - Math.PI) < 1e-9, 'crosses ±π, not through 0');
  assert.equal(m.on, true);
  assert.deepEqual(blend(a, b, 1, ['heading']).x, 10);
});


test('30/60/120 Hz and irregular mobile frames cover the same world distance in equal real time', () => {
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const originalRAF = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  try {
    for (const cadence of [[1000 / 30], [1000 / 60], [1000 / 120], [8, 33, 16, 75, 8, 25]]) {
      let now = 0, next: FrameRequestCallback | undefined;
      Object.assign(globalThis, { performance: { now: () => now }, requestAnimationFrame: (cb: FrameRequestCallback) => { next = cb; return 1; } });
      const plane = createPlane();
      startLoop((dt) => updatePlane(plane, { steer: 0, boost: false }, dt), (_alpha, timing) => assert.ok(timing.gap > 0));
      let i = 0;
      while (now < 5000) { now = Math.min(5000, now + cadence[i++ % cadence.length]); next!(now); }
      assert.ok(Math.abs(plane.y + FLIGHT.cruise * 5) <= FLIGHT.cruise / 60 + 1e-6, `${cadence}: same speed, within one fixed tick`);
      assert.equal(plane.speed, FLIGHT.cruise);
    }
  } finally {
    if (originalPerformance) Object.defineProperty(globalThis, 'performance', originalPerformance);
    if (originalRAF) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRAF); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
