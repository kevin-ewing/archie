// Ground from noise, seen from low altitude (a single field can fill much of the screen), in two levels:
//  1. Biomes from very large-scale noise: farmland, woods and lakes. Their borders blend like the clouds'
//     edges: frayed by fine noise and dithered, with scrub and forest floor bleeding between wood and field.
//  2. Detail within each biome: fields of different crops with patchy dirt margins and hedges; whole,
//     overlapping tree crowns of a few species; lake depth and shore. Plus a soft light/dark patchiness
//     across everything (`groundShade`) so no biome is one flat tone.
// Each world pixel also has a height (trees, hedges), used by the plane's cast shadow.
// Pure functions of (seed, world pixel); no DOM, so they're testable and reproducible.

import { bayer, cellular, fbm, hash, valueNoise } from '../core/noise.ts';

export type RGB = readonly [number, number, number];

export const CHUNK = 128; // world pixels per tile edge

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export const WATER = { deep: rgb(0x34494f), shallow: rgb(0x48606a), glint: rgb(0x7d9599) };
export const SHORE = { mud: rgb(0x6a5e43), reeds: rgb(0x535b33) };
const FLOOR = { deep: rgb(0x1f2c19), litter: rgb(0x2a3720) };
const SCRUB = [rgb(0x3b4a26), rgb(0x46552c), rgb(0x2f3d20)] as const;
/** Tree species, as [rim, canopy, crown, lit] tones: oak (most), a paler poplar/birch, a dark elm. */
const SPECIES: readonly (readonly [RGB, RGB, RGB, RGB])[] = [
  [rgb(0x33452d), rgb(0x35482e), rgb(0x40573a), rgb(0x4e6843)],
  [rgb(0x46593a), rgb(0x4a5e3d), rgb(0x566e45), rgb(0x6a8252)],
  [rgb(0x293a27), rgb(0x293c28), rgb(0x324a31), rgb(0x3d5a3a)],
];
/** Hedgerows: dark (old blackthorn, holly) or light green (young hawthorn, hazel), in long runs of each. */
const HEDGE = { dark: [rgb(0x2c3a1b), rgb(0x3a4a23)], light: [rgb(0x40532a), rgb(0x506534)] } as const;
export const DIRT = { dry: rgb(0x7d6a49), worn: rgb(0x6c5a3d), rut: rgb(0x574732) };

// Wildflowers of a Flanders May (pre-herbicide fields were full of them): poppies and cornflowers among
// the crops, buttercups, ox-eye daisies and red clover in the meadows, hawthorn ("may") blossom on the
// hedges, cow parsley along the margins, bluebells carpeting the woods.
// Flowers are rare finds: each kind blooms only in its own scattered regions a few kilometres apart
// (`bloom`), so a whole day's flying turns up a handful of poppy fields, bluebell woods and so on.
// ponytail: May only. Seasons (poppies peak in June, flax flowers blue in June–July, hay and stubble in
// late summer) need the season passed into generation; add it when the calendar spans months.
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
  return smooth((valueNoise(seed + 80 + kind * 7, x / 3200, y / 3200) - rarity) / 0.1);
}

type Pattern = 'furrows' | 'rows' | 'hay' | 'grass' | 'flowerheads';
type Crop = { name: string; a: RGB; b: RGB; weight: number; pattern: Pattern; weeds?: boolean; flowers?: 'meadow' | 'pasture'; hay?: boolean }; // hay: mown for hay (some carry hay cocks)
/**
 * Field crops of 1910s Flanders: small mixed farms growing grain, colza (rapeseed, in yellow flower in May),
 * flax, red clover for fodder, with meadows and pasture for the dairy cows.
 */
const CROPS: readonly Crop[] = [
  { name: 'ploughed', a: rgb(0x6a5538), b: rgb(0x584530), weight: 1.6, pattern: 'furrows' },
  { name: 'young wheat', a: rgb(0x5b6734), b: rgb(0x4e5a2d), weight: 2, pattern: 'rows', weeds: true },
  { name: 'meadow', a: rgb(0x6c763e), b: rgb(0x7f8449), weight: 2, pattern: 'grass', flowers: 'meadow', hay: true },
  { name: 'rough grass', a: rgb(0x8c7f52), b: rgb(0x7b6f47), weight: 1, pattern: 'hay', hay: true },
  { name: 'pasture', a: rgb(0x4f5a2e), b: rgb(0x5d6936), weight: 2, pattern: 'grass', flowers: 'pasture' },
  { name: 'colza in flower', a: rgb(0xc4b03a), b: rgb(0xa99a36), weight: 0.25, pattern: 'rows', weeds: true },
  { name: 'red clover', a: rgb(0x5a6a38), b: rgb(0xa86e80), weight: 0.2, pattern: 'flowerheads' },
  { name: 'young flax', a: rgb(0x64785a), b: rgb(0x587050), weight: 0.6, pattern: 'rows', weeds: true },
];
const CROP_TOTAL = CROPS.reduce((t, c) => t + c.weight, 0);
const COLZA = CROPS[5];
/** A field's crop from its id in [0, 1), by weight. */
function cropOf(id: number): Crop {
  let t = id * CROP_TOTAL;
  for (const c of CROPS) if ((t -= c.weight) < 0) return c;
  return CROPS[CROPS.length - 1];
}
export const BASE = CROPS[2].a; // fallback fill where a tile isn't generated yet

const LAKE = 0.88; // wetness above this is water
const SHORE_W = 0.015; // wetness band below LAKE that is shoreline
const FIELD_SIZE = 420; // world px per field cell
const TREE_SIZE = 10; // world px per tree cell
export const HEIGHT = { tree: 12, crownBulge: 4, understory: 8, hedge: 4, scrub: 1.5, reeds: 1.5 };

const stretch = (v: number, k: number) => Math.min(1, Math.max(0, (v - 0.5) * k + 0.5));
const stripe = (s: number, w: number) => ((Math.floor(s / w) % 2) + 2) % 2 === 0;
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

// Lakes cover ~2.5% of the land and woods ~18% (the stretch factors set that: 1.7 and 2 gave ~6% and ~26%).
const wetness = (seed: number, x: number, y: number) => stretch(fbm(seed + 10, x / 900, y / 900, 4), 1.39);
/** 0 = open country … 1 = deep forest, ramping over a wide band so woods fade out rather than stop. */
const woodDensity = (seed: number, x: number, y: number) => smooth((stretch(fbm(seed + 20, x / 700, y / 700, 4), 1.41) - 0.68) / 0.13);
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
// a biome edge, a glade or a lake. Crowns overlap; the one with the highest z is on top.

let cacheSeed = NaN;
const treeChanceCache = new Map<number, number>();

function treeChance(seed: number, i: number, j: number, cx: number, cy: number): number {
  if (seed !== cacheSeed || treeChanceCache.size > 400_000) {
    cacheSeed = seed;
    treeChanceCache.clear();
  }
  const key = i * 2_000_003 + j; // unique for |i|, |j| < 10⁶ cells (a 10,000 km world)
  let chance = treeChanceCache.get(key);
  if (chance === undefined) {
    if (wetness(seed, cx, cy) > LAKE - SHORE_W - 0.01) chance = 0; // keep crowns off the water
    else {
      // Trees come in groups, never scattered singly: at a wood's edge a clump noise decides where groups
      // reach out into the fields, and out in open farmland the only trees are the occasional copse.
      const dens = woodDensity(seed, cx, cy) * (1 - smooth((gladeValue(seed, cx, cy) - (GLADE - 0.1)) / 0.12));
      const clump = valueNoise(seed + 48, cx / 35, cy / 35);
      chance = Math.max(smooth((dens * 1.2 + (clump - 0.5) * 0.8 - 0.35) / 0.25), copseChance(seed, cx, cy));
    }
    treeChanceCache.set(key, chance);
  }
  return chance;
}

/** Copses: rare, tight clumps of trees out in the fields (with scrub underneath). 0 … 1. */
const copseValue = (seed: number, x: number, y: number) => valueNoise(seed + 49, x / 55, y / 55);
const copseChance = (seed: number, x: number, y: number) => smooth((copseValue(seed, x, y) - 0.955) / 0.02);

export type Tree = { dx: number; dy: number; dist: number; r: number; species: number };

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
      const z = hash(seed + 27, i, j);
      if (z <= bestZ || hash(seed + 28, i, j) >= treeChance(seed, i, j, cx, cy)) continue;
      const sp = hash(seed + 29, i, j);
      best = { dx, dy, dist: Math.sqrt(distSq), r, species: sp < 0.72 ? 0 : sp < 0.9 ? 1 : 2 };
      bestZ = z;
    }
  }
  return best;
}

/** Colour and height of one world pixel. */
export function groundAt(seed: number, x: number, y: number): [RGB, number] {
  const d = bayer(x, y);

  // Trees first: crowns overhang shores, scrub and fields. Baked shading is neutral (fuller in the
  // middle, dark at the rim); the sun's direction is added live by the shading layer (world/shading.ts).
  const tree = treeAt(seed, x, y);
  if (tree) {
    const [rim, canopy, crown, lit] = SPECIES[tree.species];
    const t = tree.dist / tree.r + (d - 0.5) * 0.35;
    const c = t < 0.25 ? lit : t < 0.55 ? crown : t < 0.85 ? canopy : rim;
    return [c, HEIGHT.tree + HEIGHT.crownBulge * (1 - tree.dist / tree.r)];
  }

  // Lakes: deep middle, shallow edge, a ragged shore of mud and reeds. Edges frayed + dithered.
  // (Sparkle on the water is live, not baked: see GLINT and render/sparkle.ts.)
  const wet = wetness(seed, x, y) + (valueNoise(seed + 14, x / 6, y / 6) - 0.5) * 0.012 + (d - 0.5) * 0.006;
  if (wet > LAKE) {
    // Shallows only as a thin, frayed band along the shore; everything else is deep water.
    const deep = wet > LAKE + 0.012 + (valueNoise(seed + 11, x / 6, y / 6) - 0.5) * 0.006;
    return [deep ? WATER.deep : WATER.shallow, 0];
  }
  if (wet > LAKE - SHORE_W) {
    const reeds = valueNoise(seed + 13, x / 3, y / 3) + d * 0.3 > 0.8;
    return reeds ? [SHORE.reeds, HEIGHT.reeds] : [SHORE.mud, 0];
  }

  // Woodland ground between the crowns: dark floor deep inside, then scrub that frays out into the
  // fields, dithered like a cloud's edge, so the wood bleeds into the farmland instead of stopping.
  const dens = woodDensity(seed, x, y) + (valueNoise(seed + 15, x / 9, y / 9) - 0.5) * 0.3 + (d - 0.5) * 0.25;
  if (dens > 0.2) { // reaches a little beyond the outermost trees, so edge clumps stand in scrub, not crops
    const glade = gladeValue(seed, x, y) + (valueNoise(seed + 18, x / 7, y / 7) - 0.5) * 0.16 + (d - 0.5) * 0.1;
    if (glade > GLADE) {
      // Glade meadow, its edge frayed and dithered into the scrub around it; buttercups and daisies.
      const { a, b } = CROPS[2];
      const f = flowers(seed, x, y, 'meadow');
      return [f ?? (valueNoise(seed + 37, x / 3, y / 3) + d * 0.5 > 0.95 ? b : a), 0];
    }
    if (glade > GLADE - 0.07) return [SCRUB[Math.floor(valueNoise(seed + 17, x / 3, y / 3) * 2.2 + d * 0.8) % 3], HEIGHT.scrub];
    // Bluebells carpet the woodland floor in drifts (a Belgian May), thinning into the scrub at the edge.
    const drift = valueNoise(seed + 60, x / 26, y / 26) + valueNoise(seed + 61, x / 6, y / 6) * 0.3;
    const bluebells = dens > 0.7 ? bloom(seed, x, y, BLOOM.bluebell) : 0; // only some woods, deep inside
    if (bluebells > 0 && drift + (d - 0.5) * 0.25 > 1.25 - bluebells * 0.35) {
      return [hash(seed + 62, x, y) > 0.7 ? FLOWER.bluebellLit : FLOWER.bluebell, dens > 0.8 ? HEIGHT.understory : HEIGHT.scrub];
    }
    if (dens > 0.8) return [valueNoise(seed + 16, x / 3, y / 3) + d * 0.3 > 0.85 ? FLOOR.litter : FLOOR.deep, HEIGHT.understory];
    return [SCRUB[Math.floor(valueNoise(seed + 17, x / 3, y / 3) * 2.2 + d * 0.8) % 3], HEIGHT.scrub];
  }

  // Copse floor: scrub under the clumps of trees standing out in the fields.
  if (copseValue(seed, x, y) + (valueNoise(seed + 19, x / 5, y / 5) - 0.5) * 0.03 + (d - 0.5) * 0.02 > 0.95) {
    return [SCRUB[Math.floor(valueNoise(seed + 17, x / 3, y / 3) * 2.2 + d * 0.8) % 3], HEIGHT.scrub];
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
    if (valueNoise(seed + 63, x / 7, y / 7) > 0.72 && hash(seed + 64, x, y) > 1 - 0.2 * bloom(seed, x, y, BLOOM.hawthorn, 0.86)) return [FLOWER.hawthorn, HEIGHT.hedge];
    // Light or dark per whole hedge: one choice for each pair of fields it divides (so a hedge changes
    // only at a field corner), weighted by a very large-scale region so neighbouring hedges mostly match.
    const lo = Math.floor(Math.min(cell.id, cell.id2) * 1e6);
    const hi = Math.floor(Math.max(cell.id, cell.id2) * 1e6);
    const lightShare = stretch(valueNoise(seed + 34, x / 600, y / 600), 3); // 0 … 1: dark country … light country
    const light = hash(seed + 35, lo, hi) < lightShare;
    // Speckled: small clusters of the other tone (a few bushes of another kind) mixed through each hedge.
    const other = valueNoise(seed + 36, x / 1.6, y / 1.6) + (d - 0.5) * 0.35 > 0.72;
    const tones = light !== other ? HEDGE.light : HEDGE.dark;
    return [tones[valueNoise(seed + 38, x / 2.5, y / 2.5) + d * 0.3 > 0.75 ? 1 : 0], HEIGHT.hedge];
  }
  const dirtW = Math.max(0, (valueNoise(seed + 39, x / 60, y / 60) - 0.45) * 26) + (valueNoise(seed + 45, x / 5, y / 5) - 0.5) * 4;
  const worn = border < dirtW + 10 && valueNoise(seed + 46, x / 12, y / 12) + (d - 0.5) * 0.1 > 0.86;
  if (border < dirtW || worn) {
    if (valueNoise(seed + 47, x / 3, y / 3) + d * 0.3 < 0.3) {
      // Tufts of grass in the margin; froths of cow parsley along hedged ones.
      return [hedged && hash(seed + 65, x, y) > 1 - 0.12 * bloom(seed, x, y, BLOOM.cowParsley, 0.86) ? FLOWER.cowParsley : own.a, 0];
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
  if (hash(seed + 80, Math.floor(id * 1e6), 1) > MOWN) return null;
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

/** One pixel of the crop belonging to the field with this id, whose own point is (sx, sy). */
function cropPixel(seed: number, id: number, x: number, y: number, d: number, sx: number, sy: number): RGB {
  const crop = cropOf(id);
  const { a, b } = crop;
  const dir = Math.floor(hash(seed + 34, Math.floor(id * 1e6), 0) * 4);
  const s = dir === 0 ? x : dir === 1 ? y : dir === 2 ? x + y : x - y;
  switch (crop.pattern) {
    case 'furrows':
      return stripe(s, 3) ? a : b;
    case 'rows': // colza only shows yellow where it's in flower, else it's still green; decided once per field (at its own point), so a field is never split
      if (crop === COLZA && bloom(seed, sx, sy, BLOOM.colza) < 0.3) return stripe(s, 3) ? CROPS[1].a : CROPS[1].b;
      return stripe(s, 3) ? a : b;
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

const isWater = (seed: number, x: number, y: number): boolean => wetness(seed, x, y) > LAKE - SHORE_W - 0.02;

/**
 * Where the front's works may not go, for a tile [x0, x1) × [y0, y1): water (lakes and their shores).
 * Texture-driven and cheap: wetness is sampled on a world-aligned 8-px grid (about 300 samples a tile,
 * the same at every tile edge) and interpolated, instead of per pixel. (Woods don't stop the front: its
 * works run through them, under the tree crowns; see world/generate.ts.)
 */
export function noDigMask(seed: number, x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => boolean {
  const G = 8;
  const i0 = Math.floor(x0 / G);
  const j0 = Math.floor(y0 / G);
  const ni = Math.floor((x1 - 1) / G) + 2 - i0;
  const nj = Math.floor((y1 - 1) / G) + 2 - j0;
  const wet = new Float32Array(ni * nj);
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) wet[j * ni + i] = wetness(seed, (i0 + i) * G, (j0 + j) * G);
  const WET = LAKE - SHORE_W - 0.02;
  return (x, y) => {
    const fx = x / G - i0;
    const fy = y / G - j0;
    const i = Math.min(ni - 2, Math.max(0, Math.floor(fx)));
    const j = Math.min(nj - 2, Math.max(0, Math.floor(fy)));
    const tx = fx - i;
    const ty = fy - j;
    const k = j * ni + i;
    return (wet[k] * (1 - tx) + wet[k + 1] * tx) * (1 - ty) + (wet[k + ni] * (1 - tx) + wet[k + ni + 1] * tx) * ty > WET;
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
export const HEIGHT_STEPS = 8;

/** Something stamped over the ground at a pixel (colour, height), or null to let the ground show. */
export type GroundStamp = (x: number, y: number) => readonly [RGB, number] | null;

/**
 * CHUNK×CHUNK world pixels starting at (cx·CHUNK, cy·CHUNK). `stamp` lays buildings, trenches and damage
 * over the landscape (see world/generate.ts); where it covers a pixel, the ground there isn't computed.
 */
export function groundChunk(seed: number, cx: number, cy: number, stamp?: GroundStamp): TileData {
  const rgba = new Uint8ClampedArray(CHUNK * CHUNK * 4);
  const heights = new Uint8Array(CHUNK * CHUNK);
  const glints: number[] = [];
  for (let y = 0, i = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++, i++) {
      const wx = cx * CHUNK + x;
      const wy = cy * CHUNK + y;
      const stamped = stamp?.(wx, wy);
      const [c, h] = stamped ?? groundAt(seed, wx, wy);
      const [r, g, b] = c;
      if (!stamped && (c === WATER.deep || c === WATER.shallow) && hash(seed + 12, wx, wy) < GLINT) glints.push(i);
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
