// What a season looks like on the ground: the per-request look, tone families and per-tree leaf state.
// The only world/ module that knows about seasons. Every colour here eases with the date: tones are blended
// in 1/32 steps, and each tree, field and hedge runs a few days early or late, so no change lands everywhere
// on one day.
//
// Per request, generateTile calls setLook() once (like `DEV` in settings.ts). Workers handle one request
// at a time, so a module-level look is safe; tests that need another look use withLook().
// Colours and day offsets are tuning values, [VERIFY] against northern-France sources.

import { bayer, fbm, hash, valueNoise } from '../core/noise.ts';
import { CROP_NAMES, CROP_SPREAD, MAY_LOOK, type SeasonState } from '../sim/seasons.ts';
import { snowLie } from './ground.ts';
import { DIRT, SHORE, WATER, type RGB } from './palette.ts';
import { FRESH, M } from './military.ts';
import { YARD } from './structures.ts';

type Tones = readonly [RGB, RGB, RGB, RGB];
type Pair = readonly [RGB, RGB];

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The look for the tile being generated. Read by ground.ts, structures.ts and military.ts. */
export const look: { s: SeasonState } = { s: MAY_LOOK };

let crownCache = new Map<number, Tones>();
let cropCache = new Map<number, Pair>();
let grassCache = new Map<number, Pair>();

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

const STEPS = 32;
const interned = new Map<number, RGB>(); // bounded: a small palette times STEPS blend steps
const intern = (r: number, g: number, b: number): RGB => {
  const k = (r << 16) | (g << 8) | b;
  let c = interned.get(k);
  if (!c) interned.set(k, (c = [r, g, b]));
  return c;
};

/** `c` itself when `t <= 0`, `target` itself when `t >= 1`, else an interned blend (t rounded to 1/32). */
export function tone(c: RGB, target: RGB, t: number): RGB {
  const q = Math.round(t * STEPS);
  if (q <= 0) return c;
  if (q >= STEPS) return target;
  const u = q / STEPS;
  return intern(Math.round(c[0] + (target[0] - c[0]) * u), Math.round(c[1] + (target[1] - c[1]) * u), Math.round(c[2] + (target[2] - c[2]) * u));
}

/** Pick along a list of colours, blending between neighbours (v in 0-1). */
function ramp(list: readonly RGB[], v: number): RGB {
  const f = clamp01(v) * (list.length - 1);
  const i = Math.min(list.length - 2, Math.floor(f));
  return tone(list[i], list[i + 1], f - i);
}

// ---------------------------------------------------------------- trees

/** Tree species tones [rim, canopy, crown, lit] in full summer leaf: oak (most), a paler poplar/birch, a dark elm. */
const SPECIES: readonly Tones[] = [
  [rgb(0x33452d), rgb(0x35482e), rgb(0x40573a), rgb(0x4e6843)],
  [rgb(0x46593a), rgb(0x4a5e3d), rgb(0x566e45), rgb(0x6a8252)],
  [rgb(0x293a27), rgb(0x293c28), rgb(0x324a31), rgb(0x3d5a3a)],
];
const BUD = rgb(0x9cb062); // pale yellow-green of new leaves
const WARM = rgb(0x6a7a36); // a yellower green, for tree-to-tree variety
const COOL = rgb(0x2c4a3e); // a bluer green
/** Autumn colours, from a late yellow-green through yellow, gold, orange and red to russet; each tree takes its own point. */
const AUTUMN: readonly RGB[] = [rgb(0x9a9c3e), rgb(0xc9a93a), rgb(0xd09a32), rgb(0xc47a2c), rgb(0xb05a28), rgb(0x963c26), rgb(0x8e4a26)];
/** Where along AUTUMN each species may land: poplar/birch stay yellow, elm yellow to ochre, oak anywhere into the reds. */
const AUTUMN_RANGE = [[0.15, 1], [0, 0.35], [0.05, 0.55]] as const;
const DEAD_LEAF = rgb(0x6e5232); // every leaf ends brown
/** Crown tones [rim, canopy, crown, lit] for dead brown leaves, and the shade a turning crown keeps at its rim. */
const DEAD_CROWN = [rgb(0x4a3826), rgb(0x54402a), rgb(0x5e472e), rgb(0x6a5236)] as const;
const AUTUMN_SHADE = [rgb(0x3a2a1c), rgb(0x4a3624), rgb(0x8a6a3a), rgb(0xd8c070)] as const;
/** Days a species' leafing and colouring runs after (+) or before (-) the average tree: oak late, poplar/birch early, elm average. */
const SPECIES_OFFSET = [6, -6, 0] as const;

/** Bare trees seen from above: trunk, limbs and the haze of twigs, per tree a warmer or greyer bark. */
export const BARK = { trunk: rgb(0x2b2620), limb: [rgb(0x4a3f33), rgb(0x55493b), rgb(0x433c35)], twig: [rgb(0x5d5244), rgb(0x675c4c), rgb(0x57524a)] } as const;

/**
 * One tree's leaf state on the look's date. `treeId` is an integer identifying the tree (e.g. its crown cell).
 * `cover` 0-1 is how much of the crown is in leaf; `autumn` 0 green, 1 at the tree's own autumn colour, 2 dead brown;
 * `bud` 0-1 the pale green of new leaves; `hue` the tree's point along AUTUMN; `vary` -1..1 a small warm/cool shift.
 * Each tree leafs over 3-5 weeks within ±9 days of its species, and turns over 5-9 weeks from early September.
 */
export type LeafCover = { cover: number; autumn: number; bud: number; hue: number; vary: number };

export function leafCover(species: number, treeId: number): LeafCover {
  const id = treeId | 0;
  const k = (n: number) => hash(530 + n, id, 0);
  const sp = SPECIES_OFFSET[species] ?? 0;
  const { leafDays, fallDays } = look.s;
  // Spring: bud burst, leaves fill out, and stay pale a few weeks before deepening.
  const sOff = sp * 1.3 + (k(0) * 2 - 1) * 9;
  const sDur = 20 + k(1) * 14;
  const spring = smooth((leafDays - sOff) / sDur);
  const bud = spring > 0 ? 1 - smooth((leafDays - sOff - sDur * 0.3) / 28) : 0;
  // Autumn: this year's (fallDays counts to the coming one, so in winter count from the last).
  const aOff = -18 + sp * 1.5 + (k(2) * 2 - 1) * 14;
  const d1 = 30 + k(3) * 30; // green to its colour, slowly
  const d2 = 14 + k(4) * 18; // its colour to brown
  const t = (fallDays < -60 ? fallDays + 365 : fallDays) - aOff;
  const autumn = t <= 0 ? 0 : t < d1 ? smooth(t / d1) : 1 + smooth((t - d1) / d2);
  const drop = smooth((t - d1 * 0.7) / (d1 * 0.3 + d2 + 14));
  const marcescent = species === 0 && k(5) < 0.25 ? 0.4 : 0; // some oaks hold their dead leaves all winter
  const range = AUTUMN_RANGE[species] ?? AUTUMN_RANGE[0];
  const hue = range[0] + (range[1] - range[0]) * k(6);
  const vary = k(7) * 2 - 1;
  if (t > 0 && fallDays >= -60) return { cover: Math.max(1 - drop, marcescent), autumn, bud: 0, hue, vary }; // autumn under way
  // Winter into spring: last year's leaves (brown, if any held) give way to the new ones.
  const old = t > 0 ? Math.max(1 - drop, marcescent) * (1 - spring) : 0;
  return { cover: Math.max(spring, old), autumn: old > spring ? 2 : 0, bud, hue, vary };
}

/**
 * A species' crown tones on a tree's leaf state: pale green while budding, the tree's own warm/cool shift,
 * then its autumn colour and finally brown. In full summer leaf this is the summer table, shifted a touch per tree.
 */
export function crowns(species: number, lc: Pick<LeafCover, 'bud' | 'autumn' | 'hue' | 'vary'> = { bud: look.s.budding, autumn: look.s.autumnColour, hue: 0.4, vary: 0 }): Tones {
  const bud = Math.round(clamp01(lc.bud) * 16);
  const aut = Math.round(Math.min(2, Math.max(0, lc.autumn)) * 24);
  const hue = Math.round(clamp01(lc.hue) * 12);
  const vary = Math.round(Math.max(-1, Math.min(1, lc.vary)) * 2) + 2;
  const key = species + 3 * (bud + 17 * (aut + 49 * (hue + 13 * vary)));
  let t = crownCache.get(key);
  if (!t) {
    const base = SPECIES[species] ?? SPECIES[0];
    const to = ramp(AUTUMN, hue / 12);
    const shift = vary > 2 ? WARM : COOL;
    const a = aut / 24;
    const f = (c: RGB, i: number) => {
      let g = tone(c, shift, (Math.abs(vary - 2) / 2) * 0.14);
      g = tone(g, BUD, (bud / 16) * 0.7);
      g = tone(g, to, Math.min(1, a) * 0.9);
      g = tone(g, AUTUMN_SHADE[i], Math.min(1, a) * 0.25); // keep the crown's light and shade while it turns
      return a <= 1 ? g : tone(g, DEAD_CROWN[i], a - 1);
    };
    crownCache.set(key, (t = [f(base[0], 0), f(base[1], 1), f(base[2], 2), f(base[3], 3)]));
  }
  return t;
}

/** Any leafy green (orchard trees, willows, hop bines, garden rows) eased the same way as the trees, by the look's averages. */
export function leafTone(c: RGB, lc: Pick<LeafCover, 'bud' | 'autumn' | 'hue'> = { bud: look.s.budding, autumn: look.s.autumnColour, hue: 0.3 }): RGB {
  const g = tone(c, BUD, clamp01(lc.bud) * 0.6);
  const a = Math.min(2, Math.max(0, lc.autumn));
  const to = ramp(AUTUMN, lc.hue);
  return a <= 1 ? tone(g, to, a * 0.85) : tone(tone(g, to, 0.85), DEAD_LEAF, (a - 1) * 0.8);
}

// ---------------------------------------------------------------- woods, scrub and hedges

const HEDGE_BARE = [rgb(0x463c31), rgb(0x56493a)] as const; // dark and light bare hedges: twigs and stems
const SCRUB_BARE = rgb(0x5a4934); // dead bracken and bramble
const AUTUMN_SCRUB = rgb(0x8a6a34);
const FLOOR_LITTER = [rgb(0x3a2e20), rgb(0x55412a)] as const; // leaf litter: deep and lit

/** A hedge's tone on the date: green in leaf, ochre in autumn, brown twigs in winter (`light` picks the bare tone). */
export function hedgeTone(c: RGB, light: boolean): RGB {
  const { foliage, autumnColour } = look.s;
  return tone(tone(c, AUTUMN_SCRUB, autumnColour * 0.4), HEDGE_BARE[light ? 1 : 0], (1 - foliage) * 0.8);
}

/** Scrub, bramble and bracken at a wood's edge and under copses: they keep a few leaves but brown off in winter. */
export function scrubTone(c: RGB): RGB {
  const { foliage, autumnColour } = look.s;
  return tone(tone(c, AUTUMN_SCRUB, autumnColour * 0.5), SCRUB_BARE, (1 - foliage) * 0.75);
}

/** The forest floor: dark green under the summer canopy, carpeted in brown litter from leaf fall until spring. */
export function floorTone(c: RGB, lit: boolean): RGB {
  return tone(c, FLOOR_LITTER[lit ? 1 : 0], 1 - look.s.foliage);
}

/** Fallen leaves on the ground, 0-1: from early October, most in November, rotted into the floor by January. */
export function leafLitter(): number {
  const f = look.s.fallDays < -60 ? look.s.fallDays + 365 : look.s.fallDays;
  return smooth((f - 5) / 30) * (1 - smooth((f - 65) / 35));
}

/** One fallen leaf's colour: bright while fresh, browner as the season goes on. */
export function fallenLeaf(v: number): RGB {
  const f = look.s.fallDays < -60 ? look.s.fallDays + 365 : look.s.fallDays;
  return tone(ramp(AUTUMN, v), DEAD_LEAF, smooth((f - 20) / 50));
}

// ---------------------------------------------------------------- fields and grass

/** Field colour families, three variants each so neighbouring fields of one crop differ: bare earth, ripe, stubble. */
const EARTH: readonly Pair[] = [[rgb(0x6a5538), rgb(0x584530)], [rgb(0x5e4a32), rgb(0x4e3d2a)], [rgb(0x73603f), rgb(0x615036)]];
const RIPE: readonly Pair[] = [[rgb(0xc8a84a), rgb(0xb8963e)], [rgb(0xd0b45a), rgb(0xbea24c)], [rgb(0xb8903a), rgb(0xa67e32)]];
const STUBBLE: readonly Pair[] = [[rgb(0xa8955a), rgb(0x9a8650)], [rgb(0xb4a066), rgb(0xa69258)], [rgb(0x9c8452), rgb(0x8e784a)]];
/** Dormant winter grass and crops: straw-brown, an orange-brown, a grey-brown. */
const DORMANT: readonly Pair[] = [[rgb(0x7d6a44), rgb(0x6f5d3b)], [rgb(0x86683c), rgb(0x775a34)], [rgb(0x6f6450), rgb(0x645a46)]];
const PARCHED: Pair = [rgb(0x9a9560), rgb(0x8c8656)]; // late-summer grass, pale and dry
const LUSH: Pair = [rgb(0x4a5a2a), rgb(0x56682f)]; // June grass, a deeper green
/** Today's crop colours (stage 2), by CROP_NAMES index. Meadow, rough grass and pasture follow grassTones, not stages. */
const CROP_GREEN: readonly Pair[] = [
  [rgb(0x6a5538), rgb(0x584530)],
  [rgb(0x5b6734), rgb(0x4e5a2d)],
  [rgb(0x6c763e), rgb(0x7f8449)],
  [rgb(0x8c7f52), rgb(0x7b6f47)],
  [rgb(0x4f5a2e), rgb(0x5d6936)],
  [rgb(0x56683a), rgb(0x4a5c32)], // colza leaves (its flowers: COLZA_FLOWER)
  [rgb(0x5a6a38), rgb(0xa86e80)],
  [rgb(0x64785a), rgb(0x587050)],
];
export const COLZA_FLOWER: Pair = [rgb(0xc4b03a), rgb(0xa99a36)];
const GRASS = new Set([2, 3, 4]);

/** A crop's stage for one field: `u` 0-1 places the field along the look's CROP_SPREAD (early to late). */
function fieldStage(cropIndex: number, u: number): number {
  const r = look.s.cropRange[CROP_NAMES[cropIndex]];
  const f = clamp01(u) * (CROP_SPREAD.length - 1);
  const i = Math.min(CROP_SPREAD.length - 2, Math.floor(f));
  return r[i] + (r[i + 1] - r[i]) * (f - i);
}

/**
 * A crop's two field colours for one field: its growth stage (0 bare earth, 1 blades, 2 green, 3 golden ripe,
 * 4 stubble; continuous) at the field's own point in the spread `u`, its colour variant `v` (0-2), and green crops
 * dulled toward dormant brown in winter.
 */
export function cropTones(cropIndex: number, u = 0.5, v = 0): Pair {
  const green = CROP_GREEN[cropIndex];
  if (!green || GRASS.has(cropIndex)) return green;
  const stage = cropIndex === 0 ? 0 : Math.min(4, Math.max(0, fieldStage(cropIndex, u)));
  const q = Math.round(stage * 32);
  const key = (cropIndex * 200 + q) * 4 + v;
  let p = cropCache.get(key);
  if (!p) {
    const i = Math.min(3, Math.floor(q / 32));
    const t = (q - i * 32) / 32;
    const at = (k: 0 | 1, s: number): RGB => (s === 0 ? EARTH[v][k] : s === 1 ? tone(EARTH[v][k], green[k], 0.55) : s === 2 ? green[k] : s === 3 ? RIPE[v][k] : STUBBLE[v][k]);
    const greenness = q <= 64 ? Math.min(1, q / 32) : Math.max(0, 3 - q / 32);
    const dull = (1 - look.s.grassGreen) * 0.75 * greenness;
    const c = (k: 0 | 1) => tone(tone(at(k, i), at(k, i + 1), t), DORMANT[v][k], dull);
    cropCache.set(key, (p = [c(0), c(1)]));
  }
  return p;
}

/** Grass colours `a`, `b` for the date: deeper in June, pale in a dry September, dormant straw in winter (variant `v`). */
export function grassTones(a: RGB, b: RGB, v = 0): Pair {
  const key = (((a[0] << 16) | (a[1] << 8) | a[2]) * 4 + v) * 2 + (b[1] & 1);
  const hit = grassCache.get(key);
  if (hit) return hit;
  const { grassGreen, grassDry } = look.s;
  const to = grassDry < 0 ? LUSH : PARCHED;
  const k = grassDry < 0 ? -grassDry * 0.35 : grassDry * 0.55;
  const p: Pair = [tone(tone(a, to[0], k), DORMANT[v][0], 1 - grassGreen), tone(tone(b, to[1], k), DORMANT[v][1], 1 - grassGreen)];
  grassCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------- ground-state overlay

/** What a pixel is, for the ground states: open ground, worn earth, lake water, anything standing up, or a trench/crater floor. */
export type Surface = 'field' | 'dirt' | 'water' | 'raised' | 'trench';

const RIME = rgb(0xc9d0d0);
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

/** Every frozen-water tone handed out (ICE, and the frozen blues of a lake), for the glint rule in groundChunk. */
const iceTones = new Set<RGB>();
/** Is `c` one of the ice tones (for the glint rule in groundChunk). */
export const isIce = (c: RGB): boolean => iceTones.has(c);
const frozen = (c: RGB): RGB => (iceTones.add(c), c);
const FROZEN_BLUE = rgb(0x8aa6b4); // a lake under clear ice: a paler, greyer blue

const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Share of low-lying trench floor that is flooded: pure, rising with `standingWater` and `wetness` (0 = high, 1 = a lake's edge). */
export const floodShare = (standingWater: number, wetness: number): number => clamp01(standingWater * wetness);

/** The lake field of ground.ts's wetness, without the front's clearance (not exported there): how low-lying a spot is, 0 to 1. */
const lowness = (seed: number, x: number, y: number) => clamp01((fbm(seed + 10, x / 900, y / 900, 4) - 0.5) * 1.39 + 0.5);

const pool = (x: number, y: number): RGB => WATER.pool[bayer(x, y) > 0.5 ? 1 : 0];

/** Ice over a small water-like pixel (shell holes, pools): pale grey-white, cracked where it is thin. */
function iceAt(seed: number, x: number, y: number, ice: number, snow: number): RGB {
  if (Math.abs(valueNoise(seed + 547, x / 9, y / 9) - 0.5) < 0.01 * (1 - ice)) return frozen(ICE[2]);
  return frozen(bayer(x, y) < 0.3 + 0.5 * Math.max(ice, snow) ? ICE[0] : ICE[1]);
}

/** Flooded? A 12-px cell draw against floodShare, edged by fine noise. Monotone in `standingWater`. */
const flooded = (seed: number, x: number, y: number, share: number): boolean =>
  hash(seed + 550, Math.floor(x / 12), Math.floor(y / 12)) * 0.8 + valueNoise(seed + 551, x / 5, y / 5) * 0.2 < share;

/** Snow on open ground at a pixel where it lies `lie` (0-1, see snowLie): white where deep, blue-grey at the edges, or null. */
function snowOn(snow: number, lie: number, x: number, y: number): RGB | null {
  const edge = snow * 1.25 - (1 - lie); // covered once the snow is deep enough for this spot (about 1.25 × snow of open land); only grows with snow
  if (edge <= 0) return null;
  return edge < 0.05 ? SNOW[2] : edge < 0.12 || bayer(x, y) < 0.15 - edge ? SNOW[1] : SNOW[0];
}

/**
 * The ground states (snow, frost, mud, ice) on one finished pixel colour `c` of height `h` and surface `kind`.
 * `lee` 0-1: how sheltered the pixel is behind something standing upwind (snow drifts in there; see groundChunk);
 * `veg`: the pixel is a tree, hedge, scrub or reeds (they take hoarfrost; roofs and works do not).
 * `sun` 0-1: how much a roof slope faces south, into the sun (its snow goes first; see groundChunk).
 * A post-pass: returns `c` itself, untouched, when nothing is above 0.05 (always so at MAY_LOOK) or on a dry summer front.
 * Mud only darkens worn earth; open ground never floods (only trench floors and shell holes hold water).
 */
export function overlay(seed: number, x: number, y: number, c: RGB, h: number, kind: Surface = surfaceOf(c, h), lee = 0, veg = false, sun = 0): RGB {
  const { snow, frost, mud, standingWater: sw, ice, waterLevel, foliage } = look.s;
  if (snow <= 0.05 && frost <= 0.05 && mud <= 0.05 && sw <= 0.05 && ice <= 0.05 && waterLevel <= 0.05) return c;
  if (mud < 0.1 && foliage > 0.7 && snow <= 0.05 && frost <= 0.05) return c; // a summer front looks as it does today (13.6)

  const isPool = WATER.pool.includes(c);

  if (kind === 'water') {
    // A lake freezes white round its shallow rim first, then over the open water, which goes a paler blue (no
    // patches); snow on thick ice lies in broad sweeps, and a deep snow covers it all.
    if (ice > 0.25) {
      if (snow > 0.05 && ice > 0.5) {
        const drift = 0.14 * (valueNoise(seed + 612, x / 14, y / 14) - 0.5) + 0.08 * (valueNoise(seed + 613, x / 4, y / 4) - 0.5) + 0.04 * bayer(x, y);
        const s = snowOn(snow, 0.42 + drift + (c === WATER.shallow ? 0.35 : 0), x, y); // the rim first, then the whole sheet in soft-edged sweeps
        if (s) return s;
      }
      if (c === WATER.shallow) return frozen(ice > 0.4 ? ICE[0] : tone(c, ICE[1], ice / 0.4));
      return frozen(tone(c, FROZEN_BLUE, smooth((ice - 0.25) / 0.5) * 0.7));
    }
    const t = Math.max(mud, waterLevel);
    return t > 0.05 ? tone(c, TURBID, t * 0.2) : c;
  }

  // Snow lies where the ground holds it (snowLie) and, more, in the lee of anything standing.
  const lie = snow > 0.05 ? 1 - (1 - snowLie(seed, x, y)) * (1 - 0.85 * lee) : 0;
  // Frost: a fine grain of rime, thicker in the hollows and in shelter, never in blotches.
  const grain = hash(seed + 543, x, y) * 0.55 + valueNoise(seed + 552, x / 2.5, y / 2.5) * 0.45;
  const frosted = frost > 0.05 && snow < 0.3 && grain < frost * (veg ? 0.75 : 0.3 + 0.45 * lowness(seed, x, y) + 0.25 * lee);

  // Earth thrown up since the snow lies on top of it: shell holes and churned ground that stay dark (frost still takes it).
  if (FRESH.has(c)) return frosted ? tone(c, RIME, 0.3) : mud > 0.05 ? tone(c, WET_TRENCH, mud * 0.4) : c;

  if (kind === 'trench') {
    if (c === M.dugout) return c; // dugout mouths stay dark (13.3)
    const wet = lowness(seed, x, y);
    if (isPool || (sw > 0.05 && flooded(seed, x, y, floodShare(sw, 0.35 + 0.65 * wet)))) {
      if (ice > 0.05 && snow > 0.05) {
        const s = snowOn(snow, 0.5 + 0.5 * lee, x, y);
        if (s) return s;
      }
      return ice > 0.05 ? iceAt(seed, x, y, ice, snow) : isPool ? c : pool(x, y);
    }
    // Snow blows into the trenches and shell holes and fills them, deepest against the parapets.
    // The same depth model as the open ground, only more readily (a hole catches what blows over it).
    if (snow > 0.05) {
      const s = snowOn(snow, 1 - (1 - lie) * 0.2, x, y);
      if (s) return s === SNOW[0] && lee > 0.6 ? SNOW[1] : s === SNOW[2] ? SNOW[1] : s; // in the shadow under the parapet; a dusting reads as snow
    }
    if (frosted) return tone(c, RIME, 0.3);
    return mud > 0.05 ? tone(c, WET_TRENCH, mud * 0.5) : c;
  }

  if (kind === 'dirt') {
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const churned = c === M.clod || M.mud.includes(c);
    const trodden = M.boards.includes(c) || (churned && h === 0); // a trench's duckboards or mud floor: walked bare, like a path
    const pit = churned && h > 0 && h < 0.3; // a shell hole's pit: sunk, so it catches what blows over
    if (snow > 0.05 && !trodden && (pit || churned || h > 0 || lee > 0.25)) { // (dirt standing up is a trench's spoil, thrown up in the paths' colours)
      const s = snowOn(snow, pit ? 1 - (1 - lie) * 0.2 : lie, x, y); // drifted in against a wall, a hedge or a parapet; the shelled ground lies like open ground
      if (pit && s) return s === SNOW[2] ? SNOW[1] : s; // in the hole, a dusting reads as snow, not shade
      if (s) return s;
    }
    if (snow > 0.05 && snow / 4 > 1 - lie) return tone(c, intern(clampB(lum - 4), clampB(lum), clampB(lum + 6)), 0.5); // dark features stay dark: a cool dusting at the pixel's own luminance (10.3)
    if (mud > 0.05) {
      const rut = valueNoise(seed + 544, x / 2, y / 9) < mud * 0.3;
      return rut ? tone(DIRT.rut, WET_DIRT, mud * 0.5) : tone(c, WET_DIRT, mud * 0.45);
    }
    if (frosted) return tone(c, RIME, 0.35);
    return c;
  }

  if (kind === 'raised') {
    const { raisedSnow: held } = tables();
    if (snow > 0.05 && !veg && h <= 1.5) {
      const s = snowOn(snow, lie, x, y); // low banks, rims and spoil lie under the snow like the ground round them
      if (s) return s;
    }
    if (snow > 0.05) {
      const share = veg ? Math.min(0.55, snow * 1.1) : // trees keep their colour between the white patches, even in a deep snow
         held.has(c) ? Math.min(1, snow * 1.5 * held.get(c)!) : 1.6 * snow * roofSnow(c) * (1 - 0.6 * sun); // a roof's snow goes with the ground's, off the sunny (south) slope first // limbs and twigs catch even a light snow; the front's banks and bags are white once it is deep
      const roofTop = !veg && !held.has(c);
      const patch = roofTop ? 0.1 + 0.8 * valueNoise(seed + 541, x / 4, y / 4) : clamp01(valueNoise(seed + 541, x / 4, y / 4) * 0.7 + (1 - lee) * 0.3); // a roof melts to patches, not from its edges
      if (share > patch * 0.8 + 0.1 * bayer(x, y)) return SNOW[share > patch + 0.12 ? 0 : 1];
    }
    if (frosted && (veg || held.has(c))) return tone(c, RIME, veg ? 0.4 : 0.45); // hoarfrost on the trees and hedges, rime on the front's works; roofs keep their colour
    return c;
  }

  // field: open ground, crops, grass, forest floor
  if (snow > 0.05) {
    const s = snowOn(snow, lie, x, y);
    if (s) {
      // Never a flat sheet: tufts and furrows poke through, and the white swells in soft shade.
      if (s === SNOW[0] && valueNoise(seed + 620, x / 2.5, y / 2.5) > 0.7) return tone(c, SNOW[1], 0.5);
      return s === SNOW[0] && valueNoise(seed + 621, x / 7, y / 7) < 0.3 ? SNOW[1] : s;
    }
  }
  if (frosted) return tone(c, RIME, 0.4);
  return c;
}
