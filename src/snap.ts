// Snap: render any patch of the world to a PNG from Node, with the game's own tile code, in a second or
// two, no browser needed. For seeing what a change to world generation does (layout, colours, stamps).
// It draws ground tiles as the game generates them (landscape + farms + front), optionally lit by the
// sun's shading layer at an hour; not clouds, the plane, the grade or the HUD (use archie.snapshot()
// in the browser for the whole frame).
// The full guide to the agent tools (when to use which, recipes, gotchas): docs/AGENT_TOOLS.md.
//
//   npm run snap                                   one screen (512×384 world px) round the plane's start, ×2
//   npm run snap -- --x=1500 --y=-800              centred somewhere else
//   npm run snap -- --front=4000,-300              centred on the start's front: s along it, u across (+ German side)
//   npm run snap -- --w=2000 --h=1500 --zoom=1     a wider area, 1 image px per world px
//   npm run snap -- --hour=18.5                    lit by the sun's shading at that hour (shadows, relief)
//   npm run snap -- --features=structures,military,full,frontLine --style=traversed --density=2.5 --seed=42
//   npm run snap -- --season=winter --snow=1      the land on a season's middle date (or --date=1915-12-25), with parameters forced
//   npm run snap -- --out=debug/before.png         (default debug/snap.png; debug/ is git-ignored)
//
// Features: structures (farms), military (the front), full (all of the front's works, not only trenches),
// frontLine (the front's own line in red). Default: structures,military (trenches only, hasty), density 10
// and a front at the start, as development plays.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { encodePng } from './core/png.ts';
import { REFERENCE } from './sim/calendar.ts';
import { applyOverrides, parseOverrides, seasonAt, SEASON_DATES } from './sim/seasons.ts';
import { sunAt } from './sim/daylight.ts';
import { sunDay } from './sim/sun.ts';
import { frontPoint, frontsNear } from './world/fronts.ts';
import { generateTile, type Features } from './world/generate.ts';
import { CHUNK } from './world/ground.ts';
import { DEV, TRENCH_STYLES, type TrenchStyle } from './world/settings.ts';
import { shadeTile } from './world/shading.ts';

const opt = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string?]).map(([k, v]) => [k, v ?? 'true']));
const num = (k: string, d: number) => {
  const v = opt.has(k) ? Number(opt.get(k)) : d;
  if (!Number.isFinite(v)) throw new Error(`--${k} must be a number`);
  return v;
};
const seed = num('seed', 1915);
const W = Math.round(num('w', 512));
const H = Math.round(num('h', 384));
const zoom = Math.max(1, Math.round(num('zoom', 2)));
const list = (opt.get('features') ?? 'structures,military').split(',');
const style = (opt.get('style') ?? 'hasty') as TrenchStyle;
if (!TRENCH_STYLES.includes(style)) throw new Error(`--style must be one of ${TRENCH_STYLES.join(', ')}`);
const features: Features = {
  structures: list.includes('structures'),
  military: list.includes('military'),
  onlyTrenches: !list.includes('full'),
  frontLine: list.includes('frontLine'),
  trenchStyle: style,
  density: num('density', 10),
  atStart: true,
};
// Season: --date=YYYY-MM-DD, --season=winter|..., --snow= --frost= --mud= --water= --ice= --foliage= --haze= (0 to 1).
const parsed = parseOverrides(new URLSearchParams([...opt]).toString());
if (parsed.problems.length) throw new Error(parsed.problems.join('; '));
const ov = parsed.overrides;
const date = ov.date ?? (ov.season ? SEASON_DATES[ov.season] : REFERENCE);
const season = ov.date || ov.season || ov.params ? applyOverrides(seasonAt(date, seed), ov) : undefined;
const out = opt.get('out') ?? 'debug/snap.png';

// Where to look: a world point, or s/u on the start's front.
let cx = num('x', 0);
let cy = num('y', 0);
if (opt.has('front')) {
  const [s, u] = opt.get('front')!.split(',').map(Number);
  Object.assign(DEV, { density: features.density, fronts: true, atStart: true });
  const f = frontsNear(seed, -1, -1, 1, 1)[0];
  if (!f) throw new Error('No front at the start for this seed (try another --seed)');
  ({ x: cx, y: cy } = frontPoint(seed, f, s, u ?? 0));
}
const x0 = Math.round(cx - W / 2);
const y0 = Math.round(cy - H / 2);

const started = performance.now();
const tiles = new Map<string, ReturnType<typeof generateTile>>();
const tile = (tx: number, ty: number) => {
  const k = `${tx},${ty}`;
  let t = tiles.get(k);
  if (!t) tiles.set(k, (t = generateTile({ kind: 'ground', seed, cx: tx, cy: ty, features, season })));
  return t;
};
// The sun's shading layer for a tile, from the heights of it and its 8 neighbours (as the game bakes it).
const hour = opt.has('hour') ? num('hour', 12) : null;
const sun = hour === null ? null : sunAt(sunDay(date), hour);
const shades = new Map<string, Uint8ClampedArray>();
const shade = (tx: number, ty: number) => {
  const k = `${tx},${ty}`;
  let s = shades.get(k);
  if (!s) {
    const heights = new Uint8Array(9 * CHUNK * CHUNK);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const h = tile(tx + i - 1, ty + j - 1).heights!;
        for (let r = 0; r < CHUNK; r++) heights.set(h.subarray(r * CHUNK, r * CHUNK + CHUNK), (j * CHUNK + r) * 3 * CHUNK + i * CHUNK);
      }
    }
    shades.set(k, (s = shadeTile(heights, { tx: sun!.toward.x, ty: sun!.toward.y, elevation: sun!.elevation }, tx, ty)));
  }
  return s;
};

const img = new Uint8Array(W * zoom * H * zoom * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const wx = x0 + x;
    const wy = y0 + y;
    const tx = Math.floor(wx / CHUNK);
    const ty = Math.floor(wy / CHUNK);
    const i = ((wy - ty * CHUNK) * CHUNK + (wx - tx * CHUNK)) * 4;
    const g = tile(tx, ty).rgba;
    let r = g[i];
    let gg = g[i + 1];
    let b = g[i + 2];
    if (sun && sun.elevation > 0) {
      const s = shade(tx, ty);
      const a = (s[i + 3] / 255) * sun.strength;
      r = r * (1 - a) + s[i] * a;
      gg = gg * (1 - a) + s[i + 1] * a;
      b = b * (1 - a) + s[i + 2] * a;
    }
    for (let dy = 0; dy < zoom; dy++) for (let dx = 0; dx < zoom; dx++) img.set([r, gg, b], ((y * zoom + dy) * W * zoom + x * zoom + dx) * 3);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(W * zoom, H * zoom, img));
console.log(`${out}: ${W}×${H} world px round (${Math.round(cx)}, ${Math.round(cy)}), ×${zoom}, ${tiles.size} tiles, ${Math.round(performance.now() - started)} ms`);
