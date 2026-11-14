import { DEV, frontPoint, frontsNear } from './src/world/military.ts';
import { generateTile } from './src/world/generate.ts';
import { CHUNK } from './src/world/ground.ts';
DEV.density = 2.5;
const f = frontsNear(1915, -200000, -200000, 200000, 200000)[0];
for (const density of [2.5, 10]) {
  const ts: number[] = [];
  for (let r = 0; r < 30; r++) { const p = frontPoint(1915, f, r * 250 - 3000, -f.nml - 40 - (r % 3) * 50); const t = performance.now(); generateTile({ kind: 'ground', seed: 1915, cx: Math.floor(p.x / CHUNK), cy: Math.floor(p.y / CHUNK), features: { structures: false, military: true, density, onlyTrenches: true, trenchStyle: (process.env.ST ?? 'hasty') as any } }); ts.push(performance.now() - t); }
  ts.sort((p, q) => p - q); console.log('density', density, 'wall tile median', ts[15].toFixed(1), 'ms, max', ts[29].toFixed(1));
}
