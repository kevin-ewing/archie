import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfiler } from './profile.ts';
import { summarise } from '../devtools.ts';

test('frame pacing uses RAF intervals, independently of low JS work and including simulation work', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0;
  Object.assign(globalThis, { performance: { now: () => now } });
  try {
    const p = createProfiler(true, () => {});
    for (let frame = 1; frame <= 3; frame++) {
      now = frame * 10;
      p.start({ at: frame * 1000 / 30, gap: 1000 / 30, simulationMs: 2 });
      now++; p.mark('ground'); now++; p.end();
    }
    const stats = summarise(p.history());
    assert.equal(stats.fps, 30);
    assert.equal(stats.interval.p95, 33.333);
    assert.equal(stats.work.mean, 4);
    assert.equal(stats.stages.simulation, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'performance', original);
  }
});
