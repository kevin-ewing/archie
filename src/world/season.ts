// What a season looks like on the ground: the per-request look, tone families and per-tree leaf cover.
// The only world/ module that knows about seasons. Every function here is the identity at MAY_LOOK: the
// tone helpers return the very same RGB arrays as today's tables, so a neutral tile allocates nothing and
// keeps the identity comparisons groundChunk relies on (e.g. `c === WATER.deep`).
//
// Per request, generateTile calls setLook() once (like `DEV` in settings.ts). Workers handle one request
// at a time, so a module-level look is safe; tests that need another look use withLook().
// Colours and day offsets are tuning values, [VERIFY] against northern-France sources.

import { bayer, fbm, hash, valueNoise } from '../core/noise.ts';
import { CROP_NAMES, MAY_LOOK, type SeasonState } from '../sim/seasons.ts';
import { DIRT, SHORE, WATER, type RGB } from './palette.ts';
import { M } from './military.ts';
import { YARD } from './structures.ts';

type Tones = readonly [RGB, RGB, RGB, RGB];
type Pair = readonly [RGB, RGB];

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/** The look for the tile being generated. Read by ground.ts, structures.ts and military.ts. */
export const look: { s: SeasonState } = { s: MAY_LOOK };

let crownCache = new Map<number, Tones>();
let cropCache = new Map<number, Pair>();
let grassCache = new Map<RGB, { b: RGB; p: Pair }>();

export function setLook(s: SeasonState): void {
  look.s = s;
  crownCache = new Map();
  cropCache = new Map();
  grassCache = new Map();
}

/** Run `fn` under another look, then restore the previous one (test helper). */
export function withLook<T>(s: SeasonState, fn: () => T): T {
  const prev = look.s;
  setLook(s);
  try {
    return fn();
  } finally {
    setLook(prev);
  }
}

// ---------------------------------------------------------------- tone blending

const interned = new Map<number, RGB>(); // bounded: a small palette times 16 blend steps
const intern = (r: number, g: number, b: number): RGB => {
  const k = (r << 16) | (g << 8) | b;
  let c = interned.get(k);
  if (!c) interned.set(k, (c = [r, g, b]));
  return c;
};

/** `c` itself when `t <= 0`, `target` itself when `t >= 1`, else an interned blend (t rounded to 1/16). */
export function tone(c: RGB, target: RGB, t: number): RGB {
  const q = Math.round(t * 16);
  if (q <= 0) return c;
  if (q >= 16) return target;
  const u = q / 16;
  return intern(Math.round(c[0] + (target[0] - c[0]) * u), Math.round(c[1] + (target[1] - c[1]) * u), Math.round(c[2] + (target[2] - c[2]) * u));
}

// ---------------------------------------------------------------- trees

/** Tree species tones [rim, canopy, crown, lit] in full summer leaf: oak (most), a paler poplar/birch, a dark elm. */
const SPECIES: readonly Tones[] = [
  [rgb(0x33452d), rgb(0x35482e), rgb(0x40573a), rgb(0x4e6843)],
  [rgb(0x46593a), rgb(0x4a5e3d), rgb(0x566e45), rgb(0x6a8252)],
  [rgb(0x293a27), rgb(0x293c28), rgb(0x324a31), rgb(0x3d5a3a)],
];
const BUD = rgb(0x8fa65a); // pale spring green
const AUTUMN: readonly RGB[] = [rgb(0xc9a93a), rgb(0xb07a2c), rgb(0x8e4a26)]; // yellow, ochre, russet
/** Days a species' leafing and colouring runs after (+) or before (-) the average tree: oak late, poplar/birch early, elm average. */
const SPECIES_OFFSET = [6, -6, 0] as const;

export type LeafCover = { cover: number; autumn: number; bud: number };

/**
 * One tree's leaf state on the look's date. `treeId` is an integer identifying the tree (e.g. its crown cell).
 * Each tree leafs ±3 days around its species' offset, so a wood does not turn on a single day.
 */
export function leafCover(species: number, treeId: number): LeafCover {
  const off = (SPECIES_OFFSET[species] ?? 0) + (hash(530, treeId | 0, 0) * 2 - 1) * 3;
  const { leafDays, fallDays } = look.s;
  const c = smooth((leafDays - off) / 18);
  return {
    cover: c * (1 - smooth((fallDays - 14 - off) / 36)),
    autumn: smooth((fallDays - off) / 20),
    bud: 4 * c * (1 - c),
  };
}

/**
 * A species' tones tinted for the season: pale green while budding, then yellow, ochre or russet (`pick`, 0-2, one
 * per tree) in autumn. Without `lc` the look's average state is used. At MAY_LOOK this is the summer table itself.
 */
export function crowns(species: number, lc: Pick<LeafCover, 'bud' | 'autumn'> = { bud: look.s.budding, autumn: look.s.autumnColour }, pick = 0): Tones {
  const bud = Math.round(Math.min(1, lc.bud) * 8);
  const aut = Math.round(Math.min(1, lc.autumn) * 16);
  const base = SPECIES[species] ?? SPECIES[0];
  if (bud <= 0 && aut <= 0) return base;
  const key = species + 3 * (bud + 9 * (aut + 17 * pick));
  let t = crownCache.get(key);
  if (!t) {
    const to = AUTUMN[pick % 3];
    const f = (c: RGB) => tone(tone(c, BUD, (bud / 8) * 0.7), to, (aut / 16) * 0.85);
    crownCache.set(key, (t = [f(base[0]), f(base[1]), f(base[2]), f(base[3])]));
  }
  return t;
}

// ---------------------------------------------------------------- fields and grass

const EARTH = [rgb(0x6a5538), rgb(0x584530)] as const;
const RIPE = [rgb(0xc8a84a), rgb(0xb8963e)] as const;
const STUBBLE = [rgb(0xa8955a), rgb(0x9a8650)] as const;
/** Today's crop colours (stage 2), by CROP_NAMES index. Meadow, rough grass and pasture follow grassTones, not stages. */
const CROP_GREEN: readonly Pair[] = [
  [rgb(0x6a5538), rgb(0x584530)],
  [rgb(0x5b6734), rgb(0x4e5a2d)],
  [rgb(0x6c763e), rgb(0x7f8449)],
  [rgb(0x8c7f52), rgb(0x7b6f47)],
  [rgb(0x4f5a2e), rgb(0x5d6936)],
  [rgb(0xc4b03a), rgb(0xa99a36)],
  [rgb(0x5a6a38), rgb(0xa86e80)],
  [rgb(0x64785a), rgb(0x587050)],
];
const GRASS = new Set([2, 3, 4]);

/**
 * A crop's two field colours at its growth stage (0 bare earth, 1 blades, 2 green as today, 3 golden ripe, 4 stubble;
 * continuous). The ploughed field is always earth. At stage 2 this is the crop's own table entry.
 */
export function cropTones(cropIndex: number): Pair {
  const green = CROP_GREEN[cropIndex];
  if (!green || cropIndex === 0 || GRASS.has(cropIndex)) return green;
  const stage = Math.min(4, Math.max(0, look.s.cropStages[CROP_NAMES[cropIndex]]));
  const q = Math.round(stage * 16);
  if (q === 32) return green;
  let p = cropCache.get(cropIndex * 100 + q);
  if (!p) {
    const i = Math.min(3, Math.floor(q / 16));
    const t = (q - i * 16) / 16;
    const at = (k: 0 | 1, s: number): RGB => (s === 0 ? EARTH[k] : s === 1 ? tone(EARTH[k], green[k], 0.55) : s === 2 ? green[k] : s === 3 ? RIPE[k] : STUBBLE[k]);
    cropCache.set(cropIndex * 100 + q, (p = [tone(at(0, i), at(0, i + 1), t), tone(at(1, i), at(1, i + 1), t)]));
  }
  return p;
}

const WINTER_GRASS: Pair = [rgb(0x73694a), rgb(0x6a6044)]; // dormant olive-brown
/** Grass colours `a`, `b` faded toward winter olive-brown as `grassGreen` falls. At grassGreen 1 they come back unchanged. */
export function grassTones(a: RGB, b: RGB): Pair {
  const hit = grassCache.get(a);
  if (hit && hit.b === b) return hit.p;
  const t = 1 - look.s.grassGreen;
  const p: Pair = [tone(a, WINTER_GRASS[0], t), tone(b, WINTER_GRASS[1], t)];
  grassCache.set(a, { b, p });
  return p;
}

// ---------------------------------------------------------------- ground-state overlay

/** What a pixel is, for the ground states: open ground, worn earth, lake water, anything standing up, or a trench/crater floor. */
export type Surface = 'field' | 'dirt' | 'water' | 'raised' | 'trench';

const RIME = rgb(0xd3dad8);
const SNOW = [rgb(0xeef1f2), rgb(0xd9e0e6), rgb(0xbac6d2)] as const; // white, pale, blue-grey (edges and shade)
const ICE = [rgb(0xd2dadd), rgb(0xb6c2c9), rgb(0x8d9ea9)] as const; // pale grey-white, blue-grey, crack
const TURBID = rgb(0x5d5438);
const WET_DIRT = rgb(0x2f261b);
const WET_TRENCH = rgb(0x3a3024);

// Registered by colour identity (see surfaceOf). Built on first use: ground.ts and military.ts import this module,
// so their constants do not exist yet while this one loads.
let kinds: Map<RGB, Surface> | undefined;
let raisedSnow: Map<RGB, number> | undefined;
function tables() {
  if (kinds) return { kinds, raisedSnow: raisedSnow! };
  kinds = new Map<RGB, Surface>();
  raisedSnow = new Map<RGB, number>();
  const set = (s: Surface, ...cs: (RGB | readonly RGB[])[]) => {
    for (const c of cs) for (const t of Array.isArray(c[0]) ? (c as readonly RGB[]) : [c as RGB]) kinds!.set(t, s);
  };
  set('dirt', DIRT.dry, DIRT.worn, DIRT.rut, SHORE.mud, M.mud, M.clod, M.track, M.boards, YARD.paving, YARD.dung); // paved apron and dung heap wet like the yard (12.3)
  set('water', WATER.deep, WATER.shallow);
  set('trench', M.dugout, M.bowl, M.relicFloor, WATER.pool);
  // Snow share on standing works: sandbags and spoil hold it; wire and pickets barely do (they take rime).
  for (const [c, k] of [[M.bags, 0.85], [M.earthwork, 0.9], [M.rim, 0.9], [M.wire, 0.1], [M.post, 0.15]] as [RGB | readonly RGB[], number][]) {
    for (const t of Array.isArray(c[0]) ? (c as readonly RGB[]) : [c as RGB]) {
      kinds.set(t, 'raised');
      raisedSnow.set(t, k);
    }
  }
  return { kinds, raisedSnow };
}

/**
 * Surface class of a pixel from its colour identity and height: registered colours first, else `raised` when it
 * stands up (h > 0), else `field`.
 * ponytail: a colour added later is `field`/`raised` until registered above; if roofs or works need finer rules, have the layer tag its stamp.
 */
export function surfaceOf(c: RGB, h: number): Surface {
  return tables().kinds.get(c) ?? (h > 0 ? 'raised' : 'field');
}

/** Share of a snow-holding roof/top that is white: tile, thatch, slate. Roof arrays are not exported, so by hue; the lighter (sunny) tone melts first. */
function roofSnow(c: RGB): number {
  const [r, g, b] = c;
  const sum = r + g + b;
  if (g > r && g >= b) return 0.25; // vegetation (hedge, crown)
  if (r - g > 30) return sum < 310 ? 0.7 : 0.55; // tile
  if (Math.max(r, g, b) - Math.min(r, g, b) <= 14) return sum < 235 ? 0.6 : 0.45; // slate
  return sum < 350 ? 0.9 : 0.7; // thatch and other brown tops
}

/** Is `c` one of the ice tones (for the glint rule in groundChunk). */
export const isIce = (c: RGB): boolean => c === ICE[0] || c === ICE[1] || c === ICE[2];

const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Share of low-lying ground that is flooded: pure, rising with `standingWater` and `wetness` (0 = high, 1 = a lake's edge). */
export const floodShare = (standingWater: number, wetness: number): number => clamp01(standingWater * wetness);

/** The lake field of ground.ts's wetness, without the front's clearance (not exported there): how low-lying a spot is, 0 to 1. */
const lowness = (seed: number, x: number, y: number) => clamp01((fbm(seed + 10, x / 900, y / 900, 4) - 0.5) * 1.39 + 0.5);

const pickTone = <T>(list: readonly T[], v: number): T => list[Math.min(list.length - 1, Math.floor(v * list.length))];
const pool = (x: number, y: number): RGB => WATER.pool[bayer(x, y) > 0.5 ? 1 : 0];

/** Ice over a water-like pixel: pale grey-white, blue-grey patches, cracks; `ice` and a little snow dusting raise the whiteness. */
function iceAt(seed: number, x: number, y: number, ice: number, snow: number): RGB {
  const crack = Math.abs(valueNoise(seed + 547, x / 9, y / 9) - 0.5) < 0.012 + 0.02 * ice;
  if (crack) return ICE[2];
  const v = valueNoise(seed + 548, x / 5, y / 5) * 0.7 + bayer(x, y) * 0.3;
  return v < 0.25 + 0.5 * Math.max(ice, snow) ? ICE[0] : ICE[1];
}

/** Flooded? A 12-px cell draw against floodShare, edged by fine noise. Monotone in `standingWater`. */
const flooded = (seed: number, x: number, y: number, share: number): boolean =>
  hash(seed + 550, Math.floor(x / 12), Math.floor(y / 12)) * 0.8 + valueNoise(seed + 551, x / 5, y / 5) * 0.2 < share;

/**
 * The ground states (snow, frost, mud, standing water, ice) on one finished pixel colour `c` of height `h` and surface `kind`.
 * A post-pass: returns `c` itself, untouched, when nothing is above 0.05 (always so at MAY_LOOK) or on a dry summer front.
 */
export function overlay(seed: number, x: number, y: number, c: RGB, h: number, kind: Surface = surfaceOf(c, h)): RGB {
  const { snow, frost, mud, standingWater: sw, ice, waterLevel, foliage } = look.s;
  if (snow <= 0.05 && frost <= 0.05 && mud <= 0.05 && sw <= 0.05 && ice <= 0.05 && waterLevel <= 0.05) return c;
  if (mud < 0.1 && foliage > 0.7) return c; // a summer front looks as it does today (13.6)

  const wet = lowness(seed, x, y);
  const isPool = WATER.pool.includes(c);

  if (kind === 'water') {
    // Frozen skin from the shore inward: the shallow band first, the deep middle last and never wholly (11.3).
    if (ice > 0.3) {
      const deep = c === WATER.deep;
      const edge = valueNoise(seed + 549, x / 6, y / 6);
      const cover = deep ? Math.min(0.85, (ice - 0.3) / 0.7) : Math.min(1, 0.4 + ice);
      if (edge < cover) return iceAt(seed, x, y, ice, snow);
    }
    const t = Math.max(mud, waterLevel);
    return t > 0.05 ? tone(c, TURBID, t * 0.5) : c;
  }

  if (kind === 'trench') {
    if (c === M.dugout) return c; // dugout mouths stay dark (13.3)
    if (isPool || (sw > 0.05 && flooded(seed, x, y, floodShare(sw, 0.35 + 0.65 * wet)))) return ice > 0.05 ? iceAt(seed, x, y, ice, snow) : isPool ? c : pool(x, y);
    return mud > 0.05 ? tone(c, WET_TRENCH, mud * 0.5) : c;
  }

  // A fine-patched noise coverage: the covered set only grows with `snow` (the same field against a rising threshold).
  const shade = kind === 'raised' ? 1 : (h > 0 ? 1 : 0) + fbm(seed + 542, x / 70, y / 70, 2) * 0.5;
  const shelter = clamp01(shade);
  // The raw field is near-normal (mean 0.5, sd 0.125); a logistic CDF makes it ~uniform, so a threshold of `snow` covers ~`snow` of open ground.
  const raw = clamp01(fbm(seed + 540, x / 40, y / 40, 3) * 0.7 + valueNoise(seed + 541, x / 5, y / 5) * 0.3 + (bayer(x, y) - 0.5) * 0.15);
  const patch = 1 / (1 + Math.exp(-13.6 * (raw - 0.5))); // 1.702 / 0.125

  if (kind === 'dirt') {
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    if (sw > 0.05 && valueNoise(seed + 545, x / 4, y / 4) < sw * 0.35) return ice > 0.05 ? iceAt(seed, x, y, ice, snow) : pool(x, y);
    if (snow > 0.05 && snow / 5 + 0.1 * shelter > patch) return tone(c, intern(clampB(lum - 4), clampB(lum), clampB(lum + 6)), 0.5); // dark features stay dark: a cool dusting at the pixel's own luminance, a fifth of the field rate (10.3)
    if (mud > 0.05) {
      const rut = valueNoise(seed + 544, x / 2, y / 9) < mud * 0.3;
      return rut ? tone(DIRT.rut, WET_DIRT, mud * 0.5) : tone(c, WET_DIRT, mud * 0.45);
    }
    if (frost > 0.05 && snow < 0.3 && hash(seed + 543, x, y) < frost * 0.3) return tone(c, RIME, 0.45);
    return c;
  }

  if (kind === 'raised') {
    const { raisedSnow: held } = tables();
    if (snow > 0.05) {
      const share = snow * (held.get(c) ?? roofSnow(c));
      if (share > patch * 0.8 + 0.1 * bayer(x, y)) return SNOW[share > patch + 0.12 ? 0 : 1];
    }
    if (frost > 0.05 && snow < 0.3 && hash(seed + 543, x, y) < frost * (0.45 + 0.4 * shelter)) return tone(c, RIME, 0.55);
    return c;
  }

  // field: open ground, crops, grass, forest floor
  if (sw > 0.05 && wet > 0.45 && flooded(seed, x, y, floodShare(sw, (wet - 0.45) / 0.55))) return ice > 0.05 ? iceAt(seed, x, y, ice, snow) : pool(x, y);
  if (snow > 0.05) {
    const edge = snow + 0.1 * shelter - patch;
    if (edge > 0) return pickTone(SNOW, edge < 0.06 ? 0.9 : valueNoise(seed + 546, x / 4, y / 4) * 0.5);
  }
  if (frost > 0.05 && snow < 0.3 && hash(seed + 543, x, y) < frost * (0.2 + 0.5 * shelter)) return tone(c, RIME, 0.5);
  return c;
}
