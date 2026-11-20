// Fingerprint: prove a refactor or optimisation didn't change what the world looks like. Hashes the ground
// tiles (pixels and heights) over a fixed set of places (across the start's front, farmland, the far
// countryside) in several feature configurations, and compares them with a saved run.
//
//   npm run fingerprint -- --save    record the current output (debug/fingerprint.json; debug/ is git-ignored)
//   npm run fingerprint              compare with it: IDENTICAL, or which configurations and tiles changed
//                                    (exit code 1 on any change, so it can gate a script)
//
// Run --save before the change, then compare after. When a change is meant to alter the look, snap the
// tiles it reports (npm run snap -- --x= --y=) to see what moved.
// The full guide to the agent tools (when to use which, recipes, gotchas): docs/AGENT_TOOLS.md.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { frontPoint, frontsNear } from './world/fronts.ts';
import { generateTile, type Features } from './world/generate.ts';
import { CHUNK } from './world/ground.ts';
import { DEV } from './world/settings.ts';
import { dateOf } from './sim/calendar.ts';
import { seasonAt, type SeasonState } from './sim/seasons.ts';

const SEED = 1915;
const FILE = 'debug/fingerprint.json';
const CONFIGS: Record<string, Features> = {
  landscape: { structures: false, military: false, density: 1 },
  farms: { structures: true, military: false, density: 2.5 },
  'front (hasty trenches, dev)': { structures: true, military: true, density: 10, onlyTrenches: true, trenchStyle: 'hasty', atStart: true },
  'front (traversed, everything)': { structures: true, military: true, density: 10, onlyTrenches: false, trenchStyle: 'traversed', atStart: true },
  'front (production density)': { structures: true, military: true, density: 2.5, onlyTrenches: false, atStart: true },
};

// The year, sampled: days after the 10 May 1915 start (the same sweep as ?day= in docs/AGENT_TOOLS.md),
// each in the production front configuration, so seasonal looks (snow, frost, mud, autumn) are covered too.
const SEASON_DAYS = [0, 42, 72, 103, 134, 164, 195, 225, 256, 271, 287, 316, 347];
const SEASONS: Record<string, SeasonState> = Object.fromEntries(SEASON_DAYS.map((d) => [`season day ${d}`, seasonAt(dateOf(d), SEED)]));

/** The tiles to hash: across the start's front at several points along it, plus farmland and far country. */
function places(ft: Features): [number, number][] {
  const set = new Set<string>();
  Object.assign(DEV, { density: ft.density ?? 1, fronts: true, atStart: true });
  const f = frontsNear(SEED, -1, -1, 1, 1)[0];
  if (f) for (const s of [-9000, -3000, 0, 4000, 11000]) for (const u of [-2400, -1450, -700, -300, -150, 0, 150, 300, 700, 1450, 2400]) {
    const p = frontPoint(SEED, f, s, u);
    set.add(`${Math.floor(p.x / CHUNK)},${Math.floor(p.y / CHUNK)}`);
  }
  for (let k = 0; k < 24; k++) set.add(`${k * 13 - 150},${k * 7 - 80}`);
  return [...set].sort().map((k) => k.split(',').map(Number) as [number, number]);
}

const result: Record<string, Record<string, string>> = {};
const hashAll = (name: string, ft: Features, season?: SeasonState) => {
  result[name] = {};
  for (const [cx, cy] of places(ft)) {
    const t = generateTile({ kind: 'ground', seed: SEED, cx, cy, features: ft, season });
    result[name][`${cx},${cy}`] = createHash('sha1').update(t.rgba).update(t.heights!).digest('hex').slice(0, 16);
  }
};
for (const [name, ft] of Object.entries(CONFIGS)) hashAll(name, ft);
for (const [name, s] of Object.entries(SEASONS)) hashAll(name, CONFIGS['front (production density)'], s);

if (process.argv.includes('--save')) {
  mkdirSync('debug', { recursive: true });
  writeFileSync(FILE, JSON.stringify(result, null, 1));
  console.log(`Saved ${Object.values(result).reduce((n, r) => n + Object.keys(r).length, 0)} tile hashes to ${FILE}`);
} else {
  if (!existsSync(FILE)) throw new Error(`No saved fingerprint: run "npm run fingerprint -- --save" first (before your change)`);
  const saved = JSON.parse(readFileSync(FILE, 'utf8')) as typeof result;
  let changed = 0;
  for (const [name, tiles] of Object.entries(result)) {
    const diff = Object.keys(tiles).filter((k) => saved[name]?.[k] !== tiles[k]);
    changed += diff.length;
    const where = diff.slice(0, 4).map((k) => {
      const [cx, cy] = k.split(',').map(Number);
      return `(${cx * CHUNK + CHUNK / 2}, ${cy * CHUNK + CHUNK / 2})`;
    });
    console.log(`${name.padEnd(30)} ${diff.length ? `CHANGED ${diff.length}/${Object.keys(tiles).length} tiles, e.g. at world ${where.join(' ')}` : 'identical'}`);
  }
  if (changed) process.exitCode = 1;
  else console.log('IDENTICAL output in every configuration.');
}
