// Front map: an internal tool for auditing, planning and tweaking the fronts. Renders PNG maps of where
// fronts develop and where their trenches run, over the lakes and woods, by calling the game's own code
// (world/generate.ts: tileStamp; world/military.ts: frontsNear, frontField; world/ground.ts: landAt), at
// production front frequency, so it shows exactly what the game generates.
//
// By default each image is a close-up cross-section of the front at the plane's start (DEV.atStart
// puts one there for now): a strip straight across it, from behind one side's walls to behind the
// other's, at 2 image px per world px, in the game's own colours (unlit), with the front's own line in
// red. Across the front runs left to right (British side on the left); along it, top to bottom.
// `--whole` maps the whole start front instead, framed tightly, in the key's colours; `--size` maps a
// wide square round the start (also the fallback when there's no front at the start).
//
// Each run writes five maps, for five different seeds, to debug/1.png … debug/5.png (debug/ is
// git-ignored). The previous run's five are kept in debug/backup/ (replacing the run before that), so
// one regeneration can be undone and the second one throws them away.
//
//   npm run frontmap                       five random seeds: cross-sections of the start's front (trenches only, hasty, as the game draws now)
//   npm run frontmap -- --whole            the whole start front instead (the key's colours)
//   npm run frontmap -- --along=800        a longer cross-section strip (world px along the front; default 500)
//   npm run frontmap -- --seeds=1,2,3,4,5  pin the seeds (fewer than five is fine)
//   npm run frontmap -- --full             the whole front (wire, craters, batteries, camps…), not only trenches
//   npm run frontmap -- --style=traversed  another trench style (see TRENCH_STYLES)
//   npm run frontmap -- --size=320000                      a wide area instead: many fronts (scale 128, 2,500 px)
//   npm run frontmap -- --size=160000 --scale=32 --step=8  a wide area, closer (5,000 px)
//
// Key (--whole, --size): black = open land; dark blue = water (lakes and their shores); dark green = woods and copses;
// grey = inside a front's zone (within FRONTS.reach of its line; works only appear here), lighter where
// it lies over water or woods; light grey = no-man's land; white = anything the front stamps (with
// --full, everything it draws). A red line follows each front's own line (its centre). A small red cross
// marks the world origin (the plane's start). The front's
// own zone is mapped; for speed, tiles far from its line show only the land.
// Each output pixel covers `scale`×`scale` world px. Land is sampled at its centre; it's white if any
// sample in it (every `step` px) is stamped, so thin trenches still show.

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { tileStamp } from './world/generate.ts';
import { CHUNK, groundAt, landAt, type GroundStamp, type RGB as Colour } from './world/ground.ts';
import { FRONTS, frontField, frontPoint, frontsNear, nearest, territoryAt, type Front } from './world/fronts.ts';
import { DEV, TRENCH_STYLES, type TrenchStyle } from './world/settings.ts';

const opt = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string?]).map(([k, v]) => [k, v ?? 'true']));
const num = (k: string, d: number) => (opt.has(k) ? Number(opt.get(k)) : d);
const wide = opt.has('size'); // a wide square round the start, instead of just the front there
const MAX_PX = 2500; // the default image size
const style = (opt.get('style') ?? 'hasty') as TrenchStyle;
const seeds = opt.has('seeds') ? opt.get('seeds')!.split(',').map(Number) : Array.from({ length: 5 }, () => Math.floor(Math.random() * 2 ** 31));
if (!TRENCH_STYLES.includes(style)) throw new Error(`--style must be one of ${TRENCH_STYLES.join(', ')}`);
if (seeds.length > 5 || seeds.some((s) => !Number.isInteger(s))) throw new Error('--seeds takes up to five integers, comma-separated');

// Production front frequency (render/scene.ts: createScene(seed, 2.5) outside development), and the
// same per-tile features the game requests (main.ts: trenches only, in one style).
const DENSITY = 2.5;
const FEATURES = { structures: false, military: true, density: DENSITY, onlyTrenches: !opt.has('full'), trenchStyle: style };

// Keep the previous run's maps as the backup (dropping the run before), then write the new ones.
const DIR = 'debug';
const BACKUP = `${DIR}/backup`;
mkdirSync(DIR, { recursive: true });
rmSync(BACKUP, { recursive: true, force: true });
mkdirSync(BACKUP);
for (let i = 1; i <= 5; i++) if (existsSync(`${DIR}/${i}.png`)) renameSync(`${DIR}/${i}.png`, `${BACKUP}/${i}.png`);

type RGB = readonly [number, number, number];
const COLOUR = {
  open: [0, 0, 0],
  water: [20, 45, 110],
  wood: [20, 75, 30],
  zone: [70, 70, 70],
  zoneWater: [70, 95, 150],
  zoneWood: [70, 115, 75],
  nml: [140, 140, 140],
  work: [255, 255, 255],
  origin: [255, 40, 40],
  line: [230, 30, 30], // the front's own line (its centre)
} satisfies Record<string, RGB>;

seeds.forEach((seed, i) => {
  const started = performance.now();
  DEV.density = DENSITY; // as generateTile sets it from the request
  if (!wide && !opt.has('whole')) {
    const cut = crossSection(seed);
    if (cut) {
      const path = `${DIR}/${i + 1}.png`;
      writePng(path, cut.img, cut.w, cut.h);
      console.log(`${path}: seed ${seed}, cross-section ${cut.across} × ${cut.along} world px (${cut.w}×${cut.h} px), ${((performance.now() - started) / 1000).toFixed(1)} s`);
      return;
    }
  }
  const area = areaFor(seed);
  const { img, fronts } = render(seed, area);
  const path = `${DIR}/${i + 1}.png`;
  writePng(path, img, area.w, area.h);
  const what = area.front ? `the start's front (${Math.round((area.front.half * 2) / 1000)} km along its curve)` : `${fronts.size} fronts`;
  console.log(`${path}: seed ${seed}, ${area.w}×${area.h} px (1 px = ${area.scale} world px), ${what}, ${((performance.now() - started) / 1000).toFixed(1)} s`);
});

/**
 * A strip straight across the start's front, centred where the plane starts: across it (u) left to right,
 * along it (s) top to bottom, ZOOM image px per world px. Each world pixel is the game's own (the tile's
 * stamp, else the landscape), unlit, with the front's own line in red.
 */
function crossSection(seed: number) {
  const ZOOM = 2;
  const fronts = frontsNear(seed, -1, -1, 1, 1);
  const start = fronts.find((f) => f.territory === territoryAt(seed, 0, 0).id);
  if (!start) return null;
  const s0 = nearest(seed, fronts, 0, 0)?.s ?? 0;
  const half = Math.round(start.nml + 12 + 3 * 75 + 260); // past the furthest wall on each side and the trenches back across them
  const along = num('along', 500);
  const w = 2 * half * ZOOM;
  const h = along * ZOOM;
  const img = new Uint8Array(w * h * 3);
  const stamps = new Map<string, GroundStamp | undefined>();
  const features = { ...FEATURES, frontLine: true };
  for (let j = 0; j < along; j++) {
    for (let i = 0; i < 2 * half; i++) {
      const p = frontPoint(seed, start, s0 - along / 2 + j + 0.5, -half + i + 0.5);
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      const cx = Math.floor(x / CHUNK);
      const cy = Math.floor(y / CHUNK);
      const key = `${cx},${cy}`;
      if (!stamps.has(key)) stamps.set(key, tileStamp(seed, cx, cy, features, []));
      const c: Colour = stamps.get(key)?.(x, y)?.[0] ?? groundAt(seed, x, y)[0];
      for (let dy = 0; dy < ZOOM; dy++) for (let dx = 0; dx < ZOOM; dx++) img.set(c, (((j * ZOOM + dy) * w) + i * ZOOM + dx) * 3);
    }
  }
  return { img, w, h, across: 2 * half, along };
}

type Area = { x0: number; y0: number; w: number; h: number; scale: number; step: number; front: Front | null; near: (x: number, y: number) => boolean };

/** What to map: the front at the plane's start, framed tightly (or a wide square round the start). */
function areaFor(seed: number): Area {
  const fit = (span: number) => [8, 16, 32, 64, 128].find((k) => span / k <= MAX_PX) ?? 128; // world px per output px (divides CHUNK)
  const start = frontsNear(seed, -1, -1, 1, 1).find((f) => f.territory === territoryAt(seed, 0, 0).id) ?? null;
  if (wide || !start) {
    const size = num('size', 320000);
    const scale = num('scale', fit(size));
    const x0 = -Math.floor(size / 2 / CHUNK) * CHUNK; // chunk-aligned, as the game's tiles are
    return { x0, y0: x0, w: Math.floor(size / scale), h: Math.floor(size / scale), scale, step: num('step', Math.min(scale, 32)), front: null, near: () => true };
  }
  // Points along the start front's line: its bounds, and which tiles are close enough to map in full.
  const pts: { x: number; y: number }[] = [];
  for (let s = -start.half; s <= start.half; s += 400) {
    const p = frontPoint(seed, start, s, 0);
    if (territoryAt(seed, p.x, p.y).id === start.territory) pts.push(p); // only the part inside its territory exists
  }
  const pad = FRONTS.reach + 2000;
  const bx0 = Math.min(...pts.map((p) => p.x)) - pad;
  const by0 = Math.min(...pts.map((p) => p.y)) - pad;
  const bx1 = Math.max(...pts.map((p) => p.x)) + pad;
  const by1 = Math.max(...pts.map((p) => p.y)) + pad;
  const scale = num('scale', fit(Math.max(bx1 - bx0, by1 - by0)));
  const x0 = Math.floor(bx0 / CHUNK) * CHUNK;
  const y0 = Math.floor(by0 / CHUNK) * CHUNK;
  const r2 = (FRONTS.reach + CHUNK) ** 2;
  const near = (x: number, y: number) => pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < r2);
  return { x0, y0, w: Math.ceil((bx1 - x0) / scale), h: Math.ceil((by1 - y0) / scale), scale, step: num('step', Math.min(scale, 8)), front: start, near };
}
console.log(`density ${DENSITY} (production: region ${Math.round(FRONTS.region / Math.sqrt(DENSITY))} px, chance ${FRONTS.chance}), ${FEATURES.onlyTrenches ? `trenches only (${style})` : 'full front'}; previous maps in ${BACKUP}/`);

function render(seed: number, { x0, y0, w: W, h: Hh, scale, step, near }: Area) {
  if (CHUNK % scale || scale % step) throw new Error(`--scale must divide ${CHUNK}, and --step must divide --scale`);
  const img = new Uint8Array(W * Hh * 3);
  const put = (px: number, py: number, c: RGB) => img.set(c, (py * W + px) * 3);
  const seen = new Set<Front>();
  for (let cy = 0; cy * CHUNK < Hh * scale; cy++) {
    for (let cx = 0; cx * CHUNK < W * scale; cx++) {
      const wx0 = x0 + cx * CHUNK;
      const wy0 = y0 + cy * CHUNK;
      const fronts = near(wx0 + CHUNK / 2, wy0 + CHUNK / 2) ? frontsNear(seed, wx0, wy0, wx0 + CHUNK, wy0 + CHUNK) : [];
      for (const f of fronts) seen.add(f);
      // The game's own tile stamp (with its water / deep-wood mask and tree cover).
      const stamp = fronts.length ? tileStamp(seed, wx0 / CHUNK, wy0 / CHUNK, FEATURES, []) : undefined;
      const field = stamp ? frontField(seed, fronts, wx0, wy0, wx0 + CHUNK, wy0 + CHUNK) : null; // as the tile itself uses
      for (let oy = 0; oy < CHUNK / scale; oy++) {
        const py = cy * (CHUNK / scale) + oy;
        if (py >= Hh) break;
        for (let ox = 0; ox < CHUNK / scale; ox++) {
          const px = cx * (CHUNK / scale) + ox;
          if (px >= W) break;
          const bx = wx0 + ox * scale;
          const by = wy0 + oy * scale;
          const land = landAt(seed, bx + scale / 2, by + scale / 2);
          const n = field ? field(bx + scale / 2, by + scale / 2) : null;
          if (!n) {
            put(px, py, COLOUR[land]);
            continue;
          }
          if (Math.abs(n.u) <= scale / 2) {
            put(px, py, COLOUR.line); // the front's own line, one image pixel wide
            continue;
          }
          // ponytail: samples every `step` px; a feature thinner than that can slip between them (lower --step to check).
          let worked = false;
          for (let sy = 0; sy < scale && !worked; sy += step) for (let sx = 0; sx < scale && !worked; sx += step) if (stamp!(bx + sx, by + sy)) worked = true;
          put(px, py, worked ? COLOUR.work : Math.abs(n.u) < n.f.nml ? COLOUR.nml : land === 'water' ? COLOUR.zoneWater : land === 'wood' ? COLOUR.zoneWood : COLOUR.zone);
        }
      }
    }
  }
  // Origin marker (the plane's start).
  const ox = Math.floor(-x0 / scale);
  const oy = Math.floor(-y0 / scale);
  for (let k = -8; k <= 8; k++) for (const [x, y] of [[ox + k, oy], [ox, oy + k]]) if (x >= 0 && y >= 0 && x < W && y < Hh) put(x, y, COLOUR.origin);
  return { img, fronts: seen };
}

/** A minimal 8-bit RGB PNG: one IDAT, no filtering. */
function writePng(path: string, rgb: Uint8Array, w: number, h: number) {
  const row = w * 3;
  const raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * row, (y + 1) * row), y * (row + 1) + 1); // filter byte 0 per row
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour (RGB)
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(path, png);
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
