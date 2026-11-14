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
import { dirtAt, type RGB } from './ground.ts';

export type Stamp = readonly [RGB, number]; // colour, height (world units, like ground heights)

/**
 * Development density: `density` > 1 packs the world's additions closer together for local debugging
 * (fronts and farms `density`× as frequent). Set per tile request from the scene's features (see
 * world/generate.ts); 1 in production.
 */
/**
 * Fire-trench styles (the front is being built one part at a time; see `only` in world/generate.ts):
 *  - traversed:  dug in, a square wave of fire bays staggered by traverses (the standard design).
 *  - hasty:      a shallow, roughly straight ditch with a low spoil bank and the odd sandbag (newly taken
 *                ground, early war).
 */
export const TRENCH_STYLES = ['traversed', 'hasty'] as const;
export type TrenchStyle = (typeof TRENCH_STYLES)[number];

/** Per-request settings: development density, whether the fronts exist (when off, buildings ignore
 *  them), only the trench lines (development: everything else on the front is left out), and their style. */
export const DEV: { density: number; fronts: boolean; onlyTrenches: boolean; trenchStyle: TrenchStyle; frontLine: boolean } = { density: 1, fronts: true, onlyTrenches: false, trenchStyle: 'traversed', frontLine: false };
/** Development: the front's own line (its centre, u = 0), drawn as a thin red line of pixels. */
const FRONT_LINE: RGB = [230, 30, 30];

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const pick = <T>(list: readonly T[], v: number): T => list[Math.min(list.length - 1, Math.max(0, Math.floor(v * list.length)))];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const M = {
  mud: [rgb(0x4f4030), rgb(0x43362a), rgb(0x5a4934)], // wet, churned
  clod: rgb(0x3a2e22),
  bowl: rgb(0x3a2e22),
  rim: [rgb(0x5a4733), rgb(0x4f3e2c)], // muddy, not dry
  pool: [rgb(0x3c4642), rgb(0x46524c)],
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

export const FRONTS = {
  region: 130000, // territory size (÷ √density): the world is split into territories, each holding at most one front (big enough that the front mostly fits; at higher density, a front's territory edge cuts it shorter where they meet)
  chance: 0.6, // share of territories that hold one: few and far between, with wide open country between
  length: [48000, 76000], // a front's length along its curve, px (tens of km: a long-running line); the same at any density
  border: 0.06, // a front's works fade out over this × the territory size before its territory's edge
  noMansLand: [150, 260], // half-width range
  battery: 1450, // batteries' distance behind their line
  camps: [2100, 2600], // tented and hutted camps, behind the guns
  reach: 2800, // nothing military beyond this distance from a line
  fade: 7000, // over how far a front eases out at its ends: its lines draw together and thin out, its zone narrows to a rounded tip
  // FOR NOW, while the front's look is being worked on: a front always runs right through the plane's start
  // (the world origin), whichever territory that's in. Set false to go back to fronts only where they fall.
  atStart: true,
};

export type Front = {
  id: number;
  x: number; // centre
  y: number;
  tx: number; // unit vector along the line
  ty: number;
  half: number; // half-length
  nml: number; // no-man's land half-width
  territory: number; // the id of the territory it lives in (see territoryAt)
};

const regionSize = () => FRONTS.region / Math.sqrt(DEV.density);

/**
 * Territories: the world is partitioned by a cellular noise (one cell per region, its borders warped so
 * they wander), and each front lives in exactly one territory: its works only appear inside it and fade
 * out approaching its edge. So fronts never overlap or cross, and no front ever needs comparing with
 * another: a pixel just looks up its territory. A territory holds a front when its id < FRONTS.chance;
 * the front is centred on the territory's own point.
 */
const TERRITORY_SEED = 238; // cellular(seed + 238): points from hash(seed + 238 / 239), ids from hash(seed + 240)
/**
 * Where the world origin (the plane's start) sits in the territory pattern. With FRONTS.atStart the
 * pattern is shifted so the origin lands right on cell (0, 0)'s own point: deep inside its territory,
 * as far from any edge as a territory's middle, so the front there is at full strength under the plane.
 */
function territoryOrigin(seed: number): [number, number] {
  if (!FRONTS.atStart) return [0, 0];
  const size = regionSize();
  return [hash(seed + TERRITORY_SEED, 0, 0) * size, hash(seed + TERRITORY_SEED + 1, 0, 0) * size];
}
export function territoryAt(seed: number, x: number, y: number): { id: number; edge: number } {
  const size = regionSize();
  const [ox, oy] = territoryOrigin(seed);
  const px = x + ox;
  const py = y + oy;
  const w = size * 0.08; // warp: the borders wander instead of running straight (none at the origin's own point)
  const warp = (k: number, ax: number, ay: number) => (valueNoise(seed + k, ax / (size * 0.4), ay / (size * 0.4)) - 0.5) * 2 * w;
  const wx = px + warp(236, px, py) - warp(236, ox, oy);
  const wy = py + warp(237, px, py) - warp(237, ox, oy);
  const c = cellular(seed + TERRITORY_SEED, wx, wy, size);
  return { id: c.id, edge: (c.f2 - c.f1) / 2 }; // edge: roughly the distance to the territory's border
}
/**
 * A front's line: a curve that turns as it goes (its heading is the sum of a few smooth bends), sampled
 * every SEG px along its length. Each front takes one of a few shapes, at random sizes:
 *  - C:      one broad bend of 150–270°, a C or a horseshoe;
 *  - hook:   a long run that curls round hard (110–200°) near one end;
 *  - S:      two bends the opposite ways;
 *  - wander: four gentler bends either way.
 * None can cross itself, or come back near itself (it would squeeze its own trenches): an S or a wander
 * never points more than 160° from where it started, and every curve is checked once when it's made,
 * its bends eased a little and tried again until no two parts of it far apart along the line come
 * close on the ground. No short meander on the line itself: its tightest bends stay km wide, so the
 * walls either side (up to ~500 px out) never fold over on the inside of one; each wall wanders on its
 * own instead (see WALLS). The middle of the curve sits on the
 * territory's own point.
 */
const SEG = 64;
type Curve = { x: Float64Array; y: Float64Array; nx: Float64Array; ny: Float64Array; box: [number, number, number, number] };
const curves = new WeakMap<Front, Curve>();
const DEG = Math.PI / 180;
function curveOf(seed: number, f: Front): Curve {
  const known = curves.get(f);
  if (known) return known;
  const id = seed + 247 + (f.id % 997);
  const r = (k: number) => hash(id, k, 11);
  const sign = (k: number) => (r(k) < 0.5 ? -1 : 1);
  // Bends: [where along it (0…1), how wide (0…1 of its length), how far it turns (radians)].
  let bends: [number, number, number][];
  const kind = r(0);
  if (kind < 0.35) bends = [[0.5 + (r(1) - 0.5) * 0.3, 0.6 + r(2) * 0.4, sign(3) * (150 + r(4) * 120) * DEG]]; // C
  else if (kind < 0.55) {
    const t = sign(5) < 0 ? 0.18 : 0.82;
    const turn = sign(3) * (110 + r(4) * 90) * DEG;
    bends = [[t, 0.2 + r(2) * 0.15, turn], [0.5, 0.8, Math.sign(turn) * r(6) * 40 * DEG]]; // hook (both the same way)
  } else if (kind < 0.75) {
    const turn = (60 + r(4) * 60) * DEG;
    bends = [[0.3, 0.3 + r(2) * 0.15, sign(3) * turn], [0.7, 0.3 + r(1) * 0.15, -sign(3) * turn * (0.7 + r(6) * 0.5)]]; // S
  } else bends = [0.15, 0.4, 0.6, 0.85].map((t, k) => [t, 0.25, sign(10 + k) * (20 + r(20 + k) * 50) * DEG]); // wander
  // One or two more bends on top, anywhere along it: the same way round for a C or a hook (so it stays one
  // arc), either way otherwise. (Anything that would bring it back near itself is eased below.)
  const way = Math.sign(bends[0][2]);
  const curl = kind < 0.55;
  for (let e = 0; e < 1 + Math.floor(r(30) * 2); e++) bends.push([0.1 + r(31 + e) * 0.8, 0.15 + r(33 + e) * 0.2, (curl ? way : sign(35 + e)) * (30 + r(37 + e) * 50) * DEG]);
  const n = Math.max(2, Math.round((2 * f.half) / SEG) + 1);
  const turned = (t: number) => bends.reduce((a, [at, w, turn]) => a + turn * smooth((t - at) / w + 0.5), 0);
  // Keep a back-and-forth line from ever doubling back over itself (one-way bends are safe as they are).
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < n; k++) (lo = Math.min(lo, turned(k / (n - 1)))), (hi = Math.max(hi, turned(k / (n - 1))));
  const oneWay = bends.every(([, , t]) => Math.sign(t) === Math.sign(bends[0][2]));
  const squeeze = !oneWay && hi - lo > 160 * DEG ? (160 * DEG) / (hi - lo) : 1;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const trace = (sq: number) => {
    const heading0 = Math.atan2(f.ty, f.tx) - turned(0.5) * sq; // so the line's middle runs along the front's angle
    let px = 0;
    let py = 0;
    for (let k = 0; k < n; k++) {
      const a = heading0 + turned(k / (n - 1)) * sq;
      x[k] = px;
      y[k] = py;
      nx[k] = -Math.sin(a); // normal: + toward the German side
      ny[k] = Math.cos(a);
      px += Math.cos(heading0 + turned((k + 0.5) / (n - 1)) * sq) * SEG;
      py += Math.sin(heading0 + turned((k + 0.5) / (n - 1)) * sq) * SEG;
    }
  };
  // Never back near itself: parts more than FAR apart along the line stay GAP apart on the ground.
  const FAR = Math.round(6000 / SEG); // (a whole number of samples)
  const GAP2 = (2 * (f.nml + 500)) ** 2;
  const clear = () => {
    for (let i = 0; i < n; i += 4) for (let j = i + FAR; j < n; j += 4) if ((x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2 < GAP2) return false;
    return true;
  };
  let sq = squeeze;
  trace(sq);
  for (let tries = 0; tries < 12 && !clear(); tries++) trace((sq *= 0.8)); // ponytail: O(n²/16) once per front (~10k checks); fine at a few hundred points
  // Centre the curve's middle on the front's point.
  const m = Math.floor(n / 2);
  const ox = f.x - x[m];
  const oy = f.y - y[m];
  const box: Curve['box'] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < n; k++) {
    x[k] += ox;
    y[k] += oy;
    box[0] = Math.min(box[0], x[k]);
    box[1] = Math.min(box[1], y[k]);
    box[2] = Math.max(box[2], x[k]);
    box[3] = Math.max(box[3], y[k]);
  }
  const c = { x, y, nx, ny, box };
  curves.set(f, c);
  return c;
}

/** The point on a front's curve nearest to (x, y), as s (along, from −half) and u (across: + German side),
 *  searching segments [k0, k1). */
function onCurve(c: Curve, f: Front, x: number, y: number, k0 = 0, k1 = c.x.length - 1) {
  let best = Infinity;
  let bk = 0;
  let bt = 0;
  for (let k = k0; k < k1; k++) {
    const ax = c.x[k];
    const ay = c.y[k];
    const dx = c.x[k + 1] - ax;
    const dy = c.y[k + 1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const ex = x - ax - dx * t;
    const ey = y - ay - dy * t;
    const d = ex * ex + ey * ey;
    if (d < best) (best = d), (bk = k), (bt = t);
  }
  const qx = c.x[bk] + (c.x[bk + 1] - c.x[bk]) * bt;
  const qy = c.y[bk] + (c.y[bk + 1] - c.y[bk]) * bt;
  const nx = c.nx[bk] + (c.nx[bk + 1] - c.nx[bk]) * bt;
  const ny = c.ny[bk] + (c.ny[bk + 1] - c.ny[bk]) * bt;
  return { s: -f.half + (bk + bt) * SEG, u: (x - qx) * nx + (y - qy) * ny };
}

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

const frontCache = new Map<string, Front | null>();

function frontInRegion(seed: number, i: number, j: number): Front | null {
  const key = `${seed},${DEV.density},${i},${j}`;
  if (frontCache.has(key)) return frontCache.get(key)!;
  if (frontCache.size > 5000) frontCache.clear();
  let f: Front | null = null;
  const territory = hash(seed + TERRITORY_SEED + 2, i, j); // cell (i, j)'s id, as cellular gives it
  const atStart = FRONTS.atStart && i === 0 && j === 0; // the territory the plane starts in (see territoryOrigin)
  if (territory < FRONTS.chance || atStart) {
    const size = regionSize();
    const a = hash(seed + 243, i, j) * Math.PI;
    const [lo, hi] = FRONTS.length;
    f = {
      id: Math.floor(hash(seed + 244, i, j) * 1e9),
      territory,
      x: (i + hash(seed + TERRITORY_SEED, i, j)) * size - territoryOrigin(seed)[0], // the territory's own point (the plane's start, for cell (0, 0) with atStart)
      y: (j + hash(seed + TERRITORY_SEED + 1, i, j)) * size - territoryOrigin(seed)[1],
      tx: Math.cos(a),
      ty: Math.sin(a),
      half: (lo + (hi - lo) * hash(seed + 245, i, j)) / 2, // density only makes fronts more frequent, never smaller
      nml: FRONTS.noMansLand[0] + (FRONTS.noMansLand[1] - FRONTS.noMansLand[0]) * hash(seed + 246, i, j),
    };
  }
  frontCache.set(key, f);
  return f;
}

/** Every front whose zone (line ± reach) could touch the rectangle [x0, x1) × [y0, y1). */
export function frontsNear(seed: number, x0: number, y0: number, x1: number, y1: number): Front[] {
  const size = regionSize();
  const pad = FRONTS.length[1] / 2 + FRONTS.reach; // a curve stays within its half-length of its middle
  const out: Front[] = [];
  const [ox, oy] = territoryOrigin(seed); // regions are counted in the (shifted) territory pattern
  for (let j = Math.floor((y0 + oy - pad) / size); j <= Math.floor((y1 + oy + pad) / size); j++) {
    for (let i = Math.floor((x0 + ox - pad) / size); i <= Math.floor((x1 + ox + pad) / size); i++) {
      const f = frontInRegion(seed, i, j);
      if (!f) continue;
      // The rectangle against the curve's bounding box, grown by the zone's reach.
      const [bx0, by0, bx1, by1] = curveOf(seed, f).box;
      const r = FRONTS.reach;
      if (x1 > bx0 - r && x0 < bx1 + r && y1 > by0 - r && y0 < by1 + r) out.push(f);
    }
  }
  return out;
}

/** How fully a front is there at s along it: 1 along most of its length, easing to 0 over FRONTS.fade at its ends. */
const endAt = (f: Front, s: number) => smooth((f.half - Math.abs(s)) / FRONTS.fade);
/** Zone and works narrow toward the ends, to a rounded tip (and toward a territory's edge). */
const within = (u: number, end: number) => end > 0 && Math.abs(u) <= FRONTS.reach * Math.sqrt(end);

/** A point in a front's own coordinates: s along its curve, u across it (+ toward the German side), and
 *  `end` (see endAt). Exact: searches the whole curve (for single points; tiles use frontField). */
function frontCoords(seed: number, f: Front, x: number, y: number) {
  const { s, u } = onCurve(curveOf(seed, f), f, x, y);
  return { s, u, end: endAt(f, s), f };
}

/** The world point at (s along, u across) a front (the inverse of frontCoords; for tests and tools). */
export function frontPoint(seed: number, f: Front, s: number, u: number): { x: number; y: number } {
  const c = curveOf(seed, f);
  const p = Math.max(0, Math.min(c.x.length - 1.000001, (s + f.half) / SEG));
  const k = Math.floor(p);
  const t = p - k;
  const lerp = (a: Float64Array) => a[k] + (a[k + 1] - a[k]) * t;
  return { x: lerp(c.x) + lerp(c.nx) * u, y: lerp(c.y) + lerp(c.ny) * u };
}

/** The coordinates of the front whose territory a point is in, or null if there's none or it doesn't reach (exported for src/frontmap.ts). */
export function nearest(seed: number, fronts: readonly Front[], x: number, y: number) {
  // Only the front of the territory this point is in (at most one), fading out towards its border.
  const t = territoryAt(seed, x, y);
  const f = fronts.find((g) => g.territory === t.id);
  if (!f) return null;
  const c = frontCoords(seed, f, x, y);
  c.end *= smooth(t.edge / (FRONTS.border * regionSize()));
  return within(c.u, c.end) ? c : null;
}

export type FrontCoords = { s: number; u: number; end: number; f: Front };
/**
 * `nearest` for every point of a tile [x0, x1) × [y0, y1), cheaply: the front coordinates are found
 * exactly on a world-aligned 8-px grid (territory, then only the nearby stretch of that front's curve)
 * and interpolated between. Smooth everywhere a front's works are, so it matches `nearest` there.
 * The result object is reused by the next call (it's per pixel, in the hot loop): read it, don't keep it.
 */
export function frontField(seed: number, fronts: readonly Front[], x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => FrontCoords | null {
  const G = 8;
  const i0 = Math.floor(x0 / G);
  const j0 = Math.floor(y0 / G);
  const ni = Math.floor((x1 - 1) / G) + 2 - i0;
  const nj = Math.floor((y1 - 1) / G) + 2 - j0;
  const S = new Float64Array(ni * nj);
  const U = new Float64Array(ni * nj);
  const E = new Float64Array(ni * nj);
  const F = new Int16Array(ni * nj).fill(-1);
  // The stretch of each front's curve that can reach this tile.
  const near = fronts.map((f) => {
    const c = curveOf(seed, f);
    const r = FRONTS.reach + G * 2;
    let k0 = -1;
    let k1 = -1;
    for (let k = 0; k < c.x.length; k++) {
      if (c.x[k] > x0 - r && c.x[k] < x1 + r && c.y[k] > y0 - r && c.y[k] < y1 + r) {
        if (k0 < 0) k0 = Math.max(0, k - 1);
        k1 = Math.min(c.x.length - 1, k + 1);
      }
    }
    return { c, k0, k1 };
  });
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const x = (i0 + i) * G;
      const y = (j0 + j) * G;
      const t = territoryAt(seed, x, y);
      const fi = fronts.findIndex((g) => g.territory === t.id);
      if (fi < 0 || near[fi].k0 < 0) continue;
      const f = fronts[fi];
      const { s, u } = onCurve(near[fi].c, f, x, y, near[fi].k0, near[fi].k1);
      const k = j * ni + i;
      S[k] = s;
      U[k] = u;
      E[k] = endAt(f, s) * smooth(t.edge / (FRONTS.border * regionSize()));
      F[k] = fi;
    }
  }
  const out: FrontCoords = { s: 0, u: 0, end: 0, f: fronts[0] };
  return (x, y) => {
    const fx = x / G - i0;
    const fy = y / G - j0;
    const i = Math.min(ni - 2, Math.max(0, Math.floor(fx)));
    const j = Math.min(nj - 2, Math.max(0, Math.floor(fy)));
    const k = j * ni + i;
    const fi = F[k];
    if (fi < 0 || F[k + 1] !== fi || F[k + ni] !== fi || F[k + ni + 1] !== fi) return null; // at a territory's edge (faded out there anyway)
    const tx = fx - i;
    const ty = fy - j;
    // Bilinear, written out (no closure or object made per pixel).
    const u = (U[k] * (1 - tx) + U[k + 1] * tx) * (1 - ty) + (U[k + ni] * (1 - tx) + U[k + ni + 1] * tx) * ty;
    const end = (E[k] * (1 - tx) + E[k + 1] * tx) * (1 - ty) + (E[k + ni] * (1 - tx) + E[k + ni + 1] * tx) * ty;
    if (!within(u, end)) return null;
    out.s = (S[k] * (1 - tx) + S[k + 1] * tx) * (1 - ty) + (S[k + ni] * (1 - tx) + S[k + ni + 1] * tx) * ty;
    out.u = u;
    out.end = end;
    out.f = fronts[fi];
    return out;
  };
}

/** How shell-torn the ground is, 0 … 1: total in no-man's land, fading out behind the lines and at a front's ends. */
const devastationAt = (seed: number, x: number, y: number, u: number, end: number) =>
  smooth((640 - Math.abs(u)) / 480) * end * (0.8 + 0.2 * valueNoise(seed + 201, x / 90, y / 90));

/** For placing other things: distance to the nearest front line (Infinity if none) and the devastation. */
export function frontInfo(seed: number, x: number, y: number): { u: number; dev: number; nml: number } {
  const n = nearest(seed, frontsNear(seed, x, y, x + 1, y + 1), x, y);
  return n ? { u: Math.abs(n.u) / Math.max(0.3, n.end), dev: devastationAt(seed, x, y, n.u, n.end), nml: n.f.nml } : { u: Infinity, dev: 0, nml: 0 };
}

/** Spoil: the earth thrown up beside a trench, a band of worn dirt fraying out into the ground. */
function spoil(seed: number, x: number, y: number, a: number, inner: number, width: number): Stamp | null {
  if (a < inner || a > inner + width) return null;
  const dirt = dirtAt(seed + 5, x, y, 1 - (a - inner) / width);
  return dirt ? [dirt, H.spoil] : null;
}

/**
 * A fire trench along a line `line` px across from the front: duckboard floor, sandbag breastworks, spoil
 * beyond. Traverses make it a square wave of small "teeth" (as the air photos show), in an irregular
 * pattern: each bay steps to one side or the other at random, so long runs never look regular.
 */
/** What the last trench() stamp was, for drawing order where walls overlap: 3 a trench floor, 2 its
 *  bank or sandbags, 1 its spoil. (The floor is drawn on top, so walls that cross stay readable.) */
let rank = 0;
function trench(seed: number, x: number, y: number, u: number, s: number, line: number, bay: number, stagger: number, lineId: number, d: number, presence = HASTY.present): Stamp | null {
  rank = 1;
  if (Math.abs(u - line) > (DEV.trenchStyle === 'hasty' ? 85 : stagger * 3 + 20)) return null; // too far from this line for its style (cheap early-out)
  if (DEV.trenchStyle === 'hasty') return hasty(seed, x, y, u, s, line, lineId, d, presence);
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
const sectionMemos = Array.from({ length: 16 }, () => ({ id: NaN, q: NaN, shape: HASTY_SHAPES[0][1], height: 0 }));
function hasty(seed: number, x: number, y: number, u: number, s: number, line: number, lineId: number, d: number, presence = HASTY.present): Stamp | null {
  const id = seed + 276 + lineId * 7;
  const phase = hash(id, 7, 7) * HASTY.stretch; // each wall's stretches and gaps fall in their own places
  const c0 = Math.floor((s + phase) / HASTY.stretch);
  let beyond = Infinity; // how far past the nearest stretch's end (≤ 0: alongside it)
  let sc = s; // the point along the line where that stretch is nearest
  let cell = c0;
  // A stretch's end cap can reach into the neighbouring slot, so check those too.
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    if (hash(id, c, 0) > presence) continue;
    const start = c * HASTY.stretch + HASTY.gap[0] + hash(id, c, 1) * (HASTY.gap[1] - HASTY.gap[0]) - phase;
    const end = (c + 1) * HASTY.stretch - hash(id, c, 2) * HASTY.shorten - phase;
    const b = Math.max(start - s, s - end);
    if (b < beyond) (beyond = b), (sc = Math.max(start, Math.min(end, s))), (cell = c);
  }
  if (beyond > HASTY.reach) return null;
  // The ditch's course at a point along the line: kink points joined by straight runs, the section's
  // shape (a tab, a wave, a step…) on top, plus wander and jitter. Continuous along the line.
  const course = (at: number) => {
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
      let shape = HASTY_SHAPES[0][1];
      for (const [w, fn] of HASTY_SHAPES) if ((pick -= w) < 0) (shape = fn), (pick = Infinity);
      sm.id = id;
      sm.q = q;
      sm.shape = shape;
      sm.height = (hash(id, q, 5) < 0.5 ? -1 : 1) * (HASTY.lobe[0] + hash(id, q, 6) * (HASTY.lobe[1] - HASTY.lobe[0])); // out to one side or the other
    }
    const shape = sm.shape;
    const height = sm.height;
    return (
      line + o0 + ((o1 - o0) / HASTY.kink) * (at - k * HASTY.kink) +
      shape(at / HASTY.section - q) * height +
      (valueNoise(seed + 273 + lineId, at / 35, 0) - 0.5) * HASTY.bend +
      (valueNoise(seed + 277 + lineId, at / 7, 0) - 0.5) * HASTY.jitter
    );
  };
  // Cheap check first: the furthest this section of ditch can stray from the line (its kinks, its shape,
  // wander and jitter), so most pixels near a wall but off its ditch skip tracing the course.
  course(sc); // (fills this wall's kink and section slots for sc)
  const km = kinkMemos[lineId & 15];
  const sm = sectionMemos[lineId & 15];
  const stray = Math.max(Math.abs(km.o0), Math.abs(km.o1)) + Math.abs(sm.height) + (HASTY.bend + HASTY.jitter) / 2;
  if (Math.abs(u - line) - stray > HASTY.reach && beyond <= 0) return null;
  const centre = course(sc);
  const slope = (course(sc + 2) - centre) / 2; // the ditch's heading here (tabs have steep flanks)
  const across = (u - centre) / Math.sqrt(1 + slope * slope);
  const best = beyond > 0 ? Math.hypot(across, beyond) : Math.abs(across);
  const cap = beyond > -4 ? Math.min(1, (beyond + 4) / 6) : 0; // 0 along the sides … 1 past an end
  if (best > HASTY.reach) return null;
  // The ditch and its bank swell and pinch along their length (ragged, uneven digging), edges dithered.
  const swell = valueNoise(seed + 269 + lineId, s / 14, 0);
  const ditch = 0.6 + swell * 0.9 + (d - 0.5) * 0.5;
  const bank = ditch + 1 + swell * 0.8 + cap;
  if (best <= ditch) return (rank = 3), [M.mud[d < 0.5 ? 1 : 0], 0];
  if (best <= bank) return (rank = 2), hash(seed + 278 + lineId, Math.floor(s / 3), cell) < 0.15 ? [M.bags[1], H.bags - 1.5] : [M.earthwork[d < 0.5 ? 0 : 1], H.spoil + 0.4];
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
};
function walls(seed: number, x: number, y: number, u: number, s: number, nml: number, kEnd: number, fid: number, d: number): Stamp | null {
  let best: Stamp | null = null;
  let bestRank = 0;
  const reach = 95 + WALLS.wander[0] + WALLS.wander[1]; // the furthest anything of a wall can be from its unwandered place
  for (const side of [-1, 1]) {
    let regional = -1; // (worked out only if a wall on this side is close)
    let off = 0;
    for (let k = 0; k < WALLS.presence.length; k++) {
      const lineId = (side < 0 ? 1 : 5) + k;
      if (k > 0) off += WALLS.spacing[0] + hash(seed + 291 + fid, lineId, 0) * (WALLS.spacing[1] - WALLS.spacing[0]);
      if (Math.abs(u - side * (nml + 12 + off * kEnd)) > reach) continue; // nowhere near this wall: skip its noise
      // How many walls this stretch of this side has: a slow regional mix, so some stretches have one, some four.
      if (regional < 0) regional = 0.55 + 0.9 * valueNoise(seed + 295 + (fid % 97), s / 9000, side);
      const wander =
        (valueNoise(seed + 290 + lineId, s / 1400, fid % 101) - 0.5) * 2 * WALLS.wander[0] +
        (valueNoise(seed + 292 + lineId, s / 450, fid % 101) - 0.5) * 2 * WALLS.wander[1];
      const line = side * (nml + 12 + off * kEnd) + wander;
      if (Math.abs(u - line) > 95) continue; // too far from this wall for anything of it (cheap)
      const t = trench(seed, x, y, u, s, line, WALLS.bay[k], WALLS.stagger[k], lineId, d, Math.min(1, WALLS.presence[k] * regional));
      if (t && rank > bestRank) {
        best = t;
        bestRank = rank;
        if (rank === 3) return best; // a trench floor: nothing goes over it
      }
    }
  }
  return best;
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

const CRATER_CELL = 26;
type Crater = { x: number; y: number; r: number; z: number; pool: boolean };
/** The crater (if any) in crater cell (i, j): size and existence from the devastation at its centre, so
 *  every crater is whole. */
function craterIn(seed: number, fronts: readonly Front[], i: number, j: number): Crater | null {
  const x = (i + hash(seed + 210, i, j)) * CRATER_CELL;
  const y = (j + hash(seed + 211, i, j)) * CRATER_CELL;
  const n = nearest(seed, fronts, x, y);
  if (!n) return null;
  const dev = devastationAt(seed, x, y, n.u, n.end);
  if (hash(seed + 212, i, j) >= dev * 0.9) return null;
  const r = (3.5 + hash(seed + 213, i, j) * 9.5) * (0.5 + 0.5 * dev);
  return { x, y, r, z: hash(seed + 214, i, j), pool: r > 9 && dev > 0.7 && hash(seed + 215, i, j) < 0.35 };
}

/** The topmost crater covering a point (with its splash ring), so overlapping craters stack, not clip. */
const craterHit = { c: null as unknown as Crater, dist: 0 }; // reused: read it before the next call
function craterAt(get: (i: number, j: number) => Crater | null, x: number, y: number): { c: Crater; dist: number } | null {
  const ci = Math.floor(x / CRATER_CELL);
  const cj = Math.floor(y / CRATER_CELL);
  let best: Crater | null = null;
  let bestDist = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const c = get(i, j);
      if (!c) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      const reach = c.r * 1.35;
      if (dx * dx + dy * dy > reach * reach * 1.000001) continue; // clearly out of reach: skip the (slow) exact distance
      const dist = Math.hypot(dx, dy);
      if (dist < c.r * 1.35 && (!best || c.z > best.z || (dist < c.r && bestDist >= best.r))) (best = c), (bestDist = dist);
    }
  }
  if (!best) return null;
  craterHit.c = best;
  craterHit.dist = bestDist;
  return craterHit;
}

/** A military stamp for a whole tile [x0, x1) × [y0, y1): same results as militaryAt, much faster. */
export function militaryTile(seed: number, fronts: readonly Front[], x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => Stamp | null {
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
  if (!DEV.onlyTrenches) for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) grid.push(craterIn(seed, fronts, i0 + i, j0 + j)); // no craters while isolated
  const craters = (i: number, j: number) => grid[(j - j0) * ni + (i - i0)] ?? null;
  const field = frontField(seed, fronts, x0, y0, x1, y1);
  return (x, y) => militaryAt(seed, fronts, x, y, cells, craters, field);
}

/** Near a front's ends the works thin out into gaps: is stretch k there (an unfinished, petering-out line)? */
const present = (seed: number, fid: number, end: number, k: number) => end > 0.98 || hash(seed + 250 + fid, k, 0) < end;

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
  if (DEV.frontLine && Math.abs(u) <= 0.75) return [FRONT_LINE, 0]; // development: show where the line itself runs
  const k = 0.3 + 0.7 * end; // toward its ends a front's lines draw together as it eases out
  const nml = f.nml * k;
  const fid = f.id % 9973;
  const au = Math.abs(u);
  const side = u < 0 ? -1 : 1;

  if (DEV.onlyTrenches) {
    // Development: the fire, support and reserve lines alone, nothing else of the front.
    if (!present(seed, fid, end, Math.floor(s / 300)) || au > nml + 340) return null;
    return walls(seed, x, y, u, s, nml, k, fid, hash(seed + 202, x, y));
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
    const t = walls(seed, x, y, u, s, nml, k, fid, d);
    if (t) return t;
  }

  // Saps: short trenches pushed out into no-man's land from the fire trench, ending in a listening post.
  if (au < nml + 20) {
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

  // Barbed wire: belts in front of each fire trench and, thinner, in front of the support line.
  const wx = Math.round(x);
  const wy = Math.round(y);
  const wired = (u > bf + 8 && u < bf + 30) || (u < gf - 8 && u > gf - 36);
  const thin = (u > bf - 104 && u < bf - 92) || (u < gf + 114 && u > gf + 102);
  if (present(seed, fid, end, seg) && (wired || thin)) {
    if (mod(wx, 6) === 0 && mod(wy, 6) === 0) return [M.post, H.post];
    if ((mod(wx + wy, 6) === 0 || mod(wx - wy, 6) === 0) && d < (wired ? 0.55 : 0.3)) return [M.wire, H.wire];
  }

  // Shelling: stacked craters (whole, some full of water), wrecks, blasted stumps, churned mud and clods.
  const dev = devastationAt(seed, x, y, u, end);
  if (dev <= 0.02) return null;
  const hit = craterAt(craters, x, y);
  if (hit) {
    const { c, dist } = hit;
    if (dist < c.r) {
      if (c.pool && dist < c.r * 0.35) return [M.pool[d < 0.5 ? 0 : 1], 0];
      if (dist < c.r * 0.62) return [M.bowl, 0.2];
      return [M.rim[d < 0.55 ? 0 : 1], H.rim];
    }
    if (d < 0.5 * (1 - (dist - c.r) / (c.r * 0.35))) return [M.clod, H.mud]; // thrown mud around it
  }
  if (au > nml + 40 && au < 900 && dev > 0.15) {
    const ks = Math.floor(s / 260);
    const ku = Math.floor(u / 200);
    if (hash(seed + 287 + fid, ks, ku) < 0.12) {
      const ws = ks * 260 + 60 + hash(seed + 288 + fid, ks, ku) * 140;
      const wu = ku * 200 + 50 + hash(seed + 289 + fid, ks, ku) * 100;
      const w = wreck(u - wu, s - ws, hash(seed + 290 + fid, ks, ku), hash(seed + 291 + fid, ks, ku) * Math.PI, d);
      if (w) return w;
    }
  }
  const stump = cells.stump(x, y);
  if (stump.f1 < 1.3 && stump.id < dev * 0.8) return [M.stump, H.stump];
  if (d < dev * 0.18) return [M.clod, H.mud]; // small churned clods everywhere
  if (d < dev ** 1.3) return [pick(M.mud, valueNoise(seed + 212, x / 3, y / 3)), H.mud];
  return null;
}
