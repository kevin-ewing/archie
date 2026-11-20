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
    assert.equal(stats.drops, 3, 'sustained 30 FPS is not silently treated as the display budget');
  } finally {
    if (original) Object.defineProperty(globalThis, 'performance', original);
  }
});

test('diagnostic rows retain their slots when stages appear, disappear, or arrive in a different order', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0;
  Object.assign(globalThis, { performance: { now: () => now } });
  try {
    const reports: string[] = [];
    const p = createProfiler(true, (text) => reports.push(text));
    for (const stages of [['ground', 'clouds'], ['desk paint', 'tiles in'], ['clouds', 'ground']]) {
      p.start({ at: now, gap: 16, simulationMs: 1 });
      for (const stage of stages) { now++; p.mark(stage); }
      now += 501;
      p.end();
    }
    const labels = (report: string) => report.split('\n').slice(1).map((line) => line.split(/\s{2,}/)[0]);
    assert.deepEqual(labels(reports[0]), labels(reports[1]));
    assert.deepEqual(labels(reports[0]), labels(reports[2]));
    assert.match(reports[1], /ground\s+0\.00 ms/);
    assert.match(reports[0], /desk paint\s+0\.00 ms/);
    assert.match(reports[0], /\ncauses    none$/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'performance', original);
  }
});

test('a delayed RAF is attributed to the preceding render or intervening tile work, not the new frame', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0, report = '';
  Object.assign(globalThis, { performance: { now: () => now } });
  try {
    const p = createProfiler(true, (text) => { report = text; });
    now = 500;
    p.start({ at: 500, gap: 16, simulationMs: 0 });
    now += 25; p.mark('sunlight'); p.end();
    now = 533;
    p.start({ at: 533, gap: 33, simulationMs: 0 });
    now++; p.mark('hud'); p.end();
    p.add('tiles in', 25);
    now = 566;
    p.start({ at: 566, gap: 33, simulationMs: 0 });
    now++; p.mark('hud'); p.end();
    now = 599;
    p.start({ at: 599, gap: 33, simulationMs: 0 });
    now++; p.mark('hud'); p.end(); // external gap: the last interval's tiles must not count twice
    now = 1100;
    p.start({ at: 1100, gap: 16, simulationMs: 0 });
    now++; p.end();
    assert.match(report, /js: sunlight 1/);
    assert.match(report, /js: tiles in 1/);
    assert.match(report, /external 1/);
    assert.doesNotMatch(report, /js: hud/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'performance', original);
  }
});
