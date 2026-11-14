// Small, repeatable performance baselines for the expensive pure paths. These report medians instead of
// enforcing machine-dependent limits; compare the same command before and after a change.

import { performance } from 'node:perf_hooks';
import { cellular } from './core/noise.ts';
import { gradeFor, gradePixels, skyFor } from './render/grade.ts';
import { DAYLIGHT, sunAt } from './sim/daylight.ts';
import { CHUNK, groundChunk, HEIGHT_STEPS } from './world/ground.ts';
import { shadeTile } from './world/shading.ts';

let sink = 0;

function bench(name: string, runs: number, work: (run: number) => number): void {
  work(-1); // warm up the JIT and caches
  const samples: number[] = [];
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    sink += work(run);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(`${name.padEnd(22)} ${samples[Math.floor(samples.length / 2)].toFixed(2)} ms median (${runs} runs)`);
}

bench('cellular × 50,000', 7, (run) => {
  let total = 0;
  for (let i = 0; i < 50_000; i++) total += cellular(1915, i * 0.37 + run, i * -0.23, 420).f2;
  return total;
});

bench('ground tile 128²', 5, (run) => groundChunk(1915, run + 20, -11).rgba[run]);

const heights = new Uint8Array(9 * CHUNK * CHUNK);
for (let y = 0; y < 3 * CHUNK; y++) {
  for (let x = 0; x < 3 * CHUNK; x++) {
    const dx = x - 1.5 * CHUNK;
    const dy = y - 1.5 * CHUNK;
    heights[y * 3 * CHUNK + x] = Math.max(0, 14 - Math.hypot(dx, dy) / 3) * HEIGHT_STEPS;
  }
}
bench('sunlight tile 128²', 5, (run) => shadeTile(heights, { tx: 0.8, ty: 0.6, elevation: 0.35 + run * 0.001 }, 0, 0)[run]);

const sun = sunAt(DAYLIGHT.startDayOfYear, 19);
const grade = gradeFor(sun, skyFor(1915, 0, true));
bench('grade pixels 720×450', 7, (run) => gradePixels(720, 450, grade, { x: 0.8, y: 0.6 }).tint[run]);

if (!Number.isFinite(sink)) throw new Error('benchmark produced a non-finite result');
