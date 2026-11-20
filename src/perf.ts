// Repeatable subsystem benchmarks. `npm run benchmark` reports timings; `benchmark:check` compares
// them with the checked-in baseline; `benchmark:update` accepts the current machine as the new baseline.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { engineSound } from './audio/audio.ts';
import { cellular } from './core/noise.ts';
import { gradeFor, gradePixels, skyFor } from './render/grade.ts';
import { createSmoke, updateSmoke } from './render/smoke.ts';
import { dateOf, REFERENCE } from './sim/calendar.ts';
import { seasonAt } from './sim/seasons.ts';
import { advanceClock, createClock, sunAt } from './sim/daylight.ts';
import { sunDay } from './sim/sun.ts';
import { createPlane, updatePlane } from './sim/flight.ts';
import { createInstruments, updateInstruments } from './ui/instruments.ts';
import { cloudChunk } from './world/clouds.ts';
import { CHUNK, groundChunk, HEIGHT_STEPS } from './world/ground.ts';
import { shadeTile } from './world/shading.ts';
import { generateTile } from './world/generate.ts';
import { frontPoint, frontsNear } from './world/fronts.ts';
import { structuresNear } from './world/structures.ts';

type Timing = { median: number; p95: number };
type Baseline = { version: 1; node: string; results: Record<string, Timing> };

const baselineUrl = new URL('../benchmarks/performance.json', import.meta.url);
const historyUrl = new URL('../benchmarks/history.jsonl', import.meta.url);
const args = new Set(process.argv.slice(2));
const results: Record<string, Timing> = {};
let sink = 0;

function bench(id: string, label: string, runs: number, work: (run: number) => number): void {
  work(-1); // warm the JIT and caches without including startup cost
  const samples: number[] = [];
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    sink += work(run);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const timing = { median: samples[Math.floor(samples.length / 2)], p95: samples[Math.floor(samples.length * 0.95)] };
  results[id] = timing;
  if (!args.has('--json')) console.log(`${label.padEnd(27)} ${timing.median.toFixed(2).padStart(8)} ms median  ${timing.p95.toFixed(2).padStart(8)} ms p95`);
}

bench('noise', 'noise / cellular × 50k', 9, (run) => {
  let total = 0;
  for (let i = 0; i < 50_000; i++) total += cellular(1915, i * 0.37 + run, i * -0.23, 420).f2;
  return total;
});

bench('ground', 'ground tile 128²', 7, (run) => groundChunk(1915, run + 20, -11).rgba[run]);
// Ground tiles with the world's additions stamped in: one across the trenches, one over a farmstead.
const front = frontsNear(1915, -40000, -40000, 40000, 40000)[0];
const frontAt = frontPoint(1915, front, 0, -front.nml - 40);
const frontTile = { cx: Math.floor(frontAt.x / CHUNK), cy: Math.floor(frontAt.y / CHUNK) };
const farmSite = structuresNear(1915, -6000, -6000, 6000, 6000).find((s) => s.kind === 'farm')!;
const farmTile = { cx: Math.floor(farmSite.x / CHUNK), cy: Math.floor(farmSite.y / CHUNK) };
bench('groundFront', 'ground tile at the front', 7, (run) => generateTile({ kind: 'ground', seed: 1915, cx: frontTile.cx, cy: frontTile.cy + run, features: { structures: true, military: true } }).rgba[run]);
bench('groundFarm', 'ground tile with a farm', 7, (run) => generateTile({ kind: 'ground', seed: 1915, cx: farmTile.cx, cy: farmTile.cy }).rgba[run + 1]);
// Deep winter (21 January 1916, snow 0.54): snow lies by the pixel, and at a front it follows the works.
const winter = seasonAt(dateOf(256), 1915);
bench('groundSnow', 'ground tile in snow', 7, (run) => generateTile({ kind: 'ground', seed: 1915, cx: run + 20, cy: -11, season: winter }).rgba[run]);
bench('frontSnow', 'front tile in snow', 7, (run) => generateTile({ kind: 'ground', seed: 1915, cx: frontTile.cx, cy: frontTile.cy + run, features: { structures: true, military: true }, season: winter }).rgba[run]);
bench('clouds', 'cloud tile 128²', 7, (run) => cloudChunk(1915, run + 20, -11)[run]);

const heights = new Uint8Array(9 * CHUNK * CHUNK);
for (let y = 0; y < 3 * CHUNK; y++) {
  for (let x = 0; x < 3 * CHUNK; x++) {
    const dx = x - 1.5 * CHUNK;
    const dy = y - 1.5 * CHUNK;
    heights[y * 3 * CHUNK + x] = Math.max(0, 14 - Math.hypot(dx, dy) / 3) * HEIGHT_STEPS;
  }
}
bench('sunlight', 'sunlight tile 128²', 7, (run) => shadeTile(heights, { tx: 0.8, ty: 0.6, elevation: 0.35 + run * 0.001 }, 0, 0)[run]);

const sun = sunAt(sunDay(REFERENCE), 19);
const grade = gradeFor(sun, skyFor(1915, 0, true));
bench('grade', 'grade pixels 720×450', 9, (run) => gradePixels(720, 450, grade, { x: 0.8, y: 0.6 }).tint[run]);

bench('flight', 'flight simulation × 100k', 9, (run) => {
  const plane = createPlane();
  for (let i = 0; i < 100_000; i++) updatePlane(plane, { steer: Math.sin(i + run), boost: i % 120 < 45 }, 1 / 60);
  return plane.x + plane.y + plane.heat;
});

bench('instruments', 'instruments / HUD × 100k', 9, (run) => {
  const plane = createPlane();
  plane.heading = run;
  plane.heat = 0.8;
  plane.boosting = true;
  const instruments = createInstruments(plane);
  for (let i = 0; i < 100_000; i++) {
    plane.heading += 0.001;
    updateInstruments(instruments, plane, 1 / 60);
  }
  return instruments.compass + instruments.rpm + instruments.temp;
});

bench('daylight', 'clock and sun × 100k', 9, (run) => {
  const clock = createClock(5 + run * 0.01);
  for (let i = 0; i < 100_000; i++) advanceClock(clock, 1 / 60, 3);
  return clock.day + clock.hours;
});

bench('engine', 'engine targets × 100k', 9, (run) => {
  let total = 0;
  for (let i = 0; i < 100_000; i++) total += engineSound({ rpm: 900 + (i % 900), rough: (i % 100) / 100, bank: Math.sin(i + run), heat: (i % 100) / 100, boosting: i % 3 === 0, overheated: false }).firingHz;
  return total;
});

bench('smoke', 'smoke simulation × 100k', 9, () => {
  const smoke = createSmoke();
  const plane = createPlane();
  for (let i = 0; i < 100_000; i++) updateSmoke(smoke, plane, 2, 1 / 60);
  return smoke.n + smoke.puffs.length;
});

if (!Number.isFinite(sink)) throw new Error('benchmark produced a non-finite result');
const current: Baseline = { version: 1, node: process.version, results };

if (args.has('--record')) {
  mkdirSync(new URL('.', historyUrl), { recursive: true });
  appendFileSync(historyUrl, `${JSON.stringify({ recordedAt: new Date().toISOString(), ...current })}\n`);
  console.log(`Recorded ${historyUrl.pathname}`);
} else if (args.has('--update')) {
  mkdirSync(new URL('.', baselineUrl), { recursive: true });
  writeFileSync(baselineUrl, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Updated ${baselineUrl.pathname}`);
} else if (args.has('--check')) {
  const baseline = JSON.parse(readFileSync(baselineUrl, 'utf8')) as Baseline;
  const failures: string[] = [];
  for (const [id, timing] of Object.entries(results)) {
    const before = baseline.results[id];
    if (!before) {
      failures.push(`${id}: missing from baseline`);
      continue;
    }
    const ratio = timing.median / before.median;
    const delta = ((ratio - 1) * 100).toFixed(0);
    console.log(`${id.padEnd(12)} ${delta.padStart(5)}%  (${before.median.toFixed(2)} → ${timing.median.toFixed(2)} ms)`);
    // Require both the typical and slow sample to regress substantially, avoiding one noisy run.
    if (ratio > 1.5 && timing.p95 / before.p95 > 1.5) failures.push(`${id}: median +${delta}%, p95 +${(((timing.p95 / before.p95) - 1) * 100).toFixed(0)}%`);
  }
  if (failures.length) throw new Error(`Performance regression:\n${failures.join('\n')}`);
  console.log('Performance is within the 50% regression budget.');
}

if (args.has('--json')) console.log(JSON.stringify(current, null, 2));
