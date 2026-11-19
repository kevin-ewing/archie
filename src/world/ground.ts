// Ground from noise, seen from low altitude (a single field can fill much of the screen), in two levels:
//  1. Biomes from very large-scale noise: farmland, woods and lakes. Their borders blend like the clouds'
//     edges: frayed by fine noise and dithered, with scrub and forest floor bleeding between wood and field.
//  2. Detail within each biome: fields of different crops with patchy dirt margins and hedges; whole,
//     overlapping tree crowns of a few species; lake depth and shore. Plus a soft light/dark patchiness
//     across everything (`groundShade`) so no biome is one flat tone.
// Each world pixel also has a height (trees, hedges), used by the plane's cast shadow.
// Pure functions of (seed, world pixel); no DOM, so they're testable and reproducible.

import { bayer, cellular, fbm, hash, valueNoise } from '../core/noise.ts';
import { BLOOM_KINDS } from '../sim/seasons.ts';
import { frontClearance, frontsNear, nearest } from './fronts.ts';
import { BARK, COLZA_FLOWER, cropTones, crowns, fallenLeaf, floorTone, grassTones, hedgeTone, isIce, leafCover, leafLitter, look, overlay, scrubTone, tone } from './season.ts';
import { DIRT, rgb, SHORE, WATER, type RGB } from './palette.ts';
import { DEV } from './settings.ts';

export { DIRT, SHORE, WATER, type RGB };

export const CHUNK = 128; // world pixels per tile edge

const FLOOR = { deep: rgb(0x1f2c19), litter: rgb(0x2a3720) };
const SCRUB = [rgb(0x3b4a26), rgb(0x46552c), rgb(0x2f3d20)] as const;
// Tree species tones and crop colours live in world/season.ts (crowns, cropTones), season-tinted; so do the
// winter tones of the forest floor, scrub and hedges (floorTone, scrubTone, hedgeTone).
const STRAW = rgb(0x8a7d4e); // dead reeds
/** Hedgerows: dark (old blackthorn, holly) or light green (young hawthorn, hazel), in long runs of each. */
const HEDGE = { dark: [rgb(0x2c3a1b), rgb(0x3a4a23)], light: [rgb(0x40532a), rgb(0x506534)] } as const;

// Wildflowers of a Flanders May (pre-herbicide fields were full of them): poppies and cornflowers among
// the crops, buttercups, ox-eye daisies and red clover in the meadows, hawthorn ("may") blossom on the
// hedges, cow parsley along the margins, bluebells carpeting the woods.
// Flowers are rare finds: each kind blooms only in its own scattered regions a few kilometres apart
// (`bloom`), so a whole day's flying turns up a handful of poppy fields, bluebell woods and so on.
// How much each kind blooms on the date, and when crops ripen, comes from the look (world/season.ts) and
// the calendar tables in sim/climate.ts; the table here is the May picture.
export const FLOWER = {
  poppy: rgb(0xa8382a),
  cornflower: rgb(0x4d68b0),
  buttercup: rgb(0xd8c447),
  daisy: rgb(0xeae7db),
  clover: rgb(0xb4788c),
  hawthorn: rgb(0xe4e0d2),
  cowParsley: rgb(0xdcd9c8),
  bluebell: rgb(0x5b5c9e),
  bluebellLit: rgb(0x7072b6),
};

/** Kinds of bloom, each with its own rare regions. */
const BLOOM = { poppy: 0, cornflower: 1, buttercup: 2, daisy: 3, clover: 4, bluebell: 5, hawthorn: 6, cowParsley: 7, colza: 8 } as const;
/** How strongly a kind of flower blooms here, 0 (mostly) … 1, in rare patches roughly 3 km across. */
function bloom(seed: number, x: number, y: number, kind: number, rarity = 0.75): number {
  return smooth((valueNoise(seed + 80 + kind * 7, x / 3200, y / 3200) - rarity) / 0.1) * look.s.bloom[BLOOM_KINDS[kind]];
}

type Pattern = 'furrows' | 'rows' | 'hay' | 'grass' | 'flowerheads';
type Crop = { name: string; i: number; weight: number; pattern: Pattern; weeds?: boolean; flowers?: 'meadow' | 'pasture'; hay?: boolean }; // hay: mown for hay (some carry hay cocks)
/**
 * Field crops of 1910s Flanders: small mixed farms growing grain, colza (rapeseed, in yellow flower in May),
 * flax, red clover for fodder, with meadows and pasture for the dairy cows.
 */
const CROPS: readonly Crop[] = ([
  { name: 'ploughed', weight: 1.6, pattern: 'furrows' },
  { name: 'young wheat', weight: 2, pattern: 'rows', weeds: true },
  { name: 'meadow', weight: 2, pattern: 'grass', flowers: 'meadow', hay: true },
  { name: 'rough grass', weight: 1, pattern: 'hay', hay: true },
  { name: 'pasture', weight: 2, pattern: 'grass', flowers: 'pasture' },
  { name: 'colza in flower', weight: 0.25, pattern: 'rows', weeds: true },
  { name: 'red clover', weight: 0.2, pattern: 'flowerheads' },
  { name: 'young flax', weight: 0.6, pattern: 'rows', weeds: true },
] as Omit<Crop, 'i'>[]).map((c, i) => ({ ...c, i }));
const CROP_TOTAL = CROPS.reduce((t, c) => t + c.weight, 0);
const COLZA = CROPS[5];
/** A field's crop from its id in [0, 1), by weight. */
function cropOf(id: number): Crop {
  let t = id * CROP_TOTAL;
  for (const c of CROPS) if ((t -= c.weight) < 0) return c;
  return CROPS[CROPS.length - 1];
}
export const BASE = rgb(0x6c763e); // fallback fill where a tile isn't generated yet

/**
 * A field's own place in the season: `u` 0-1 how early or late it runs (sown, ripened, cut and ploughed on its own
 * days), `v` 0-2 which variant of its crop's colours it takes. Decided once per field, from its id.
 */
const fieldTiming = (seed: number, id: number) => {
  const k = Math.floor(id * 1e6);
  return { u: hash(seed + 52, k, 3), v: Math.floor(hash(seed + 53, k, 4) * 3) };
};
/** The crop's two colours on this date for one field (grass faded toward winter, crops by growth stage), remembered for the next pixel of the same field. */
let colourKey = NaN;
let colourLook: unknown;
let colourValue: readonly [RGB, RGB];
function colours(seed: number, crop: Crop, id: number): readonly [RGB, RGB] {
  if (id !== colourKey || colourLook !== look.s) {
    colourKey = id;
    colourLook = look.s;
    const { u, v } = fieldTiming(seed, id);
    if (crop.pattern === 'grass' || crop.pattern === 'hay') {
      const [a, b] = cropTones(crop.i);
      colourValue = grassTones(a, b, v);
    } else colourValue = cropTones(crop.i, u, v);
  }
  return colourValue;
}

const LAKE = 0.88; // wetness above this is water
const SHORE_W = 0.015; // wetness band below LAKE that is shoreline
const FIELD_SIZE = 420; // world px per field cell
const TREE_SIZE = 10; // world px per tree cell
export const HEIGHT = { tree: 12, crownBulge: 4, understory: 8, hedge: 4, scrub: 1.5, reeds: 1.5 };

const stretch = (v: number, k: number) => Math.min(1, Math.max(0, (v - 0.5) * k + 0.5));
const stripe = (s: number, w: number) => ((Math.floor(s / w) % 2) + 2) % 2 === 0;
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

// Lakes cover ~2.5% of the land and woods ~18% (the stretch factors set that: 1.7 and 2 gave ~6% and ~26%).
// Layer 2 of world generation: the landscape is shaped around the front plan (world/fronts.ts). Lakes,
// woods and copses are lowered by the front's clearance, so none forms in its trenches and no-man's land,
// though they may reach in a little at the back. (Nothing here depends on farms or the front's works.)
// (`clear` can be passed in when the caller already has it: one clearance lookup per pixel, not three.)
const wetness = (seed: number, x: number, y: number, clear = frontClearance(seed, x, y)) => stretch(fbm(seed + 10, x / 900, y / 900, 4), 1.39) - 0.6 * clear;
/** 0 = open country … 1 = deep forest, ramping over a wide band so woods fade out rather than stop. */
const woodDensity = (seed: number, x: number, y: number, clear = frontClearance(seed, x, y)) => smooth((stretch(fbm(seed + 20, x / 700, y / 700, 4), 1.41) - 0.68 - 0.5 * woodClear(clear)) / 0.13);
/** Woods and copses keep only out of the inner part of a front's clearance (lakes keep out of all of it):
 *  they may grow in well into its fade, close behind the trench lines. */
const woodClear = (clear: number) => smooth((clear - 0.3) / 0.7);
/** Glades: small clearings inside woods. > GLADE is open; trees thin out on the approach. */
const gladeValue = (seed: number, x: number, y: number) => stretch(fbm(seed + 23, x / 120, y / 120, 3), 2.2);
const GLADE = 0.88;

function fieldCell(seed: number, x: number, y: number) {
  // A large warp bends the borders; a small one makes neighbouring fields interlock raggedly.
  const wx = x + (valueNoise(seed + 30, x / 220, y / 220) - 0.5) * 110 + (valueNoise(seed + 43, x / 7, y / 7) - 0.5) * 10;
  const wy = y + (valueNoise(seed + 31, x / 220, y / 220) - 0.5) * 110 + (valueNoise(seed + 44, x / 7, y / 7) - 0.5) * 10;
  const cell = cellular(seed + 32, wx, wy, FIELD_SIZE);
  // Each field's own point (in warped space): anything decided once for a whole field is sampled there.
  return { ...cell, sx: wx - cell.dx, sy: wy - cell.dy, sx2: wx - cell.dx2, sy2: wy - cell.dy2 };
}

// --- Trees ---------------------------------------------------------------------------------------
// Whether a tree exists is decided once, at its centre, so a crown is always drawn whole: never sliced by
// a biome edge, a glade or a lake. Crowns overlap; their upper surface is visible, so a rim cannot cut through a neighbouring crown.

// Tree chances depend on the seed and the front plan (density, fronts on or off): the cache is for one world.
const cacheWorld = { seed: NaN, density: NaN, fronts: false };
const treeChanceCache = new Map<number, number>();

function treeChance(seed: number, i: number, j: number, cx: number, cy: number): number {
  const w = cacheWorld;
  if (seed !== w.seed || DEV.density !== w.density || DEV.fronts !== w.fronts || treeChanceCache.size > 400_000) {
    w.seed = seed;
    w.density = DEV.density;
    w.fronts = DEV.fronts;
    treeChanceCache.clear();
  }
  const key = i * 2_000_003 + j; // unique for |i|, |j| < 10⁶ cells (a 10,000 km world)
  let chance = treeChanceCache.get(key);
  if (chance === undefined) {
    const clear = frontClearance(seed, cx, cy);
    if (wetness(seed, cx, cy, clear) > LAKE - SHORE_W - 0.01) chance = 0; // keep crowns off the water
    else {
      // Trees come in groups, never scattered singly: at a wood's edge a clump noise decides where groups
      // reach out into the fields, and out in open farmland the only trees are the occasional copse.
      const dens = woodDensity(seed, cx, cy, clear) * (1 - smooth((gladeValue(seed, cx, cy) - (GLADE - 0.1)) / 0.12));
      const clump = valueNoise(seed + 48, cx / 35, cy / 35);
      chance = Math.max(smooth((dens * 1.2 + (clump - 0.5) * 0.8 - 0.35) / 0.25), copseChance(seed, cx, cy, clear)) * (1 - woodClear(clear)); // no clumps in a front's core
    }
    treeChanceCache.set(key, chance);
  }
  return chance;
}

/** Copses: rare, tight clumps of trees out in the fields (with scrub underneath). 0 … 1. */
const copseValue = (seed: number, x: number, y: number, clear = frontClearance(seed, x, y)) => valueNoise(seed + 49, x / 55, y / 55) - 0.1 * woodClear(clear);
const copseChance = (seed: number, x: number, y: number, clear = frontClearance(seed, x, y)) => smooth((copseValue(seed, x, y, clear) - 0.955) / 0.02);

export type Tree = { dx: number; dy: number; dist: number; r: number; species: number; id: number };

/** The topmost whole tree crown covering (x, y), if any. */
export function treeAt(seed: number, x: number, y: number): Tree | null {
  const ci = Math.floor(x / TREE_SIZE);
  const cj = Math.floor(y / TREE_SIZE);
  let best: Tree | null = null;
  let bestZ = -1;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const cx = (i + hash(seed + 24, i, j)) * TREE_SIZE;
      const cy = (j + hash(seed + 25, i, j)) * TREE_SIZE;
      const size = hash(seed + 26, i, j);
      const r = 4.2 + size * 2.6; // crown radius ≤ 6.8 < TREE_SIZE, so the 3×3 search sees every crown
      const dx = x - cx;
      const dy = y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq >= r * r) continue;
      const z = 1 - distSq / (r * r); // highest canopy surface, matching the radial colour and height
      if (z <= bestZ || hash(seed + 28, i, j) >= treeChance(seed, i, j, cx, cy)) continue;
      const sp = hash(seed + 29, i, j);
      best = { dx, dy, dist: Math.sqrt(distSq), r, species: sp < 0.72 ? 0 : sp < 0.9 ? 1 : 2, id: (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) | 0 };
      bestZ = z;
    }
  }
  return best;
}

let leafTree: Tree | undefined;
let leafLook: unknown;
let leafValue: ReturnType<typeof leafCover>;
/** The tree's leaf state on the look's date (remembered for the next pixel of the same crown). */
function leafCoverOf(tree: Tree) {
  if (tree.id !== leafTree?.id || leafLook !== look.s) {
    leafTree = tree;
    leafLook = look.s;
    leafValue = leafCover(tree.species, tree.id);
  }
  return leafValue;
}
const hedgeHeight = () => HEIGHT.hedge * (0.4 + 0.6 * look.s.foliage); // bare hedges are lower

/**
 * A leafless tree seen from above, or null between its limbs: a dark trunk at the centre, 5-7 limbs radiating out
 * (each forking once toward the rim) and a haze of fine twigs at the edge. Each tree is turned its own way and has
 * a warmer or greyer bark.
 */
function bareTree(tree: Tree, d: number): [RGB, number] | null {
  const k = (n: number) => hash(535 + n, tree.id, 0);
  const rr = tree.dist / tree.r;
  const h = HEIGHT.tree * (0.55 - 0.25 * rr);
  if (tree.dist < 1.1) return [BARK.trunk, HEIGHT.tree * 0.6];
  const bark = Math.floor(k(0) * 3);
  const n = 5 + Math.floor(k(1) * 3);
  const sector = (2 * Math.PI) / n;
  const a = Math.atan2(tree.dy, tree.dx) + k(2) * 2 * Math.PI;
  const da = (((a % sector) + sector) % sector) - sector / 2; // angle from the nearest limb
  if (tree.dist * Math.abs(Math.sin(da)) < 0.55) return [BARK.limb[bark], h];
  if (rr > 0.5) {
    const fork = Math.abs(da) - sector * 0.3; // the forks, splitting off either side of each limb
    if (tree.dist * Math.abs(Math.sin(fork)) < 0.45) return [BARK.twig[bark], h * 0.9];
    if (d < 0.2 + 0.1 * rr) return [BARK.twig[bark], h * 0.7]; // the haze of twigs
  }
  return null;
}

/** Colour and height of one world pixel. */
export function groundAt(seed: number, x: number, y: number): [RGB, number] {
  const d = bayer(x, y);

  // Trees first: crowns overhang shores, scrub and fields. Baked shading is neutral (fuller in the
  // middle, dark at the rim); the sun's direction is added live by the shading layer (world/shading.ts).
  const tree = treeAt(seed, x, y);
  if (tree) {
    const lc = leafCoverOf(tree);
    const rr = tree.dist / tree.r;
    // Leaves fill the crown in clumps as `cover` rises (and drop the same way); where there are none, the bare tree shows.
    const leafy = lc.cover > 0 && lc.cover > Math.min(0.99, valueNoise(seed + 533, x / 2.2, y / 2.2) * 0.55 + d * 0.25 + rr * 0.2);
    if (leafy) {
      const h = HEIGHT.tree * (0.4 + 0.6 * lc.cover) + HEIGHT.crownBulge * lc.cover * (1 - rr);
      // Mid-turn, a crown is mottled: some sprays turn ahead of the rest.
      const autumn = lc.autumn > 0 && lc.autumn < 2 ? Math.min(2, Math.max(0, lc.autumn + (valueNoise(seed + 534, x / 3, y / 3) - 0.5) * 0.6)) : lc.autumn;
      const [rim, canopy, crown, lit] = crowns(tree.species, { bud: lc.bud, autumn, hue: lc.hue, vary: lc.vary });
      const t = rr + (d - 0.5) * 0.35;
      return [t < 0.25 ? lit : t < 0.55 ? crown : t < 0.85 ? canopy : rim, h];
    }
    const limb = bareTree(tree, d);
    if (limb) return limb;
    // Between the limbs the ground shows through.
  }

  // Lakes: deep middle, shallow edge, a ragged shore of mud and reeds. Edges frayed + dithered.
  // (Sparkle on the water is live, not baked: see GLINT and render/sparkle.ts.)
  const clear = frontClearance(seed, x, y);
  const wet = wetness(seed, x, y, clear) + (valueNoise(seed + 14, x / 6, y / 6) - 0.5) * 0.012 + (d - 0.5) * 0.006;
  if (wet > LAKE) {
    // Shallows only as a thin, frayed band along the shore; everything else is deep water.
    const deep = wet > LAKE + 0.012 + (valueNoise(seed + 11, x / 6, y / 6) - 0.5) * 0.006;
    return [deep ? WATER.deep : WATER.shallow, 0];
  }
  if (wet > LAKE - SHORE_W * (1 + look.s.waterLevel)) { // a high water level widens the muddy shore; open water stays put
    const reeds = valueNoise(seed + 13, x / 3, y / 3) + d * 0.3 > 0.8 + 0.25 * look.s.waterLevel;
    return reeds ? [tone(SHORE.reeds, STRAW, smooth((0.8 - look.s.foliage) / 0.6)), HEIGHT.reeds] : [SHORE.mud, 0]; // reeds die back to straw as the leaves fall
  }

  // Woodland ground between the crowns: dark floor deep inside, then scrub that frays out into the
  // fields, dithered like a cloud's edge, so the wood bleeds into the farmland instead of stopping.
  const dens = woodDensity(seed, x, y, clear) + (valueNoise(seed + 15, x / 9, y / 9) - 0.5) * 0.3 + (d - 0.5) * 0.25;
  if (dens > 0.2) { // reaches a little beyond the outermost trees, so edge clumps stand in scrub, not crops
    const glade = gladeValue(seed, x, y) + (valueNoise(seed + 18, x / 7, y / 7) - 0.5) * 0.16 + (d - 0.5) * 0.1;
    if (glade > GLADE) {
      // Glade meadow, its edge frayed and dithered into the scrub around it; buttercups and daisies.
      const [a, b] = colours(seed, CROPS[2], -1);
      const f = flowers(seed, x, y, 'meadow');
      return [f ?? fallen(seed, x, y, 0.2) ?? (valueNoise(seed + 37, x / 3, y / 3) + d * 0.5 > 0.95 ? b : a), 0];
    }
    if (glade > GLADE - 0.07) return [fallen(seed, x, y, 0.3) ?? scrub(seed, x, y, d), HEIGHT.scrub];
    // Bluebells carpet the woodland floor in drifts (a Belgian May), thinning into the scrub at the edge.
    const drift = valueNoise(seed + 60, x / 26, y / 26) + valueNoise(seed + 61, x / 6, y / 6) * 0.3;
    const bluebells = dens > 0.7 ? bloom(seed, x, y, BLOOM.bluebell) : 0; // only some woods, deep inside
    if (bluebells > 0 && drift + (d - 0.5) * 0.25 > 1.25 - bluebells * 0.35) {
      return [hash(seed + 62, x, y) > 0.7 ? FLOWER.bluebellLit : FLOWER.bluebell, dens > 0.8 ? HEIGHT.understory : HEIGHT.scrub];
    }
    if (dens > 0.8) {
      const lit = valueNoise(seed + 16, x / 3, y / 3) + d * 0.3 > 0.85;
      return [fallen(seed, x, y, 1) ?? floorTone(lit ? FLOOR.litter : FLOOR.deep, lit), HEIGHT.understory];
    }
    return [fallen(seed, x, y, 0.3) ?? scrub(seed, x, y, d), HEIGHT.scrub];
  }

  // Copse floor: scrub under the clumps of trees standing out in the fields.
  if (copseValue(seed, x, y, clear) + (valueNoise(seed + 19, x / 5, y / 5) - 0.5) * 0.03 + (d - 0.5) * 0.02 > 0.95) {
    return [fallen(seed, x, y, 0.3) ?? scrub(seed, x, y, d), HEIGHT.scrub];
  }

  // Farmland: big irregular fields, each with its own crop and row direction.
  const cell = fieldCell(seed, x, y);
  const own = cropOf(cell.id);

  // Field borders, patchy: a mostly narrow dirt margin that swells, thins and vanishes along a border, its
  // edge frayed, tufts of crop growing through it, worn patches spilling into the field; some borders hedged.
  const border = cell.f2 - cell.f1;
  const hedged = valueNoise(seed + 33, x / 70, y / 70) > 0.4 && valueNoise(seed + 41, x / 25, y / 25) > 0.25;
  if (border < 4 && hedged) {
    // Hawthorn hedges in white "may" blossom, in sprays along their length.
    if (valueNoise(seed + 63, x / 7, y / 7) > 0.72 && hash(seed + 64, x, y) > 1 - 0.2 * bloom(seed, x, y, BLOOM.hawthorn, 0.86)) return [FLOWER.hawthorn, hedgeHeight()];
    // Light or dark per whole hedge: one choice for each pair of fields it divides (so a hedge changes
    // only at a field corner), weighted by a very large-scale region so neighbouring hedges mostly match.
    const lo = Math.floor(Math.min(cell.id, cell.id2) * 1e6);
    const hi = Math.floor(Math.max(cell.id, cell.id2) * 1e6);
    const lightShare = stretch(valueNoise(seed + 34, x / 600, y / 600), 3); // 0 … 1: dark country … light country
    const light = hash(seed + 35, lo, hi) < lightShare;
    // Speckled: small clusters of the other tone (a few bushes of another kind) mixed through each hedge.
    const other = valueNoise(seed + 36, x / 1.6, y / 1.6) + (d - 0.5) * 0.35 > 0.72;
    const lit = light !== other;
    const tones = lit ? HEDGE.light : HEDGE.dark;
    return [hedgeTone(tones[valueNoise(seed + 38, x / 2.5, y / 2.5) + d * 0.3 > 0.75 ? 1 : 0], lit), hedgeHeight()];
  }
  // In a wet spell the margins and paths spread wider, most in the low ground (overlay darkens them as mud).
  const sodden = look.s.mud * 9 * smooth((wet - 0.3) / 0.4);
  const dirtW = Math.max(0, (valueNoise(seed + 39, x / 60, y / 60) - 0.45) * 26) + (valueNoise(seed + 45, x / 5, y / 5) - 0.5) * 4 + sodden;
  const worn = border < dirtW + 10 && valueNoise(seed + 46, x / 12, y / 12) + (d - 0.5) * 0.1 > 0.86;
  if (border < dirtW || worn) {
    if (valueNoise(seed + 47, x / 3, y / 3) + d * 0.3 < 0.3) {
      // Tufts of grass in the margin; froths of cow parsley along hedged ones.
      return [hedged && hash(seed + 65, x, y) > 1 - 0.12 * bloom(seed, x, y, BLOOM.cowParsley, 0.86) ? FLOWER.cowParsley : colours(seed, own, cell.id)[0], 0];
    }
    const t = valueNoise(seed + 42, x / 2.5, y / 2.5) + d * 0.35;
    return [t > 1.05 ? DIRT.rut : t > 0.6 ? DIRT.worn : DIRT.dry, 0];
  }

  // Haymaking: some meadows are being mown, the hay raked into cocks in loose rows across the field
  // (first cut in late May–June [VERIFY]; loose hay, no bales).
  const cock = own.hay ? haycockAt(seed, cell.id, x, y) : null;
  if (cock) return cock;

  // Arable weeds: poppies and cornflowers along the edges of the crop fields.
  if (own.weeds && border < dirtW + 18 && valueNoise(seed + 66, x / 14, y / 14) > 0.5) {
    const h = hash(seed + 67, x, y);
    if (h > 1 - 0.035 * bloom(seed, x, y, BLOOM.poppy)) return [FLOWER.poppy, 0];
    if (h < 0.035 * bloom(seed, x, y, BLOOM.cornflower)) return [FLOWER.cornflower, 0];
  }

  // Leaves blown out of the woods onto the fields alongside, in autumn.
  const woodNear = look.s.fallDays > -10 || look.s.fallDays < -250 ? smooth((stretch(fbm(seed + 20, x / 700, y / 700, 4), 1.41) - 0.665) / 0.012) : 0; // only in leaf-fall, and only a few pixels outside the wood's edge (it starts at 0.68)
  const leaf = woodNear > 0 ? fallen(seed, x, y, woodNear ** 4 * 0.15) : null;
  if (leaf) return [leaf, 0];

  // Where two fields meet with no dirt between them, their crops intermingle across a frayed, dithered band.
  const mix = border / 14 + (valueNoise(seed + 50, x / 5, y / 5) - 0.5) * 0.6 + (d - 0.5) * 0.5;
  return [mix < 0.5 ? cropPixel(seed, cell.id2, x, y, d, cell.sx2, cell.sy2) : cropPixel(seed, cell.id, x, y, d, cell.sx, cell.sy), 0];
}

/**
 * A hay cock in a field being mown, or null. Cocks stand in loose rows (COCK apart, jittered, with gaps),
 * only in some meadows (`MOWN` of them) and only over the part mown so far, and each is whole: it's kept only if its centre is well inside the same
 * field and clear of woods, so none is cut by a border, a margin or scrub.
 */
const COCK = { x: 16, y: 21 }; // apart along and between the rows
const MOWN = 0.15;
export const HAY = { light: rgb(0xb7a05a), dark: rgb(0x9a844a), swath: rgb(0x8a8550) };
function haycockAt(seed: number, id: number, x: number, y: number): [RGB, number] | null {
  if (hash(seed + 80, Math.floor(id * 1e6), 1) > MOWN * look.s.hay) return null;
  const i = Math.floor(x / COCK.x);
  const j = Math.floor(y / COCK.y);
  const cx = (i + 0.25 + 0.5 * hash(seed + 81, i, j)) * COCK.x;
  const cy = (j + 0.4 + 0.2 * hash(seed + 82, i, j)) * COCK.y;
  const r = Math.hypot(x - cx, y - cy);
  const size = 1.8 + hash(seed + 83, i, j) * 0.8;
  if (r > size + 1.5 || hash(seed + 84, i, j) < 0.85) return null; // only a few: most of the hay is still to be cut
  if (valueNoise(seed + 85, cx / 110, cy / 110) < 0.45) return null; // only the part mown so far
  const at = fieldCell(seed, Math.round(cx), Math.round(cy));
  // Well inside the field (clear of margins, worn patches and hedges) and away from woods' frayed scrub.
  if (at.id !== id || at.f2 - at.f1 < 34 || woodDensity(seed, cx, cy) > 0 || copseValue(seed, cx, cy) > 0.9) return null;
  if (r > size) return bayer(x, y) < 0.5 ? [HAY.swath, 0] : null; // raked-up stalks round its foot
  return [r < size * 0.5 ? HAY.light : HAY.dark, 1 + 2.5 * (1 - r / size)];
}

/**
 * Wildflowers in grassland, or null. Each field's flowers grow in drifts (patch noise), not evenly:
 * meadows get buttercups, ox-eye daisies and patches of poppies; pasture gets clover and buttercups.
 */
function flowers(seed: number, x: number, y: number, kind: 'meadow' | 'pasture'): RGB | null {
  const drift = valueNoise(seed + 69, x / 22, y / 22);
  const h = hash(seed + 70, x, y);
  if (kind === 'meadow') {
    if (valueNoise(seed + 40, x / 40, y / 40) > 0.72 && h > 1 - 0.03 * bloom(seed, x, y, BLOOM.poppy)) return FLOWER.poppy; // poppy patches
    if (drift > 0.55 && h > 1 - 0.045 * bloom(seed, x, y, BLOOM.buttercup)) return FLOWER.buttercup;
    if (drift > 0.55 && h < 0.045 * bloom(seed, x, y, BLOOM.daisy)) return FLOWER.daisy;
  } else if (drift > 0.6) {
    if (h > 1 - 0.02 * bloom(seed, x, y, BLOOM.clover)) return FLOWER.clover;
    if (h < 0.01 * bloom(seed, x, y, BLOOM.buttercup)) return FLOWER.buttercup;
  }
  return null;
}

/** Scrub (bramble, bracken, hazel) at a wood's edge and under copses, browned for the season. */
const scrub = (seed: number, x: number, y: number, d: number): RGB => scrubTone(SCRUB[Math.floor(valueNoise(seed + 17, x / 3, y / 3) * 2.2 + d * 0.8) % 3]);

/**
 * A fallen leaf at a pixel in autumn, or null. `near` 0-1: how close the trees are (1 on the forest floor). The leaves
 * lie in streaks across the prevailing wind (from the west-south-west), thicker in the woods and drifting out over the fields.
 */
function fallen(seed: number, x: number, y: number, near: number): RGB | null {
  const lit = leafLitter();
  if (lit <= 0.02 || near <= 0) return null;
  // Blown into clumps and short streaks along the wind, not spread evenly.
  const streak = valueNoise(seed + 601, (x * 0.92 - y * 0.38) / 24, (y * 0.92 + x * 0.38) / 7);
  const clump = valueNoise(seed + 608, x / 6, y / 6);
  const heap = smooth((streak * clump - 0.12) / 0.15); // dense heaps with bare ground between, not a thin scatter
  if (hash(seed + 600, x, y) > lit * near * (0.005 + 0.7 * heap)) return null;
  return fallenLeaf(hash(seed + 602, x, y));
}

/**
 * How readily snow lies at a pixel, 0-1. Out in the fields: deepest in the lee (east-north-east side) of hedges and
 * field borders where it drifts, then field by field, in small drifts scattered across each field, in the furrows
 * and the hollows. In the woods it lies evenly among the trees (no field lines); in a front's zone the churned
 * ground has its own pattern (no field lines either). Snow covers a pixel once it is deep enough for its `lie`
 * (see overlay in world/season.ts); the lee of anything standing (trees, walls, parapets) is added there.
 */
export function snowLie(seed: number, x: number, y: number): number {
  const clear = frontClearance(seed, x, y);
  const wood = Math.max(woodDensity(seed, x, y, clear), copseChance(seed, x, y, clear));
  const inWood = smooth(wood * 1.6);
  const [inFront, inWorks] = clear > 0 ? frontZones(seed, x, y) : [0, 0];
  let lie = inWood >= 1 || inFront >= 1 ? 0 : fieldLie(seed, x, y, inWorks);
  if (inWood > 0) lie += (0.68 + 0.22 * valueNoise(seed + 603, x / 16, y / 16) + 0.1 * valueNoise(seed + 604, x / 4, y / 4) - lie) * inWood;
  if (inFront > 0) {
    // Churned ground holds snow a little better than a field (holes, clods); the fields alongside keep their border drifts as it fades in.
    // About as even a spread as the fields' (so as much of it whitens at a depth), without the field lines.
    const front = 0.15 + 0.55 * stretch(fbm(seed + 605, x / 90, y / 90, 4), 1.4) + 0.1 * valueNoise(seed + 606, x / 5, y / 5) + 0.3 * tuftAt(seed, x, y) ** 4; // soft sweeps and small drifts
    lie += (front - lie) * inFront;
  }
  return lie;
}

/** Small drifts: short tongues along the wind, behind a tussock or a clod (0-1, high in a drift). */
const tuftAt = (seed: number, x: number, y: number) => valueNoise(seed + 607, (x * 0.92 - y * 0.38) / 11, (y * 0.92 + x * 0.38) / 6);

/** px behind the divide past nml where the hindmost trench can run (military.ts WALLS: fire trench at 12, three walls at most 75 apart, wandering 40). */
const BACK_TRENCH = 12 + 3 * 75 + 40;
/**
 * Where a pixel is in a front: [between the two sides' wire (the churned no-man's land), between the two sides'
 * hindmost trenches], each 1 inside, easing to 0 across its edge, and 0 away from a front.
 */
function frontZones(seed: number, x: number, y: number): [number, number] {
  const n = nearest(seed, frontsNear(seed, x, y, x + 1, y + 1), x, y);
  if (!n) return [0, 0];
  const au = Math.abs(n.u);
  const e = smooth(n.end * 4);
  return [smooth((n.f.nml - 14 - au) / 80) * e, smooth((n.f.nml + BACK_TRENCH + 120 - au) / 240) * e]; // the wire starts 26 px in front of the fire trench (nml + 12)
}

/**
 * Snow lie on open fields. `works` 0-1: among the trenches (between the hindmost lines), where the fields are
 * trampled and dug through: the same spread and the same fields, but without their sharp outlines (see below).
 */
function fieldLie(seed: number, x: number, y: number, works = 0): number {
  const cell = fieldCell(seed, x, y);
  const border = cell.f2 - cell.f1;
  const nx = cell.dx - cell.dx2;
  const ny = cell.dy - cell.dy2;
  const lee = Math.max(0, -(nx * 0.92 - ny * 0.38) / (Math.hypot(nx, ny) || 1)); // the border lies upwind of this side of it
  const hedged = valueNoise(seed + 33, x / 70, y / 70) > 0.4 && valueNoise(seed + 41, x / 25, y / 25) > 0.25;
  const drift = smooth(1 - border / (10 + 50 * lee)) * (hedged ? 1 : 0.55) * (0.4 + 0.6 * lee);
  const crop = cropOf(cell.id);
  const dir = Math.floor(hash(seed + 34, Math.floor(cell.id * 1e6), 0) * 4);
  const s = dir === 0 ? x : dir === 1 ? y : dir === 2 ? x + y : x - y;
  const trough = crop.pattern === 'furrows' || crop.pattern === 'rows' ? (stripe(s, 3) ? 0 : 1) : crop.pattern === 'hay' ? (stripe(s, 5) ? 0 : 0.6) : 0.4;
  const exposure = hash(seed + 54, Math.floor(cell.id * 1e6), 5); // each field holds its snow a little longer or shorter (aspect, crop cover)
  const swell = fbm(seed + 542, x / 220, y / 220, 2);
  const low = stretch(fbm(seed + 10, x / 900, y / 900, 4), 1.39);
  const tuft = tuftAt(seed, x, y);
  const tufted = smooth((valueNoise(seed + 611, x / 140, y / 140) - 0.45) / 0.3); // only in some stretches of a field
  let edgeDrift = drift;
  let share = exposure;
  let tufts = tufted;
  if (works > 0) {
    // Among the works the hedges are shot away and the banks trodden down: a border keeps only broken stretches
    // of its drift; each field still holds its snow longer or shorter (the same fields as outside, so the zone
    // runs on into them), but that eases across its border instead of stopping at it; and every clod and rut
    // has a small drift behind it. The other sheltered spots (shell holes, the lee of the works) come in overlay.
    const broken = smooth((valueNoise(seed + 616, x / 28, y / 28) - 0.3) / 0.35) * 0.75;
    const across = 0.5 * (1 - smooth(border / 70)); // the neighbour's share, half at the border
    const blurred = exposure * (1 - across) + hash(seed + 54, Math.floor(cell.id2 * 1e6), 5) * across + (fbm(seed + 614, x / 60, y / 60, 2) - 0.5) * 0.25;
    edgeDrift += (drift * broken - drift) * works;
    share += (blurred - share) * works;
    tufts += (1 - tufts) * works;
  }
  const raw = 0.5 * edgeDrift + 0.07 * trough * (1 - 0.6 * works) + 0.3 * share + 0.06 * swell + 0.08 * low + 0.02 * bayer(x, y) + 0.3 * tufts * tuft ** 8;
  // Spread to about uniform over open land (its measured quantiles), so a snow depth covers a predictable share.
  for (let i = 1; i < LIE_RANK.length; i++) {
    const [r1, q1] = LIE_RANK[i];
    if (raw <= r1) {
      const [r0, q0] = LIE_RANK[i - 1];
      return q0 + ((q1 - q0) * (raw - r0)) / (r1 - r0);
    }
  }
  return 1;
}
const LIE_RANK = [[0, 0], [0.098, 0.02], [0.119, 0.05], [0.14, 0.1], [0.169, 0.2], [0.204, 0.3], [0.271, 0.5], [0.336, 0.7], [0.37, 0.8], [0.413, 0.9], [0.462, 0.95], [0.595, 0.98], [0.8, 1]] as const;

/** One pixel of the crop belonging to the field with this id, whose own point is (sx, sy). */
function cropPixel(seed: number, id: number, x: number, y: number, d: number, sx: number, sy: number): RGB {
  const crop = cropOf(id);
  const [a, b] = colours(seed, crop, id);
  const dir = Math.floor(hash(seed + 34, Math.floor(id * 1e6), 0) * 4);
  const s = dir === 0 ? x : dir === 1 ? y : dir === 2 ? x + y : x - y;
  switch (crop.pattern) {
    case 'furrows':
      return stripe(s, 3) ? a : b;
    case 'rows': {
      // Colza comes into flower, and goes over, gradually: yellow by how far the field (at its own point, so it is never split) is in bloom.
      if (crop !== COLZA) return stripe(s, 3) ? a : b;
      const fl = smooth(bloom(seed, sx, sy, BLOOM.colza) / 0.6);
      return stripe(s, 3) ? tone(a, COLZA_FLOWER[0], fl) : tone(b, COLZA_FLOWER[1], fl);
    }
    case 'hay':
      return stripe(s, 5) && hash(seed + 35, x, y) > 0.25 ? b : a;
    case 'flowerheads': // a green crop dotted with flower heads (red clover), more of them where it's in bloom
      return valueNoise(seed + 72, x / 2, y / 2) + d * 0.4 > 1.15 - 0.2 * bloom(seed, x, y, BLOOM.clover) ? b : a;
    case 'grass':
      return (crop.flowers && flowers(seed, x, y, crop.flowers)) || (valueNoise(seed + 37, x / 3, y / 3) + d * 0.5 > 0.95 ? b : a);
  }
}

/**
 * Worn earth with the look of the field margins (three dirt shades with ruts), for anywhere the ground
 * has been trodden or dug: around farms, along tracks, the spoil beside trenches. `density` 0 … 1 sets
 * how much of it is bare: returns null (let the grass or crop show through, as tufts and speckles) more
 * often as density falls, so worn ground frays naturally into the fields.
 */
export function dirtAt(seed: number, x: number, y: number, density: number): RGB | null {
  const d = bayer(x, y);
  if (density + (valueNoise(seed + 47, x / 3, y / 3) - 0.5) * 0.55 + (d - 0.5) * 0.45 < 0.55) return null;
  const t = valueNoise(seed + 42, x / 2.5, y / 2.5) + d * 0.35;
  return t > 1.05 ? DIRT.rut : t > 0.6 ? DIRT.worn : DIRT.dry;
}

/** What kind of land a point is, for placing things on it (farms want open farmland). */
export function landAt(seed: number, x: number, y: number): 'water' | 'wood' | 'open' {
  if (isWater(seed, x, y)) return 'water';
  if (woodDensity(seed, x, y) > 0.1 || copseChance(seed, x, y) > 0 || treeAt(seed, x, y)) return 'wood';
  return 'open';
}

export const isWater = (seed: number, x: number, y: number): boolean => wetness(seed, x, y) > LAKE - SHORE_W - 0.02;

/**
 * Where the front's works may not go, for a tile [x0, x1) × [y0, y1): water (lakes and their shores).
 * Texture-driven and cheap: wetness is sampled on a world-aligned 8-px grid (about 300 samples a tile,
 * the same at every tile edge) and interpolated, instead of per pixel. (Woods don't stop the front: its
 * works run through them, under the tree crowns; see world/generate.ts.)
 */
export function noDigMask(seed: number, x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => number {
  const G = 8;
  const i0 = Math.floor(x0 / G);
  const j0 = Math.floor(y0 / G);
  const ni = Math.floor((x1 - 1) / G) + 2 - i0;
  const nj = Math.floor((y1 - 1) / G) + 2 - j0;
  const wet = new Float32Array(ni * nj);
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) wet[j * ni + i] = wetness(seed, (i0 + i) * G, (j0 + j) * G);
  const WET = LAKE - 0.012; // just short of the water itself (its edge is frayed by up to ±0.009): works run up to the water and stop
  return (x, y) => {
    const fx = x / G - i0;
    const fy = y / G - j0;
    const i = Math.min(ni - 2, Math.max(0, Math.floor(fx)));
    const j = Math.min(nj - 2, Math.max(0, Math.floor(fy)));
    const tx = fx - i;
    const ty = fy - j;
    const k = j * ni + i;
    return WET - ((wet[k] * (1 - tx) + wet[k + 1] * tx) * (1 - ty) + (wet[k + ni] * (1 - tx) + wet[k + ni + 1] * tx) * ty); // < 0: water
  };
}

export const groundColor = (seed: number, x: number, y: number): RGB => groundAt(seed, x, y)[0];
export const groundHeight = (seed: number, x: number, y: number): number => groundAt(seed, x, y)[1];

/**
 * Soft patchiness within every biome: −1 darker (damp), 0, or +1 lighter (dry), in large blotches with
 * frayed, dithered edges, so a field or a wood is never one flat tone.
 */
export function groundShade(seed: number, x: number, y: number): -1 | 0 | 1 {
  const v = stretch(fbm(seed + 90, x / 140, y / 140, 3), 2) + (valueNoise(seed + 91, x / 7, y / 7) - 0.5) * 0.15 + (bayer(x, y) - 0.5) * 0.12;
  return v < 0.3 ? -1 : v > 0.7 ? 1 : 0;
}
const SHADE = [0.92, 1, 1.06]; // by groundShade + 1 (an array: a {-1: …} object key is a slow string lookup)

/**
 * One generated tile: RGBA pixels, plus (ground only) heights ×HEIGHT_STEPS for shadows, and `glints`:
 * the tile-local pixel indexes of water pixels that can catch the sun and sparkle.
 */
export type TileData = { rgba: Uint8ClampedArray<ArrayBuffer>; heights?: Uint8Array<ArrayBuffer>; glints?: Uint32Array<ArrayBuffer> };

/** Fraction of water pixels that can sparkle. */
export const GLINT = 0.0007;
/** … of ice pixels, a quarter of open water's. */
export const ICE_GLINT = GLINT * 0.25;
/** … and of the front's small muddy pools (more, so most shell-hole pools get a glint or two). */
export const POOL_GLINT = 0.02;
export const HEIGHT_STEPS = 8;

/** Something stamped over the ground at a pixel (colour, height), or null to let the ground show. */
export type GroundStamp = (x: number, y: number) => readonly [RGB, number] | null;

/**
 * How sheltered a pixel (tile-local x, y, height h) is from the west-south-west wind, 0-1: something standing upwind
 * (a hedge, a tree, a wall, a parapet) shelters the ground behind it for a few pixels per unit of its height, so
 * snow drifts in against it on the lee side.
 */
function shelterAt(heightAt: (x: number, y: number) => number, x: number, y: number, h: number): number {
  let best = 0;
  for (let k = 1; k <= 8; k++) {
    const up = heightAt(x - Math.round(0.92 * k), y + Math.round(0.38 * k));
    const s = (up - h - 0.5 * k) / 1.5;
    if (s > best) best = s >= 1 ? 1 : s;
  }
  return best;
}

/**
 * CHUNK×CHUNK world pixels starting at (cx·CHUNK, cy·CHUNK). `stamp` lays buildings, trenches and damage
 * over the landscape (see world/generate.ts); where it covers a pixel, the ground there isn't computed.
 */
export function groundChunk(seed: number, cx: number, cy: number, stamp?: GroundStamp): TileData {
  const rgba = new Uint8ClampedArray(CHUNK * CHUNK * 4);
  const heights = new Uint8Array(CHUNK * CHUNK);
  const glints: number[] = [];
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  // First every pixel's own colour and height; then the ground states, which need the neighbours' heights (snow
  // drifts in the lee of whatever stands upwind) when there is snow or frost.
  const cols: RGB[] = new Array(CHUNK * CHUNK);
  const hs = new Float32Array(CHUNK * CHUNK);
  const veg = new Uint8Array(CHUNK * CHUNK);
  const isStamped = new Uint8Array(CHUNK * CHUNK);
  for (let y = 0, i = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++, i++) {
      const stamped = stamp?.(x0 + x, y0 + y);
      const [c, h] = stamped ?? groundAt(seed, x0 + x, y0 + y);
      cols[i] = c;
      hs[i] = h;
      isStamped[i] = stamped ? 1 : 0;
      veg[i] = !stamped && h > 0 ? 1 : 0; // trees, hedges, scrub, reeds (not roofs or the front's works)
    }
  }
  const cold = look.s.snow > 0.05 || look.s.frost > 0.05;
  const outside = new Map<number, number>();
  const heightAt = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < CHUNK && y < CHUNK) return hs[y * CHUNK + x];
    const k = (y + 16) * 512 + x + 16;
    let h = outside.get(k);
    if (h === undefined) outside.set(k, (h = groundAt(seed, x0 + x, y0 + y)[1])); // ponytail: next tile's stamps (walls, parapets) are not seen across the edge
    return h;
  };
  for (let y = 0, i = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++, i++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const ground = cols[i];
      const h = hs[i];
      const lee = cold ? shelterAt(heightAt, x, y, h) : 0;
      const sun = cold && isStamped[i] === 1 && h > 2 ? Math.min(1, Math.max(0, (heightAt(x, y - 1) - heightAt(x, y + 1)) * 4)) : 0; // a roof slope falling away to the south (+y)
      const c = overlay(seed, wx, wy, ground, h, undefined, lee, veg[i] === 1, sun); // snow, mud, flooding and ice: the very same colour at May
      const stamped = isStamped[i] === 1;
      const [r, g, b] = c;
      // Ice sparkles at a quarter of open water's rate; turbid water (no longer WATER.deep) still counts as water.
      const rate = isIce(c) ? ICE_GLINT : c === WATER.pool[0] || c === WATER.pool[1] ? POOL_GLINT : !stamped && (ground === WATER.deep || ground === WATER.shallow) ? GLINT : 0;
      if (rate && hash(seed + 12, wx, wy) < rate) glints.push(i);
      const k = SHADE[groundShade(seed, wx, wy) + 1];
      rgba[i * 4] = r * k;
      rgba[i * 4 + 1] = g * k;
      rgba[i * 4 + 2] = b * k;
      rgba[i * 4 + 3] = 255;
      heights[i] = Math.round(h * HEIGHT_STEPS);
    }
  }
  return { rgba, heights, glints: Uint32Array.from(glints) };
}
