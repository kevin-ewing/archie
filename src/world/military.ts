// The fronts: trench systems, wire, the cratered strips between them, and the gun batteries behind.
// Pure functions of (seed, world pixel), stamped into the ground tiles by world/generate.ts, so they
// generate as you fly and are exactly the same when you come back.
//
// Fronts are scattered: the world is divided into large regions, and some regions hold a front, a long,
// meandering line at its own angle, several kilometres long, fading out at its ends. Around each line the
// trenches form a maze, as they did [VERIFY specifics]:
//  - "Traversed" fire trenches: ~10 m fire bays staggered by traverses, so a shell or raider in one bay
//    can't sweep the line. In waterlogged Flanders, often built UP as sandbag breastworks.
//  - Support and reserve lines behind; zig-zag communication trenches running back, often at an angle.
//  - Saps pushed out into no-man's land, ending in listening posts; strongpoints (redoubts) behind.
//  - Older, abandoned and collapsing trenches from earlier fighting criss-crossing the area.
//  - Barbed wire belts in front of each fire trench; no-man's land between, a few hundred metres at most.
//  - Shell craters (some water-filled), churned mud, blasted tree stumps.
//  - Batteries well behind: 4-gun field batteries (e.g. British 18-pounders) in horseshoe pits, or
//    2-gun howitzer batteries in round pits, under camouflage netting, with dugouts and a track to the rear.
// Scale: 1 world px ≈ 0.4 m. British on one side of each line, German on the other.

import { cellular, cellularField, fbm, hash, valueNoise, type Cell } from '../core/noise.ts';
import { dirtAt, WATER, type RGB } from './ground.ts';
import { devastationAt, FRONTS, frontField, nearest, type Front, type FrontCoords } from './fronts.ts';
import { DEV } from './settings.ts';

export type Stamp = readonly [RGB, number]; // colour, height (world units, like ground heights)

/** Development: the front's own line (its centre, u = 0), drawn as a thin red line of pixels. */
const FRONT_LINE: RGB = [230, 30, 30];
/** Development: which side is whose, a line behind each side's first level of trenches (u < 0 British). */
const SIDE_LINE: Record<-1 | 1, RGB> = { [-1]: [40, 110, 240], [1]: [245, 200, 30] }; // British blue, German yellow

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const pick = <T>(list: readonly T[], v: number): T => list[Math.min(list.length - 1, Math.max(0, Math.floor(v * list.length)))];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const M = {
  mud: [rgb(0x4f4030), rgb(0x43362a), rgb(0x5a4934)], // wet, churned
  clod: rgb(0x3a2e22),
  bowl: rgb(0x3a2e22),
  rim: [rgb(0x5a4733), rgb(0x4f3e2c)], // muddy, not dry
  pool: WATER.pool, // (ground.ts knows these, so they can sparkle)
  stump: rgb(0x2c241b),
  boards: [rgb(0x6e5a3e), rgb(0x5c4a33)],
  bags: [rgb(0xa69a7a), rgb(0x8e8366), rgb(0x9a8e70)],
  relicFloor: [rgb(0x4f4a33), rgb(0x5a5538)], // old trench, half grown over
  relicBank: [rgb(0x6f6a48), rgb(0x7c7450)],
  wire: rgb(0x77746a),
  post: rgb(0x3b352b),
  earthwork: [rgb(0x6f6249), rgb(0x5e5240)],
  gun: rgb(0x2e2f2a),
  carriage: rgb(0x3f4136),
  net: [rgb(0x56603a), rgb(0x4a4a32), rgb(0x5d5a3c)],
  dugout: rgb(0x2b2620),
  track: rgb(0x6c5a3d),
  tent: [rgb(0xc9c0a4), rgb(0xa89f86)],
  hut: [rgb(0x6f7270), rgb(0x5f6260)],
  crate: [rgb(0x7a6040), rgb(0x5e4a32)],
  wreck: [rgb(0x3b3732), rgb(0x4a4038), rgb(0x6a4a32)], // dark steel, burnt paint, rust
  soot: rgb(0x2a2520),
};
const H = { boards: 0, bags: 3, relic: 1, spoil: 0.6, wire: 0.8, post: 1.5, earthwork: 2.5, gun: 1.5, net: 2, stump: 5, rim: 1.2, mud: 0.4, tent: 3, hut: 4, crate: 2, wreck: 2.5 };
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

// A front's meander and its trenches' small wobble only change over hundreds of px along the line, so
// they're sampled every STEP px (memoised on the front, in plain arrays) and interpolated, instead of
// computing fBm for every pixel.
const STEP = 8;
const memo = new WeakMap<Front, [Float64Array, Float64Array]>();
function slow(seed: number, f: Front, kind: 0 | 1, s: number): number {
  let m = memo.get(f);
  const n = Math.ceil((2 * (f.half + FRONTS.reach)) / STEP) + 3;
  if (!m) memo.set(f, (m = [new Float64Array(n).fill(NaN), new Float64Array(n).fill(NaN)]));
  const arr = m[kind];
  const at = (k: number) => {
    const i = Math.min(n - 1, Math.max(0, k + Math.ceil((f.half + FRONTS.reach) / STEP) + 1));
    let v = arr[i];
    if (v !== v) {
      // Kind 1, the trench lines' small wobble about their places (kind 0 is unused now: the line's course is its curve).
      const sk = k * STEP;
      v = arr[i] = (fbm(seed + 203 + kind + (f.id % 9973), sk / 1500, 0, 2) - 0.5) * 30;
    }
    return v;
  };
  const k = Math.floor(s / STEP);
  const t = s / STEP - k;
  const a0 = at(k);
  return a0 + (at(k + 1) - a0) * t;
}

/** Dug earth is speckled with dark clods and wet mud (in small clumps), like the churned ground round it:
 *  that colour at x, y, about `chance` of the time, else null. Sparse on the bank and the middle of the
 *  spoil (mostly bare dug dirt there), thickening toward the spoil's outer edge where it meets the ground. */
const SPECKLE = { bank: 0.12, spoil: [0.15, 0.5] };
function speckle(seed: number, x: number, y: number, chance: number): RGB | null {
  if (hash(seed + 213, x, y) >= chance + (valueNoise(seed + 214, x / 4, y / 4) - 0.5) * 0.5) return null;
  return hash(seed + 215, x, y) < 0.3 ? M.clod : pick(M.mud, valueNoise(seed + 212, x / 3, y / 3));
}
/** Spoil: the earth thrown up beside a trench, a band of worn dirt fraying out into the ground. */
function spoil(seed: number, x: number, y: number, a: number, inner: number, width: number): Stamp | null {
  if (a < inner || a > inner + width) return null;
  const dirt = dirtAt(seed + 5, x, y, 1 - (a - inner) / width);
  const t = (a - inner) / width; // 0 at the bank … 1 at the outer edge
  return dirt ? [speckle(seed, x, y, SPECKLE.spoil[0] + (SPECKLE.spoil[1] - SPECKLE.spoil[0]) * t * t) ?? dirt, H.spoil] : null;
}

/**
 * A fire trench along a line `line` px across from the front: duckboard floor, sandbag breastworks, spoil
 * beyond. Traverses make it a square wave of small "teeth" (as the air photos show), in an irregular
 * pattern: each bay steps to one side or the other at random, so long runs never look regular.
 */
/** What the last trench() stamp was, for drawing order where walls overlap: 3 a trench floor, 2 its
 *  bank or sandbags, 1 its spoil. (The floor is drawn on top, so walls that cross stay readable.) */
let rank = 0;
function trench(seed: number, x: number, y: number, u: number, s: number, line: number, bay: number, stagger: number, lineId: number, d: number, presence = HASTY.present, follow?: Follow): Stamp | null {
  rank = 1;
  if (Math.abs(u - line) > (DEV.trenchStyle === 'hasty' ? 85 : stagger * 3 + 20)) return null; // too far from this line for its style (cheap early-out)
  if (DEV.trenchStyle === 'hasty') return hasty(seed, x, y, u, s, line, lineId, d, presence, undefined, follow);
  if (hash(seed + 296 + lineId, Math.floor(s / 2400), 0) > presence) return null; // this wall is missing along this stretch
  const k = Math.floor(s / bay);
  const side = (n: number) => (hash(seed + 270 + lineId, n, 0) < 0.5 ? -stagger : stagger);
  const st = side(k);
  const across = u - line - st;
  const pos = s - k * bay;
  // Traverse joins, only where the bay steps across.
  const join = (pos < 2 && side(k - 1) !== st) || (pos > bay - 2 && side(k + 1) !== st);
  const a = Math.abs(across);
  const inJoin = join && Math.abs(u - line) <= stagger + 1;
  if (a <= 1 || inJoin) return (rank = 3), [M.boards[mod(Math.floor(s / 2), 2)], H.boards];
  if (a <= 3 || (join && Math.abs(u - line) <= stagger + 3)) return (rank = 2), [M.bags[(mod(Math.floor(s / 3) + (a > 2 ? 1 : 0), 3) + (d > 0.8 ? 1 : 0)) % 3], H.bags];
  return spoil(seed, x, y, a, 3, 9 + 5 * valueNoise(seed + 271 + lineId, s / 40, 0));
}

/**
 * Hasty: one shallow, scraggly ditch that runs on in long stretches (about a minute's flying each at
 * cruise), broken by short gaps. Within a stretch it kinks this way and that (a new heading every
 * `kink` px, so it's never parallel to the line for long), wanders and jitters, and its ditch and banks
 * swell and pinch, as if dug in a hurry. A low bank of spoil, the odd sandbag, and churned earth heaped
 * round each stretch's ends as well as its sides (a rounded cap). Water and deep woods are masked out
 * per tile (see world/generate.ts); at wood edges and copses tree crowns cover it.
 */
const HASTY = {
  stretch: 2400, // px per stretch slot: ~1 min at cruise (38 px/s); the stretch fills it bar the gap
  gap: [70, 320], // the break at the start of each slot
  shorten: 500, // up to this much more is cut off a stretch's far end (so stretches and gaps vary)
  present: 0.9, // share of slots that hold a stretch
  kink: 110, // px between changes of heading
  offset: 34, // how far across the line each kink point may sit (±half)
  bend: 9, // slow wander
  jitter: 3, // ragged jitter
  reach: 24, // how far a stretch's ditch, banks and spoil can reach from its course
  section: 420, // px: each section of a stretch takes one shape (see HASTY_SHAPES), returning to the line at its ends
  lobe: [14, 32], // px: how far a shape's lobes stand out from the line
};
/** 0 … 1 at u ∈ [−1, 1], round-shouldered and flat-topped (a lobe); `sharp` squares it off. */
const lobe = (u: number, sharp: number) => Math.exp(-(Math.abs(u) ** sharp));
/**
 * The shapes a section can take, like the sides of jigsaw pieces: most stand out as one or two lobes
 * (a tab, with a dip either side like a piece's neck), others wave or step out square. t is 0 … 1 along
 * the section; each returns an offset in units of the section's lobe height, 0 at both ends.
 */
const HASTY_SHAPES: readonly [number, (t: number) => number][] = [
  [0.25, () => 0], // plain: just the kinks
  [0.3, (t) => lobe((t - 0.5) / 0.13, 2.4) - 0.3 * lobe((t - 0.31) / 0.06, 2) - 0.3 * lobe((t - 0.69) / 0.06, 2)], // a tab
  [0.15, (t) => 0.75 * (lobe((t - 0.3) / 0.09, 2.4) + lobe((t - 0.7) / 0.09, 2.4))], // two tabs
  [0.15, (t) => Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * 0.7], // a wave
  [0.15, (t) => lobe((t - 0.5) / 0.2, 7)], // a square step out
];
const SHAPE_TOTAL = HASTY_SHAPES.reduce((a, [w]) => a + w, 0);
// A pixel asks for a ditch's course three times (centre, and either side for the slope), and its
// neighbours ask for the same kink points and sections: the last kink's offsets and the last section's
// shape are kept, so the hashes behind them are worked out once rather than for every call.
// Each wall's last kink and section, remembered between pixels (one slot per wall: neighbouring walls
// are drawn pixel by pixel together, so a single shared slot would be thrown away every call).
const kinkMemos = Array.from({ length: 16 }, () => ({ id: NaN, k: NaN, o0: 0, o1: 0 }));
// Each shape sampled once into a table (looked up and blended between samples: Math.exp per call was a
// tenth of a front tile's time).
const SHAPE_N = 512;
const SHAPE_TABLES = HASTY_SHAPES.map(([, fn]) => Float32Array.from({ length: SHAPE_N + 1 }, (_, i) => fn(i / SHAPE_N)));
const shapeAt = (table: Float32Array, t: number) => {
  const v = Math.min(SHAPE_N, Math.max(0, t * SHAPE_N));
  const i = Math.min(SHAPE_N - 1, Math.floor(v));
  return table[i] + (table[i + 1] - table[i]) * (v - i);
};
const sectionMemos = Array.from({ length: 16 }, () => ({ id: NaN, q: NaN, shape: SHAPE_TABLES[0], height: 0 }));
/** A hasty ditch's course at a point along its line: kink points joined by straight runs, the section's
 *  shape (a tab, a wave, a step…) on top, plus wander and jitter. Continuous along the line. */
function hastyCourse(seed: number, lineId: number, line: number, at: number, rough = true) {
  const id = seed + 276 + lineId * 7;
  const k = Math.floor(at / HASTY.kink);
  const km = kinkMemos[lineId & 15];
  if (km.id !== id || km.k !== k) {
    km.id = id;
    km.k = k;
    km.o0 = (hash(id, k, 3) - 0.5) * HASTY.offset;
    km.o1 = (hash(id, k + 1, 3) - 0.5) * HASTY.offset;
  }
  const o0 = km.o0;
  const o1 = km.o1;
  const q = Math.floor(at / HASTY.section);
  const sm = sectionMemos[lineId & 15];
  if (sm.id !== id || sm.q !== q) {
    let pick = hash(id, q, 4) * SHAPE_TOTAL;
    let shape = SHAPE_TABLES[0];
    for (let n = 0; n < HASTY_SHAPES.length; n++) if ((pick -= HASTY_SHAPES[n][0]) < 0) (shape = SHAPE_TABLES[n]), (pick = Infinity);
    sm.id = id;
    sm.q = q;
    sm.shape = shape;
    sm.height = (hash(id, q, 5) < 0.5 ? -1 : 1) * (HASTY.lobe[0] + hash(id, q, 6) * (HASTY.lobe[1] - HASTY.lobe[0])); // out to one side or the other
  }
  const shape = sm.shape;
  const height = sm.height;
  return (
    line + o0 + ((o1 - o0) / HASTY.kink) * (at - k * HASTY.kink) +
    shapeAt(shape, at / HASTY.section - q) * height +
    (valueNoise(seed + 273 + lineId, at / 35, 0) - 0.5) * HASTY.bend +
    (rough ? (valueNoise(seed + 277 + lineId, at / 7, 0) - 0.5) * HASTY.jitter : 0)
  );
}
/** Where a hasty wall's stretch in slot c runs along the line: [start, end] (whether it's there at all is hash(id, c, 0) ≤ presence). */
function stretchOf(id: number, phase: number, c: number) {
  return [
    c * HASTY.stretch + HASTY.gap[0] + hash(id, c, 1) * (HASTY.gap[1] - HASTY.gap[0]) - phase,
    (c + 1) * HASTY.stretch - hash(id, c, 2) * HASTY.shorten - phase,
  ] as const;
}
/**
 * Near water (0 … 1, set per pixel by militaryTile): trenches widen as they near a shore, their floors
 * flooding, and end at the water's edge as if running on under it. SHORE_FLARE: the band, in wetness
 * (about 40 px of ground; wetness changes ~0.006 per 35 px near a shore).
 */
let wetFlare = 0;
const SHORE_FLARE = 0.007;
/** Two walls whose ditches come within MERGE.snap px share one path there (easing apart by snap + ease). */
//  - Closer than `snap`, the wall behind runs exactly in the one in front's ditch: one shared path.
//  - From snap to snap + ease it's drawn pulled in, its gap closing to nothing at snap, so it bends in
//    to meet the other ditch cleanly rather than running alongside it.
//  - Only where the wall in front is actually dug (not in one of its gaps).
const MERGE = { snap: 16, ease: 12 };
type Follow = { id: number; line: number; presence: number };
/** Is a hasty wall (lineId, at this presence) dug at s, within one of its stretches? */
function wallDug(seed: number, lineId: number, presence: number, s: number) {
  const id = seed + 276 + lineId * 7;
  const phase = hash(id, 7, 7) * HASTY.stretch;
  const c = Math.floor((s + phase) / HASTY.stretch);
  if (hash(id, c, 0) > presence) return false;
  const [start, stop] = stretchOf(id, phase, c);
  return s >= start && s <= stop;
}
/**
 * `span`: one stretch from span[0] to span[1] along the line, instead of the usual stretches and gaps.
 * `follow`: the wall in front; where this one's ditch comes close to its ditch, it runs in the same one.
 */
function hasty(seed: number, x: number, y: number, u: number, s: number, line: number, lineId: number, d: number, presence = HASTY.present, span?: readonly [number, number], follow?: Follow): Stamp | null {
  const id = seed + 276 + lineId * 7;
  const phase = hash(id, 7, 7) * HASTY.stretch; // each wall's stretches and gaps fall in their own places
  const c0 = Math.floor((s + phase) / HASTY.stretch);
  let beyond = Infinity; // how far past the nearest stretch's end (≤ 0: alongside it)
  let sc = s; // the point along the line where that stretch is nearest
  let cell = c0;
  if (span) (beyond = Math.max(span[0] - s, s - span[1])), (sc = Math.max(span[0], Math.min(span[1], s)));
  // A stretch's end cap can reach into the neighbouring slot, so check those too.
  else for (let c = c0 - 1; c <= c0 + 1; c++) {
    if (hash(id, c, 0) > presence) continue;
    const [start, end] = stretchOf(id, phase, c);
    const b = Math.max(start - s, s - end);
    if (b < beyond) (beyond = b), (sc = Math.max(start, Math.min(end, s))), (cell = c);
  }
  if (beyond > HASTY.reach) return null;
  if (follow && !wallDug(seed, follow.id, follow.presence, sc)) follow = undefined; // nothing in front to share
  // Far from both this wall's ditch and the one in front (a shared path runs between the two): nothing.
  if (follow && beyond <= 0 && Math.abs(u - line) > HASTY_SPREAD && Math.abs(u - follow.line) > HASTY_SPREAD) return null;
  // How far this ditch is pulled in toward the one in front, worked out once for this pixel. Measured
  // without their fine jitter (so the join doesn't flicker along a near miss).
  let gap = Infinity;
  if (follow) {
    const f = follow;
    const sep = Math.abs(hastyCourse(seed, lineId, line, sc, false) - hastyCourse(seed, f.id, f.line, sc, false));
    // (A linear ramp; the capped heading below keeps the bend in from smearing into streaks.)
    gap = sep <= MERGE.snap ? 0 : sep < MERGE.snap + MERGE.ease ? ((MERGE.snap + MERGE.ease) * (sep - MERGE.snap)) / MERGE.ease : sep;
    if (gap >= sep) follow = undefined; // not pulled in at all here
  }
  const course = (at: number) => {
    const own = hastyCourse(seed, lineId, line, at);
    if (!follow) return own;
    const other = hastyCourse(seed, follow.id, follow.line, at);
    return other + Math.sign(own - other) * Math.min(gap, Math.abs(own - other));
  };
  // Cheap check first: the furthest this section of ditch can stray from the line (its kinks, its shape,
  // wander and jitter), so most pixels near a wall but off its ditch skip tracing the course.
  const centre = course(sc); // (also fills this wall's kink and section slots for sc)
  const km = kinkMemos[lineId & 15];
  const sm = sectionMemos[lineId & 15];
  const stray = Math.max(Math.abs(km.o0), Math.abs(km.o1)) + Math.abs(sm.height) + (HASTY.bend + HASTY.jitter) / 2;
  if (!follow && Math.abs(u - line) - stray > HASTY.reach && beyond <= 0) return null;
  // The ditch's heading here (tabs have steep flanks). Capped: the distance below is only good for a ditch
  // that runs along the front more than across it; steeper, it would smear the banks into streaks.
  const slope = Math.max(-2, Math.min(2, (course(sc + 2) - centre) / 2));
  const across = (u - centre) / Math.sqrt(1 + slope * slope);
  const best = beyond > 0 ? Math.hypot(across, beyond) : Math.abs(across);
  const cap = beyond > -4 ? Math.min(1, (beyond + 4) / 6) : 0; // 0 along the sides … 1 past an end
  if (best > HASTY.reach) return null;
  // The ditch and its bank swell and pinch along their length (ragged, uneven digging), edges dithered.
  const swell = valueNoise(seed + 269 + lineId, s / 14, 0);
  const ditch = (0.6 + swell * 0.9 + (d - 0.5) * 0.5) * (1 + 1.8 * wetFlare);
  const bank = ditch + 1 + swell * 0.8 + cap + 2 * wetFlare;
  if (best <= ditch) return (rank = 3), [wetFlare > 0.45 && best <= ditch * (wetFlare - 0.2) ? M.pool[d < 0.5 ? 0 : 1] : M.mud[d < 0.5 ? 1 : 0], 0];
  if (best <= bank) return (rank = 2), hash(seed + 278 + lineId, Math.floor(s / 3), cell) < 0.15 ? [M.bags[1], H.bags - 1.5] : [speckle(seed, x, y, SPECKLE.bank) ?? M.earthwork[d < 0.5 ? 0 : 1], H.spoil + 0.4];
  // The spoil bank, heaped wider round the ends.
  return spoil(seed, x, y, best, bank, 5 + 4 * valueNoise(seed + 279 + lineId, s / 30, 0) + cap * 6);
}

/**
 * Each side's walls (fire trench, then up to three more behind it): how many there are varies along the
 * front, each wall comes and goes on its own (its own stretches and gaps), sits a random distance behind
 * the one in front, and wanders on its own, so they drift together and apart and sometimes touch (where
 * they overlap, trench floors are drawn on top: see `rank`).
 */
const WALLS = {
  presence: [0.97, 0.75, 0.5, 0.3], // how often each wall (fire trench first) is there, before the regional mix below
  spacing: [35, 75], // px from one wall to the next behind it
  wander: [30, 10], // px: each wall's own slow (~1.4 km) and quicker (~450 px) wander
  bay: [22, 30, 36, 40], // traversed: bay length per wall
  stagger: [3, 2, 2, 2], // traversed: how far each bay steps
  // Hasty: the odd trench straight back from the fire trench, through every wall behind it and on past the
  // last (toward the next layer back): one chance per slot along the front, per side.
  across: { slot: 600, chance: 0.5, past: [40, 140] }, // past: px beyond the furthest wall's place
  // Toward a front's ends the walls give out from the back: wall k thins out (in whole stretches) as the
  // front's `end` falls from fade[k] + 0.25 to fade[k], and is gone below. The fire trench (and its wire and
  // saps) instead peters out last, over the final LEAD of the easing (see `leading`). No wall moves.
  fade: [0, 0.25, 0.45, 0.65],
};
/** How much of wall k is left this near the front's end (1: all of it; see WALLS.fade). */
const wallFade = (k: number, end: number) => (k === 0 ? 1 : smooth((end - WALLS.fade[k]) / 0.25));
/** How far any of a hasty ditch reaches from its unkinked line (kinks, lobes, wander, banks and spoil). */
const HASTY_SPREAD = HASTY.offset / 2 + HASTY.lobe[1] + HASTY.bend + HASTY.jitter + HASTY.reach;
/** A wall's place before its own kinks: where its line wanders to at s (u, signed). */
function wallLine(seed: number, side: number, nml: number, fid: number, s: number, id: number, off: number) {
  return (
    side * (nml + 12 + off) +
    (valueNoise(seed + 290 + id, s / 1400, fid % 101) - 0.5) * 2 * WALLS.wander[0] +
    (valueNoise(seed + 292 + id, s / 450, fid % 101) - 0.5) * 2 * WALLS.wander[1]
  );
}
/** Scratch for walls(), one entry per wall of a side (reused for every pixel: no allocation per pixel). */
const AHEAD = Array.from({ length: 4 }, () => ({ id: 0, off: 0, k: 0, line: NaN, presence: 0 }));
function walls(seed: number, x: number, y: number, u: number, s: number, nml: number, end: number, fid: number, d: number): Stamp | null {
  let best: Stamp | null = null;
  let bestRank = 0;
  const reach = 95 + WALLS.wander[0] + WALLS.wander[1]; // the furthest anything of a wall can be from its unwandered place
  for (const side of [-1, 1]) {
    let regional = -1; // (worked out only if a wall on this side is close)
    let off = 0;
    let last = 0; // the furthest wall still there this near the front's end (its off)
    let ahead = 0; // the walls in front of this one on this side so far (in AHEAD, nearest last)
    for (let k = 0; k < WALLS.presence.length; k++) {
      const lineId = (side < 0 ? 1 : 5) + k;
      if (k > 0) off += WALLS.spacing[0] + hash(seed + 291 + fid, lineId, 0) * (WALLS.spacing[1] - WALLS.spacing[0]);
      const slot = AHEAD[ahead++];
      slot.id = lineId;
      slot.off = off;
      slot.k = k;
      slot.line = NaN; // (its place worked out only if needed: by itself, or a wall behind it)
      slot.presence = 0;
      if (wallFade(k, end) > 0) last = off;
      if (Math.abs(u - side * (nml + 12 + off)) > reach || wallFade(k, end) <= 0) continue; // nowhere near this wall: skip drawing it
      // How many walls this stretch of this side has: a slow regional mix, so some stretches have one, some four.
      if (regional < 0) regional = 0.55 + 0.9 * valueNoise(seed + 295 + (fid % 97), s / 9000, side); // (as wallPresence)
      const line = (slot.line = wallLine(seed, side, nml, fid, s, lineId, off));
      slot.presence = Math.min(1, WALLS.presence[k] * regional) * wallFade(k, end);
      if (Math.abs(u - line) > 95) continue; // too far from this wall for anything of it (cheap)
      // Where it comes close to the wall in front, it runs in that wall's ditch for a while (no crossings).
      let follow: Follow | undefined;
      if (DEV.trenchStyle === 'hasty' && ahead >= 2) {
        const w = AHEAD[ahead - 2];
        if (Number.isNaN(w.line)) (w.line = wallLine(seed, side, nml, fid, s, w.id, w.off)), (w.presence = Math.min(1, WALLS.presence[w.k] * regional) * wallFade(w.k, end));
        follow = w;
      }
      const t = trench(seed, x, y, u, s, line, WALLS.bay[k], WALLS.stagger[k], lineId, d, slot.presence, follow);
      if (t && rank > bestRank) {
        best = t;
        bestRank = rank;
        if (rank === 3) return best; // a trench floor: nothing goes over it
      }
    }
    if (DEV.trenchStyle !== 'hasty' || side !== (u < 0 ? -1 : 1)) continue;
    // A sap out from the fire trench into no-man's land, if one is near.
    const sp = sapAt(seed, side, s, nml, fid, end);
    if (sp) {
      const t = sap(seed, x, y, u * side, s, sp, d);
      const r = rank === 3 ? 3 : rank / 4; // (dug after the fire trench, out of it: its floor joins it)
      if (t && r > bestRank) {
        best = t;
        bestRank = r;
        if (r === 3) return best;
      }
    }
    // The trench back across the walls: in its slot, kept clear of the slot's ends by more than its spread.
    const A = WALLS.across;
    const slot = Math.floor(s / A.slot);
    const cs = slot * A.slot + HASTY_SPREAD + hash(seed + 297 + fid, slot, side) * (A.slot - 2 * HASTY_SPREAD);
    if (Math.abs(s - cs) > HASTY_SPREAD || hash(seed + 298 + fid, slot, side) > A.chance || !fireThere(seed, side, cs, fid, end)) continue;
    const a = u * side; // px away from the divide
    const fire = nml + 12; // the fire trench's unwandered place
    const far = fire + last + WALLS.wander[0] + WALLS.wander[1] + A.past[0] + hash(seed + 299 + fid, slot, side) * (A.past[1] - A.past[0]);
    if (a < fire - 60 || a > far + HASTY.reach) continue;
    // It starts in the fire trench's own ditch (where that runs at cs), so the two join with no stub in front.
    const start = side * hastyCourse(seed, side < 0 ? 1 : 5, fireLine(seed, side, nml, cs, fid), cs);
    const lineId = (side < 0 ? 9 : 10) + 16 * mod(slot, 4096); // its own memo slot (lineId & 15), its own shape
    const t = hasty(seed, x, y, s - cs, a, 0, lineId, d, 1, [start, far]);
    // Dug first: its bank and spoil lie under the walls' (theirs is thrown on top), but its floor still
    // cuts through them, so the two read as joined.
    const r = rank === 3 ? 3 : rank / 4;
    if (t && r > bestRank) {
      best = t;
      bestRank = r;
      if (r === 3) return best;
    }
  }
  return best;
}

/** How often a side's wall k is there at s (its own chance × the slow regional mix of how many walls a stretch has). */
const wallPresence = (seed: number, side: -1 | 1, k: number, s: number, fid: number) =>
  Math.min(1, WALLS.presence[k] * (0.55 + 0.9 * valueNoise(seed + 295 + (fid % 97), s / 9000, side)));
/**
 * Is a side's fire trench actually dug at s, at least `margin` px from either end of its stretch? Saps and
 * cross trenches start only where it is, so none ever begins in a gap, cut off from the trench it leaves.
 * (Hasty only; `end` is the front's easing out toward its ends, whose gaps take whole 300 px stretches.)
 */
function fireThere(seed: number, side: -1 | 1, s: number, fid: number, end: number, margin = 50) {
  if (!leading(seed, fid, end, Math.floor(s / 300))) return false;
  if (!leading(seed, fid, end, Math.floor((s - margin) / 300)) || !leading(seed, fid, end, Math.floor((s + margin) / 300))) return false;
  const id = seed + 276 + (side < 0 ? 1 : 5) * 7; // (as hasty() works out the fire trench's id)
  const phase = hash(id, 7, 7) * HASTY.stretch;
  const c = Math.floor((s + phase) / HASTY.stretch);
  if (hash(id, c, 0) > wallPresence(seed, side, 0, s, fid)) return false;
  const [start, stop] = stretchOf(id, phase, c);
  return s >= start + margin && s <= stop - margin;
}
/** Where a side's fire trench (its first wall) wanders to at s, before its own kinks and shapes: u, signed. */
function fireLine(seed: number, side: -1 | 1, nml: number, s: number, fid: number) {
  const id = side < 0 ? 1 : 5; // the fire trench's lineId (see walls)
  return (
    side * (nml + 12) +
    (valueNoise(seed + 290 + id, s / 1400, fid % 101) - 0.5) * 2 * WALLS.wander[0] +
    (valueNoise(seed + 292 + id, s / 450, fid % 101) - 0.5) * 2 * WALLS.wander[1]
  );
}

/**
 * Saps: narrow trenches pushed out from the fire trench into no-man's land, through (or nearly through)
 * their own wire, each ending in a listening post (a small sandbagged pit, where men lay out at night
 * listening for the enemy). Dug hastily like the walls, ragged and kinking. The wire is left open round
 * each one (see wire), thinning out to either side of it.
 */
//  - British: under an "active front" policy (own no-man's land: patrol, raid, push forward), saps were
//    many and long, and before an attack were dug out further as jumping-off points (at the Somme, shallow
//    saps ran from the British line well out into no-man's land). Some end in a T-head, a short crosspiece.
//  - German: holding ground, relying on deep wire and dugouts: fewer, shorter saps, mostly reaching only
//    into or just past their own wire, to a small round post.
const SAPS = {
  slot: 380,
  keep: 22, // px short of the divide
  post: [2.6, 4.8], // listening post: pit and sandbag ring radii
  british: { chance: 0.6, length: [70, 175], tee: 0.45, arm: [8, 18] }, // tee: share with a T-head; arm: its half-length
  german: { chance: 0.25, length: [35, 85], tee: 0, arm: [0, 0] },
};
type Sap = { cs: number; start: number; end: number; lineId: number; arm: number };
/** The sap in this slot of the front, if it has one (cs: where along the front; start, end: px from the divide). */
export function sapAt(seed: number, side: -1 | 1, s: number, nml: number, fid: number, frontEnd: number): Sap | null {
  const slot = Math.floor(s / SAPS.slot);
  const kind = side < 0 ? SAPS.british : SAPS.german;
  if (hash(seed + 340 + fid, slot, side) > kind.chance) return null;
  const cs = slot * SAPS.slot + HASTY_SPREAD + hash(seed + 341 + fid, slot, side) * (SAPS.slot - 2 * HASTY_SPREAD);
  if (Math.abs(s - cs) > HASTY_SPREAD || !fireThere(seed, side, cs, fid, frontEnd)) return null;
  // It starts in the fire trench's own ditch (where that runs at cs), so the two join.
  const start = side * hastyCourse(seed, side < 0 ? 1 : 5, fireLine(seed, side, nml, cs, fid), cs);
  const end = Math.max(SAPS.keep, start - (kind.length[0] + hash(seed + 342 + fid, slot, side) * (kind.length[1] - kind.length[0])));
  const arm = hash(seed + 343 + fid, slot, side) < kind.tee ? kind.arm[0] + hash(seed + 344 + fid, slot, side) * (kind.arm[1] - kind.arm[0]) : 0;
  return { cs, start, end, lineId: (side < 0 ? 11 : 12) + 16 * mod(slot, 4096), arm };
}
/** A sap, a px from the divide: its ditch (a hasty one, run outwards), then the listening post at its head. */
function sap(seed: number, x: number, y: number, a: number, s: number, sp: Sap, d: number): Stamp | null {
  if (a < sp.end - 12 || a > sp.start + HASTY.reach || Math.abs(s - sp.cs) > HASTY_SPREAD + sp.arm) return null;
  const head = sp.cs + hastyCourse(seed, sp.lineId, 0, sp.end);
  const r = Math.hypot(s - head, a - sp.end);
  if (sp.arm) {
    // A T-head: a short ragged crosspiece along the front, floor and a low bank.
    const off = Math.abs(a - sp.end) + (hash(seed + 345, x, y) - 0.5) * 0.8;
    const past = Math.max(0, Math.abs(s - head) - sp.arm);
    const dist = Math.hypot(off, past);
    if (dist <= 1.3) return (rank = 3), [M.mud[d < 0.5 ? 1 : 0], 0];
    if (dist <= 3) return (rank = 2), [speckle(seed, x, y, SPECKLE.bank) ?? M.earthwork[d < 0.5 ? 0 : 1], H.spoil + 0.4];
    if (dist <= 8 && Math.abs(s - head) < sp.arm + 8) {
      const sp2 = spoil(seed, x, y, dist, 3, 5);
      if (sp2) return (rank = 1), sp2;
    }
  }
  if (r <= SAPS.post[0]) return (rank = 3), [M.mud[1], 0];
  if (r <= SAPS.post[1]) return (rank = 2), [M.bags[d < 0.5 ? 0 : 1], H.bags - 1];
  return hasty(seed, x, y, s - sp.cs, a, 0, sp.lineId, d, 1, [sp.end, sp.start]);
}

/**
 * Barbed wire in front of each side's fire trench, following its course, in each army's own way:
 *  - German: deep, dense entanglements, two belts (at the Somme in 1916, each about 30 yd deep, some
 *    15 yd apart), rows of staggered pickets laced together every which way, with few gaps. Scaled down
 *    here to fit the game's narrower no-man's land.
 *  - British: a single, thinner belt, put out at night by working parties, either a double-apron fence
 *    (one row of pickets, wires slanting down to pegs either side) or concertina coils; patchier, with
 *    more gaps left for patrols.
 * Both stop short of the divide (`keep`), so neither's wire ever runs into the other's.
 */
const WIRE = {
  clear: 26, // px from the fire trench's ditch to its wire's near edge (past its bank and spoil)
  keep: 12, // px each side of the divide left open
  slot: 320, // px along the front: each slot may have a gap (a lane) in each belt, and picks the British kind
  wobble: 5, // px: each belt (and each row of coils) drifts in and out on its own, so none run quite parallel
  fade: [8, 30], // px: how far the wire thins out, speckled, into a gap (as if cut, buried, or still going up)
  thin: 0.3, // below this (a slow noise along the front) the wire is thin and patchy for a while
  // Each belt is laid in pieces, a working party's night each, never quite lined up with the next: each
  // sits a little in or out, at a slight angle, overlapping or falling short of its neighbours.
  piece: { length: [18, 55], overlap: 10, shift: 6, tilt: 0.2, missing: 0.06, ends: 6 },
  tangle: { cell: [26, 14], chance: 0.22, size: [1.5, 4] }, // loose knots of wire thrown about the belts
  german: { depth: [22, 34], gap: [12, 20], rows: [3, 4], pitch: [7, 10], lanes: 0.2, cover: 0.85 },
  british: { depth: [14, 22], pitch: [7, 10], coil: [3, 4], concertina: 0.4, lanes: 0.55, cover: 0.95 },
};
const WIRE_REACH = HASTY.offset / 2 + HASTY.lobe[1] + HASTY.bend; // how far the fire trench's ditch strays from fireLine
/** Is this stamp barbed wire (or its pickets)? (For tests.) */
export const isWire = (st: Stamp | null) => st?.[0] === M.wire || st?.[0] === M.post;
/** Is this stamp the shelled ground (churned mud, clods, shell holes), not a work dug or built? (By colour
 *  and height together: the trenches use some of the same colours, at other heights.) */
const SHELLED = new Map<RGB, readonly number[]>([...M.mud.map((c) => [c, [H.mud]] as const), [M.clod, [H.mud, 0.1]], [M.bowl, [0.2]], ...M.rim.map((c) => [c, [H.rim]] as const), ...WATER.pool.map((c) => [c, [0.05]] as const)]);
export const isChurned = (st: Stamp | null) => !!st && !!SHELLED.get(st[0])?.includes(st[1]);
function wire(seed: number, x: number, y: number, u: number, s: number, nml: number, fid: number, d: number, end: number): Stamp | null {
  const side = u < 0 ? -1 : 1;
  const a = u * side; // px from the divide
  if (a < WIRE.keep) return null;
  const line = fireLine(seed, side, nml, s, fid);
  const g = WIRE.german;
  const b = WIRE.british;
  const pc = WIRE.piece;
  const tg = WIRE.tangle;
  const spread = WIRE.wobble + pc.shift + (pc.tilt * pc.length[1]) / 2 + tg.size[1]; // how far a piece can sit from its belt's place
  const most = WIRE.clear + 2 * g.depth[1] + g.gap[1] + spread; // the deepest wire reaches this far in front of the trench
  const rough = side * line - a; // px in front of the fire trench's line, before its kinks
  if (rough < WIRE.clear - spread - WIRE_REACH - 1 || rough > most + WIRE_REACH) return null; // (cheap)
  const trench = side * (DEV.trenchStyle === 'hasty' ? hastyCourse(seed, side < 0 ? 1 : 5, line, s, false) : line);
  const t0 = trench - a - WIRE.clear; // px in front of where the wire starts
  if (t0 < -spread || t0 > most) return null;
  // Open round a sap: the wire thins out to either side of it.
  let open = 1;
  const sp = DEV.trenchStyle === 'hasty' ? sapAt(seed, side, s, nml, fid, end) : null;
  if (sp && a > sp.end - 8) {
    const along = sp.cs + hastyCourse(seed, sp.lineId, 0, Math.max(sp.end, Math.min(sp.start, a)), false);
    open = smooth((Math.abs(s - along) - 5) / 10);
    if (open <= 0) return null;
  }
  const slot = Math.floor(s / WIRE.slot);
  const fs = fid % 89;
  const span = (r: readonly number[], h: number) => r[0] + h * (r[1] - r[0]);
  /** A belt's own slow drift in and out, ± `wobble` px. */
  const drift = (k: number, scale = 160) => (valueNoise(seed + 310 + side * 8 + k, s / scale, fs) - 0.5) * 2 * WIRE.wobble;
  /** 1 in the wire, easing to 0 across a gap: the wire thins out into it rather than stopping dead. */
  const lane = (belt: number, chance: number) => {
    const h = hash(seed + 303 + fid, slot, side * 4 + belt);
    if (h > chance) return 1;
    const at = slot * WIRE.slot + 50 + hash(seed + 304 + fid, slot, side * 4 + belt) * (WIRE.slot - 100);
    const half = 5 + (h / chance) * 4; // a bare gap 10–18 px wide
    return smooth((Math.abs(s - at) - half) / span(WIRE.fade, hash(seed + 308 + fid, slot, side * 4 + belt)));
  };
  // Variation all through it: long thin stretches, knots and thin spots, edges that speckle out.
  const stretch = 0.25 + 0.75 * smooth((valueNoise(seed + 314 + side, s / 500, fs) - WIRE.thin) / 0.2);
  const edge = (w: number, D: number) => 0.35 + 0.65 * smooth(Math.min(w, D - w) / 4);
  // Wire sags and tangles: nudge where each pixel falls in the pattern, more in some places than others.
  const sag = (0.6 + 1.6 * valueNoise(seed + 316 + side, s / 300, fs)) * (side > 0 ? 1.4 : 0.8); // (German: more of it, more tangled)
  const oct = (k: number) =>
    (valueNoise(seed + k, x / 13, y / 13) - 0.5) * 3.2 +
    (valueNoise(seed + k + 40, x / 5, y / 5) - 0.5) * 1.6 +
    (valueNoise(seed + k + 80, x / 1.8, y / 1.8) - 0.5) * 0.9;
  const ns = oct(305) * sag;
  const nw = oct(306) * sag;
  const near = (v: number, w: number) => Math.abs(v - Math.round(v)) * w; // px from the nearest of a family of lines w px apart
  const keepWire = (cover: number): Stamp | null => (d < cover ? [M.wire, H.wire] : null);
  // A picket outlasts its wire into a thinning stretch (a fence half built, or half gone).
  const keepPost = (f: number, id: number): Stamp | null => (f > 0.12 + 0.35 * hash(seed + 313 + fid, id, side) ? [M.post, H.post] : null);
  type Draw = (w: number, ww: number, ps: number, f: number, c: number) => Stamp | null;
  /** One belt, laid in pieces (see WIRE.piece), starting `start` px out and D deep; `draw` draws one piece. */
  const belt = (k: number, start: number, D: number, chance: number, draw: Draw): Stamp | null => {
    const L = (pc.length[0] + pc.length[1]) / 2;
    const key = side * 4 + k;
    const cut = (c: number) => c * L + (hash(seed + 321 + fid, c, key) - 0.5) * (pc.length[1] - pc.length[0]);
    const c0 = Math.floor(s / L);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      const lo = cut(c);
      const hi = cut(c + 1) + hash(seed + 322 + fid, c, key) * pc.overlap;
      if (s < lo || s > hi || hash(seed + 323 + fid, c, key) < pc.missing) continue;
      const tilt = (hash(seed + 325 + fid, c, key) - 0.5) * 2 * pc.tilt;
      const w = t0 - start - (hash(seed + 324 + fid, c, key) - 0.5) * 2 * pc.shift - (s - (lo + hi) / 2) * tilt;
      if (w < 0 || w > D) continue;
      const f =
        open * lane(k, chance) * stretch * edge(w, D) *
        (0.45 + 0.8 * valueNoise(seed + 315 + side, s / 45, w / 10)) * // knots and thin spots
        (0.5 + 0.8 * valueNoise(seed + 333 + side, s / 11, w / 3.5)) * // smaller clumps and holes
        (valueNoise(seed + 334, x / 2.2, y / 2.2) > 0.28 ? 1 : 0.25) * // strands broken into fragments
        (0.6 + 0.6 * hash(seed + 327 + fid, c, key)) * // some parties laid it thicker than others
        (0.4 + 0.6 * smooth(Math.min(s - lo, hi - s) / pc.ends)); // each piece's ends straggle out
      if (f <= 0) continue;
      const hit = draw(w, w + nw, s + hash(seed + 326 + fid, c, key) * 40, f, c); // (each piece's pattern falls differently)
      if (hit) return hit;
    }
    return null;
  };
  /** Loose knots of wire about the belts, as if dropped or blown there. */
  const tangle = (): Stamp | null => {
    if (t0 < -4 || open < 0.6) return null;
    const [cs, cw] = tg.cell;
    const i = Math.floor(s / cs);
    const j = Math.floor(t0 / cw);
    const key = side * 64 + j;
    if (hash(seed + 328 + fid, i, key) > tg.chance * stretch) return null;
    const r = span(tg.size, hash(seed + 329 + fid, i, key));
    const cx = (i + 0.5) * cs + (hash(seed + 330 + fid, i, key) - 0.5) * (cs - 2 * r);
    const cy = (j + 0.5) * cw + (hash(seed + 331 + fid, i, key) - 0.5) * (cw - 2 * r);
    const dd = Math.hypot(s - cx, t0 - cy);
    return dd <= r && valueNoise(seed + 332, x / 1.3, y / 1.3) > 0.42 + 0.3 * (dd / r) ? [M.wire, H.wire] : null;
  };
  if (side > 0) {
    // German: two belts, each rows of staggered pickets laced along and diagonally between rows.
    const D0 = span(g.depth, valueNoise(seed + 300 + (fid % 97), s / 700, 0));
    const D1 = span(g.depth, valueNoise(seed + 309 + (fid % 97), s / 650, 0));
    const start0 = drift(0);
    const start1 = start0 + D0 + span(g.gap, valueNoise(seed + 301 + (fid % 97), s / 900, 0)) + drift(1);
    const german = (k: number, D: number): Draw => (w, ww, ps, f, c) => {
      const rows = Math.round(span(g.rows, hash(seed + 317 + fid, k, c)));
      const Q = D / rows; // px between rows of pickets
      const P = span(g.pitch, hash(seed + 318 + fid, k, c));
      const r = Math.floor(w / Q);
      // A picket every P px along each row, each row offset half a pitch from the last.
      if (Math.abs(w - (r + 0.5) * Q) < 0.8 && near(ps / P - r / 2, P) < 0.8) return keepPost(f, Math.round(ps / P - r / 2) * 16 + k * 8 + r);
      const q = ww / Q;
      const p = (ps + ns) / P;
      const kk = 1 / Math.hypot(1 / P, 1 / (2 * Q)); // px per unit of the diagonal families
      const on = near(p - q / 2 + 0.25, kk) < 0.55 || near(p + q / 2 - 0.25, kk) < 0.55 || near(q - 0.5, Q) < 0.5;
      return on ? keepWire(g.cover * f) : null;
    };
    return belt(0, start0, D0, g.lanes, german(0, D0)) ?? belt(1, start1, D1, g.lanes, german(1, D1)) ?? tangle();
  }
  // British: one belt, a double-apron fence or concertina coils (a few pieces running of each).
  const D = span(b.depth, valueNoise(seed + 302 + (fid % 97), s / 600, 0));
  const mid = D / 2;
  const british: Draw = (w, ww, ps, f, c) => {
    const P = span(b.pitch, hash(seed + 319 + fid, c, 0));
    const pt = ps + ns;
    if (hash(seed + 307 + fid, Math.floor(c / 3), 0) < b.concertina) {
      // Concertina: two rows of coils along the belt's middle, pickets every so often.
      const coil = span(b.coil, hash(seed + 320 + fid, c, 0));
      if (Math.abs(w - mid) < 0.8 && near(ps / (P * 1.5), P * 1.5) < 0.8) return keepPost(f, Math.round(ps / (P * 1.5)));
      const step = 2.2; // px between the coil's loops
      for (const cc of [mid - coil + drift(2, 90) * 0.3, mid + coil + drift(3, 90) * 0.3]) {
        if (Math.abs(ww - cc) > coil + 0.6) continue;
        for (let i = Math.ceil((pt - coil - 0.6) / step); i * step <= pt + coil + 0.6; i++) {
          if (Math.abs(Math.hypot(pt - i * step, ww - cc) - coil) < 0.5) return keepWire(b.cover * f);
        }
      }
      return null;
    }
    // Double apron: pickets down the middle, wires slanting down to pegs at both edges, and wires along.
    if (Math.abs(w - mid) < 0.8 && near(ps / P, P) < 0.8) return keepPost(f, Math.round(ps / P));
    if ((w < 0.8 || w > D - 0.8) && near(ps / P - 0.5, P) < 0.6) return f > 0.3 ? [M.post, H.spoil] : null; // the pegs
    const along = [0.12, 0.5, 0.88].some((at, i) => Math.abs(ww - at * D - drift(4 + i, 120) * 0.25) < 0.5);
    const slant = near((pt - (Math.abs(ww - mid) / mid) * (P / 2)) / P, P) < 0.5; // each picket's wires run out to pegs half a pitch along
    return along || slant ? keepWire(b.cover * f) : null;
  };
  return belt(0, drift(0), D, b.lanes, british) ?? tangle();
}

/** A sinuous trench (communication trench, network trench) around a centre line: `offset` px across it. */
function winding(seed: number, x: number, y: number, along: number, offset: number, id: number, d: number, relic = false): Stamp | null {
  const wiggle = (valueNoise(seed + 272 + id, along / 16, 0.5) - 0.5) * 9 + (valueNoise(seed + 273 + id, along / 5, 0.5) - 0.5) * 2;
  const a = Math.abs(offset - wiggle);
  if (a <= 0.9) return relic ? [M.relicFloor[d < 0.5 ? 0 : 1], 0] : [M.boards[0], H.boards];
  if (a <= 2.5) return relic ? [M.relicBank[d < 0.6 ? 0 : 1], H.relic] : [M.bags[mod(Math.floor(along / 3), 2)], H.bags - 0.5];
  return relic ? null : spoil(seed, x, y, a, 2.5, 6);
}

/** One battery position, centred at (ub, sb) in front coordinates, facing `face` (±1 across the line). */
function battery(seed: number, u: number, s: number, ub: number, sb: number, face: 1 | -1, kind: number, d: number): Stamp | null {
  const howitzer = kind > 0.65; // fewer, bigger, rounder pits; short fat barrels
  const guns = howitzer ? 2 : 4;
  const spacing = howitzer ? 34 : 24;
  const pitR = howitzer ? 10 : 8;
  const k = Math.max(0, Math.min(guns - 1, Math.round((s - sb) / spacing + (guns - 1) / 2)));
  const du = (u - ub) * face; // + toward the enemy
  const dv = s - (sb + (k - (guns - 1) / 2) * spacing);
  const r = Math.hypot(du, dv);
  if (r < pitR && hash(seed + 230, Math.round(u * 7), Math.round(s * 3)) < 0.28) return [pick(M.net, d), H.net]; // camouflage netting
  const barrel = howitzer ? 4 : 6;
  if (Math.abs(dv) <= (howitzer ? 1 : 0.6) && du >= -2 && du <= barrel) return [M.gun, H.gun];
  if (Math.abs(du) <= 1.2 && Math.abs(dv) <= 2) return [M.carriage, H.gun];
  if (Math.abs(du) <= 1 && Math.abs(Math.abs(dv) - 3) <= 0.6) return [M.gun, H.gun]; // wheels
  const open = howitzer ? false : du > 3 && Math.abs(dv) < 4; // field-gun pits are horseshoes, open to the front
  if (r > pitR - 3 && r < pitR + 0.5 && !open) return [M.earthwork[Math.floor(r) & 1], H.earthwork];
  // Ammunition dugout behind the guns, stacked shell crates, and the worn track to the rear.
  const bu = (u - ub) * face;
  const bv = s - sb;
  if (bu > -18 && bu < -12 && Math.abs(bv) < 7) return Math.abs(bv) > 5 || bu < -17 ? [M.bags[1], H.bags] : [M.dugout, 0];
  if (bu > -26 && bu < -20 && Math.abs(bv - 12) < 4) return mod(Math.round(bu), 2) && mod(Math.round(bv), 3) ? [M.crate[d < 0.5 ? 0 : 1], H.crate] : null;
  if (bu < -18 && bu > -300 && Math.abs(bv - Math.sin(bu / 40) * 6) < 1.5 + d) return [M.track, 0];
  return null;
}

/** A tented or hutted camp centred at (uc, sc), rows along the front. */
function camp(seed: number, x: number, y: number, u: number, s: number, uc: number, sc: number, huts: boolean): Stamp | null {
  const du = u - uc;
  const dv = s - sc;
  if (Math.abs(du) > 34 || Math.abs(dv) > 70) return null;
  if (huts) {
    // Rows of long huts, corrugated roofs ridged down the middle.
    const row = Math.round(du / 14);
    const across = du - row * 14;
    const along = dv - Math.round(dv / 22) * 22;
    if (Math.abs(row) <= 2 && Math.abs(across) <= 3 && Math.abs(along) <= 8) return [M.hut[Math.abs(across) < 0.8 ? 1 : mod(Math.round(along), 2)], H.hut - Math.abs(across) * 0.4];
  } else {
    // Bell tents in rows: a canvas cone, lit side and shaded side, a dark pole at the top.
    const tu = du - Math.round(du / 10) * 10;
    const tv = dv - Math.round(dv / 10) * 10;
    const r = Math.hypot(tu, tv);
    if (Math.abs(Math.round(du / 10)) <= 3 && r < 3.3) return r < 0.7 ? [M.post, H.tent] : [M.tent[tu + tv < 0 ? 0 : 1], H.tent * (1 - r / 3.3) + 0.5];
  }
  const dirt = dirtAt(seed + 6, x, y, 0.85 - (Math.max(Math.abs(du) - 26, Math.abs(dv) - 62, 0) / 8));
  return dirt ? [dirt, 0] : null;
}

/** A wrecked vehicle (lorry, limber or gun) at the cell's point, burnt and rusting, on scorched ground. */
function wreck(du: number, dv: number, kind: number, angle: number, d: number): Stamp | null {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const a = du * c - dv * sn;
  const b = du * sn + dv * c;
  if (kind < 0.5) {
    // Lorry: long body, cab at one end, wheels sticking out.
    if (Math.abs(a) <= 2.5 && Math.abs(b) <= 6) return [b > 3.5 ? M.wreck[1] : d < 0.25 ? M.wreck[2] : M.wreck[0], H.wreck];
    if (Math.abs(Math.abs(a) - 3) <= 0.6 && (Math.abs(b - 4) <= 1 || Math.abs(b + 4) <= 1)) return [M.gun, 1];
  } else if (kind < 0.8) {
    // Limber / wagon: a small box between two wheels.
    if (Math.abs(a) <= 1.6 && Math.abs(b) <= 3) return [M.boards[1], 1.5];
    if (Math.abs(Math.abs(a) - 2.5) <= 0.6 && Math.abs(b) <= 1.6) return [M.gun, 1.5];
  } else {
    // An abandoned field gun on its side: barrel and one wheel.
    if (Math.abs(a) <= 0.6 && b > -2 && b < 6) return [M.gun, H.gun];
    if (Math.hypot(a - 1.5, b + 2) < 2) return [M.carriage, H.gun];
  }
  const r = Math.hypot(a, b);
  if (r < 9 && d < 0.6 * (1 - r / 9)) return [M.soot, 0];
  return null;
}

/** The cellular fields the front uses (the trench network, stumps). */
type Cells = { net: (x: number, y: number) => Cell; stump: (x: number, y: number) => Cell };
const directCells = (seed: number): Cells => ({
  net: (x, y) => cellular(seed + 260, x, y, 230),
  stump: (x, y) => cellular(seed + 220, x, y, 40),
});

/**
 * Shell holes: one possible crater per CRATER_CELL cell (a jittered grid: Voronoi feature points), lots of
 * them, sized and thinned by the devastation at the centre, so every crater is whole. Some stretches of the
 * front were shelled far harder than others (`heavy`, a slow regional noise): there they're denser and
 * bigger. Only a few hold water (`pool`).
 */
const CRATER = {
  cell: 24, // px; a crater's reach (r × splash) stays under one cell, so a 3×3 search finds every one
  chance: [0.4, 1.6], // (over 1: every cell, in the heaviest stretches) // × devastation: how many cells have one, lightly … heavily shelled
  r: [4, 9], // px radius range, before the size scale below
  scale: [0.8, 1.35], // lightly … heavily shelled
  splash: 1.35, // thrown mud reaches this × r
  smooth: 0.35, // Voronoi smooth F1: how much neighbouring holes blend into one another
  pool: 0.12, // chance a big enough hole holds water
  heavy: 900, // px: the scale of the heavier and lighter shelled stretches
};
const CRATER_CELL = CRATER.cell;
type Crater = { x: number; y: number; r: number; pool: boolean };
function craterIn(seed: number, fronts: readonly Front[], i: number, j: number): Crater | null {
  const x = (i + hash(seed + 210, i, j)) * CRATER_CELL;
  const y = (j + hash(seed + 211, i, j)) * CRATER_CELL;
  const n = nearest(seed, fronts, x, y);
  if (!n) return null;
  const dev = devastationAt(seed, x, y, n.u, n.end);
  const heavy = smooth((valueNoise(seed + 216, x / CRATER.heavy, y / CRATER.heavy) - 0.3) / 0.4);
  if (hash(seed + 212, i, j) >= Math.sqrt(dev) * (CRATER.chance[0] + (CRATER.chance[1] - CRATER.chance[0]) * heavy)) return null;
  const r = (CRATER.r[0] + hash(seed + 213, i, j) * (CRATER.r[1] - CRATER.r[0])) * (CRATER.scale[0] + (CRATER.scale[1] - CRATER.scale[0]) * heavy) * (0.6 + 0.4 * dev);
  return { x, y, r, pool: r > 5.5 && dev > 0.6 && hash(seed + 215, i, j) < CRATER.pool };
}

/**
 * The shell holes at a point, as Blender's Voronoi "smooth F1": q, the distance to the nearest hole's
 * centre in its own radii (0 at the centre, 1 at its lip), smooth-min blended with its neighbours' so
 * holes that overlap run together into one soft pit. `c` is the nearest hole (for its water).
 */
const craterHit = { c: null as unknown as Crater, q: 0 }; // reused: read it before the next call
function craterAt(get: (i: number, j: number) => Crater | null, x: number, y: number): { c: Crater; q: number } | null {
  const ci = Math.floor(x / CRATER_CELL);
  const cj = Math.floor(y / CRATER_CELL);
  const k = CRATER.smooth;
  let q = Infinity;
  let near: Crater | null = null;
  let nearQ = Infinity;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const c = get(i, j);
      if (!c) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      const reach = c.r * (CRATER.splash + k);
      if (dx * dx + dy * dy > reach * reach) continue; // too far to matter, even blended (skip the sqrt)
      const qi = Math.sqrt(dx * dx + dy * dy) / c.r;
      if (qi < nearQ) (nearQ = qi), (near = c);
      const h = Math.max(k - Math.abs(q - qi), 0) / k; // polynomial smooth min
      q = Math.min(q, qi) - (h * h * k) / 4;
    }
  }
  if (!near || q >= CRATER.splash) return null;
  craterHit.c = near;
  craterHit.q = q;
  return craterHit;
}

/** A military stamp for a whole tile [x0, x1) × [y0, y1): same results as militaryAt, much faster. */
export function militaryTile(seed: number, fronts: readonly Front[], x0: number, y0: number, x1: number, y1: number, shore?: (x: number, y: number) => number): (x: number, y: number) => Stamp | null {
  const pad = 30; // the network is sampled at warped positions
  const cells: Cells = {
    net: cellularField(seed + 260, 230, x0 - pad, y0 - pad, x1 + pad, y1 + pad),
    stump: cellularField(seed + 220, 40, x0, y0, x1, y1),
  };
  // Craters in and around the tile, worked out once.
  const i0 = Math.floor(x0 / CRATER_CELL) - 1;
  const j0 = Math.floor(y0 / CRATER_CELL) - 1;
  const ni = Math.floor(x1 / CRATER_CELL) + 2 - i0;
  const nj = Math.floor(y1 / CRATER_CELL) + 2 - j0;
  const grid: (Crater | null)[] = [];
  if (!DEV.onlyTrenches || ONLY_TRENCHES_GROUND.craters) for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) grid.push(craterIn(seed, fronts, i0 + i, j0 + j)); // no craters while isolated
  const craters = (i: number, j: number) => grid[(j - j0) * ni + (i - i0)] ?? null;
  const field = frontField(seed, fronts, x0, y0, x1, y1);
  return (x, y) => {
    wetFlare = shore ? 1 - smooth(shore(x, y) / SHORE_FLARE) : 0;
    return militaryAt(seed, fronts, x, y, cells, craters, field);
  };
}

/** How far behind the divide (past nml) anything of the trench lines reaches: the furthest wall, wandering,
 *  the cross trenches past it and their spoil. (Cutting the zone off any nearer leaves a straight edge.) */
const ONLY_TRENCHES_REACH = 12 + (WALLS.presence.length - 1) * WALLS.spacing[1] + WALLS.wander[0] + WALLS.wander[1] + WALLS.across.past[1] + HASTY_SPREAD;
/** Near a front's ends the works thin out into gaps: is stretch k there (an unfinished, petering-out line)? */
const present = (seed: number, fid: number, end: number, k: number) => end > 0.98 || hash(seed + 250 + fid, k, 0) < end;
/** The hasty front line itself (fire trench, wire, saps) at its very ends: whole 300 px stretches drop out
 *  only over the last LEAD of the easing, after the walls behind it have given out (WALLS.fade). */
const LEAD = 0.25;
const leading = (seed: number, fid: number, end: number, k: number) => hash(seed + 250 + fid, k, 0) < smooth(end / LEAD);

/**
 * The military stamp at a world pixel, or null where the ground shows through unchanged. `fronts` is
 * frontsNear(...) for the tile.
 */
export function militaryAt(
  seed: number,
  fronts: readonly Front[],
  x: number,
  y: number,
  cells: Cells = directCells(seed),
  craters: (i: number, j: number) => Crater | null = (i, j) => craterIn(seed, fronts, i, j),
  field: (x: number, y: number) => FrontCoords | null = (px, py) => nearest(seed, fronts, px, py),
): Stamp | null {
  const n = field(x, y);
  if (!n) return null;
  const { s, u, end, f } = n;
  const nml = f.nml; // (toward its ends the lines give out from the back, keeping their places: see WALLS.fade)
  if (DEV.frontLine && Math.abs(u) <= 0.75) return [FRONT_LINE, 0]; // development: show where the line itself runs
  if (DEV.frontLine) {
    // Behind the first level: past the furthest wall's widest wander and the trenches back across them.
    const behind = nml + 12 + (WALLS.presence.length - 1) * WALLS.spacing[1] + WALLS.wander[0] + WALLS.wander[1] + WALLS.across.past[1] + 40;
    if (Math.abs(Math.abs(u) - behind) <= 0.75) return [SIDE_LINE[u < 0 ? -1 : 1], 0];
  }
  const fid = f.id % 9973;
  const au = Math.abs(u);
  const side = u < 0 ? -1 : 1;

  if (DEV.onlyTrenches) {
    // Development: the fire, support and reserve lines alone, nothing else of the front.
    const dd = hash(seed + 202, x, y);
    const works = (DEV.trenchStyle === 'hasty' ? leading : present)(seed, fid, end, Math.floor(s / 300)) && au <= nml + ONLY_TRENCHES_REACH;
    return (works ? (walls(seed, x, y, u, s, nml, end, fid, dd) ?? wire(seed, x, y, u, s, nml, fid, dd, end)) : null) ?? shelling(seed, x, y, u, s, nml, end, fid, dd, cells, craters, ONLY_TRENCHES_GROUND);
  }

  const d = hash(seed + 202, x, y);

  // Camps far behind each line: rows of bell tents or huts on trampled ground.
  if (au > FRONTS.camps[0] - 60 && au < FRONTS.camps[1] + 60) {
    const slot = Math.floor(s / 1400);
    if (hash(seed + 280 + fid, slot, side) < 0.55 * end) {
      const sc = slot * 1400 + 300 + hash(seed + 281 + fid, slot, side) * 800;
      const uc = side * (FRONTS.camps[0] + hash(seed + 282 + fid, slot, side) * (FRONTS.camps[1] - FRONTS.camps[0]));
      const c = camp(seed, x, y, u, s, uc, sc, hash(seed + 283 + fid, slot, side) < 0.4);
      if (c) return c;
    }
  }

  // Batteries, well behind each line: one slot every 900 px along the front, most of them occupied.
  if (au > FRONTS.battery - 340 && au < FRONTS.battery + 340) {
    const face = u < 0 ? 1 : -1;
    const slot = Math.floor(s / 900);
    if (hash(seed + 232 + fid, slot, face) < 0.65 * end) {
      const sb = slot * 900 + 300 + hash(seed + 233 + fid, slot, face) * 300;
      const ub = -face * (FRONTS.battery + (hash(seed + 234 + fid, slot, face) - 0.5) * 300);
      const b = battery(seed, u, s, ub, sb, face, hash(seed + 235 + fid, slot, face), d);
      if (b) return b;
    }
  }

  // The trench lines: fire, support, reserve on each side, each wandering a little.
  const jig = slow(seed, f, 1, s);
  const bf = -nml - 12 + jig;
  const gf = nml + 12 - jig;
  const fire = side < 0 ? bf : gf;
  const seg = Math.floor(s / 300); // the line is broken into stretches, for the ends' gaps
  if (present(seed, fid, end, seg) && au < nml + 340) {
    // Machine-gun posts on the fire trench: a sandbag ring with the gun's dark pit.
    const slot = Math.floor(s / 220);
    if (hash(seed + 284 + fid, slot, side) < 0.45) {
      const sm = slot * 220 + 40 + hash(seed + 285 + fid, slot, side) * 140;
      const r = Math.hypot(s - sm, u - (fire - side * 7));
      if (r < 2.5) return [M.dugout, 0];
      if (r < 4.6) return [M.bags[2], H.bags + 0.5];
    }
    const t = walls(seed, x, y, u, s, nml, end, fid, d);
    if (t) return t;
  }

  // Saps: short trenches pushed out into no-man's land from the fire trench, ending in a listening post.
  // (Hasty trenches have their own, drawn with the walls.)
  if (au < nml + 20 && DEV.trenchStyle !== 'hasty') {
    const slot = Math.floor(s / 150);
    if (hash(seed + 251 + fid, slot, side) < 0.4 * end) {
      const ss = slot * 150 + 30 + hash(seed + 252 + fid, slot, side) * 90;
      const len = 25 + hash(seed + 253 + fid, slot, side) * 70;
      const along = (u - fire) * -side; // + into no-man's land
      if (along > 3 && along < len) {
        const wob = (valueNoise(seed + 254 + fid, along / 12, slot) - 0.5) * 4;
        const a = Math.abs(s - ss - wob);
        const head = along > len - 5 && a <= 5; // the listening post at its end
        if (a <= 1 || (head && a <= 3)) return [M.boards[1], H.boards];
        if (a <= 3 || (head && a <= 5)) return [M.bags[0], H.bags - 0.5];
      }
    }
  }

  // Communication trenches every ~480 px, winding back from the fire trench at an angle.
  const ck = Math.round(s / 480);
  const cs = ck * 480 + (hash(seed + 204 + fid, ck, side) - 0.5) * 120;
  const slope = (hash(seed + 205 + fid, ck, side) - 0.5) * 0.9;
  const back = (u - fire) * side; // + away from no-man's land
  if (back > 0 && back < 560 && present(seed, fid, end, ck * 7)) {
    // A winding trench wiggles ≤ 5.5 px and its banks reach 8.5 px: further off its line than that, skip the noise.
    const off = s - cs - slope * back;
    const c = Math.abs(off) <= 15 ? winding(seed, x, y, u, off, fid + ck * 31, d) : null;
    if (c) return c;
    // A supply dump where it meets the support area: stacks of crates on trampled ground.
    const dv = s - cs - slope * 540;
    if (back > 520 && back < 552 && Math.abs(dv) < 14) {
      if (mod(Math.round(back), 4) < 3 && mod(Math.round(dv), 5) < 3 && hash(seed + 286 + fid, ck, side) < 0.6) return [M.crate[d < 0.5 ? 0 : 1], H.crate];
      const dirt = dirtAt(seed + 7, x, y, 0.8);
      if (dirt) return [dirt, 0];
    }
  }

  // Redoubts: small enclosed strongpoints behind the support line, wired around.
  const rk = Math.floor(s / 1300);
  if (hash(seed + 206 + fid, rk, side) < 0.5 * end) {
    const rs = rk * 1300 + 400 + hash(seed + 207 + fid, rk, side) * 500;
    const ru = fire + side * (170 + hash(seed + 208 + fid, rk, side) * 60);
    const ring = Math.max(Math.abs(s - rs), Math.abs(u - ru));
    if (ring >= 16 && ring <= 17) return [M.boards[1], H.boards];
    if ((ring > 17 && ring <= 19) || (ring >= 14 && ring < 16)) return [M.bags[2], H.bags];
    if (ring > 24 && ring < 30 && mod(Math.round(x + y), 5) === 0 && d < 0.6) return [M.wire, H.wire];
  }

  // The trench network: the zone is laced with interlinked trenches, some in use, some old and
  // collapsing, following the edges of irregular cells (warped, so they curve), as in the air photos.
  if (au < 1000) {
    const wx = x + (valueNoise(seed + 265, x / 70, y / 70) - 0.5) * 50;
    const wy = y + (valueNoise(seed + 266, x / 70, y / 70) - 0.5) * 50;
    const cell = cells.net(wx, wy);
    const edge = cell.f2 - cell.f1; // ≈ 0 on a cell boundary
    if (edge < 12) {
      const a = Math.min(cell.id, cell.id2);
      const b = Math.max(cell.id, cell.id2);
      const pairKey = Math.floor(a * 1e6) * 7 + Math.floor(b * 1e6);
      const wanted = smooth((1000 - au) / 400) * end * 0.55;
      if (hash(seed + 267 + fid, pairKey, 0) < wanted) {
        const relic = hash(seed + 268 + fid, pairKey, 0) < 0.4 * smooth((au - nml) / 300);
        const t = winding(seed, x, y, cell.f1, edge / 2, pairKey % 977, d, relic);
        if (t) return t;
      }
    }
  }

  // Barbed wire in front of each fire trench, each army's own way (see wire).
  if (present(seed, fid, end, seg)) {
    const w = wire(seed, x, y, u, s, nml, fid, d, end);
    if (w) return w;
  }

  return shelling(seed, x, y, u, s, nml, end, fid, d, cells, craters);
}

/** Of the shelled ground, what `onlyTrenches` (development) draws: switched on one at a time. */
const ONLY_TRENCHES_GROUND = { craters: true, wrecks: false, stumps: false, clods: false, mud: true };
/** Shelling: stacked craters (whole, some full of water), wrecks, blasted stumps, churned mud and clods. */
function shelling(
  seed: number, x: number, y: number, u: number, s: number, nml: number, end: number, fid: number, d: number,
  cells: Cells, craters: (i: number, j: number) => Crater | null, on: Readonly<Record<keyof typeof ONLY_TRENCHES_GROUND, boolean>> = { craters: true, wrecks: true, stumps: true, clods: true, mud: true },
): Stamp | null {
  const au = Math.abs(u);
  const dev = devastationAt(seed, x, y, u, end);
  if (dev <= 0.02) return null;
  const hit = on.craters ? craterAt(craters, x, y) : null;
  if (hit) {
    // Bands of the smooth distance, their edges dithered so they fray: water (in a few), the dark pit,
    // its muddy lip, then thrown clods thinning out.
    const q = hit.q + (d - 0.5) * 0.12;
    if (hit.c.pool && q < 0.45) return [M.pool[q < 0.3 ? 0 : 1], 0.05];
    if (q < 0.35) return [M.clod, 0.1];
    if (q < 0.65) return [M.bowl, 0.2];
    if (q < 1) return [M.rim[d < 0.55 ? 0 : 1], H.rim];
    if (d < 0.6 * (1 - (q - 1) / (CRATER.splash - 1))) return [M.clod, H.mud]; // thrown mud around it
  }
  if (on.wrecks && au > nml + 40 && au < 900 && dev > 0.15) {
    const ks = Math.floor(s / 260);
    const ku = Math.floor(u / 200);
    if (hash(seed + 287 + fid, ks, ku) < 0.12) {
      const ws = ks * 260 + 60 + hash(seed + 288 + fid, ks, ku) * 140;
      const wu = ku * 200 + 50 + hash(seed + 289 + fid, ks, ku) * 100;
      const w = wreck(u - wu, s - ws, hash(seed + 290 + fid, ks, ku), hash(seed + 291 + fid, ks, ku) * Math.PI, d);
      if (w) return w;
    }
  }
  if (on.stumps) {
    const stump = cells.stump(x, y);
    if (stump.f1 < 1.3 && stump.id < dev * 0.8) return [M.stump, H.stump];
  }
  if (on.clods && d < dev * 0.18) return [M.clod, H.mud]; // small churned clods everywhere
  if (on.mud && d < dev ** 1.3) return [pick(M.mud, valueNoise(seed + 212, x / 3, y / 3)), H.mud];
  return null;
}
