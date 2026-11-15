// Layer 1 of world generation: the front plan. Where the fronts are (territories, each front's curve),
// a point's coordinates relative to its front, and how shell-torn the ground is. Depends only on the seed
// and the settings, never on the landscape: the landscape (world/ground.ts) is shaped around it, then farms
// (world/structures.ts) and the front's works (world/military.ts) are placed using it.

import { cellular, hash, valueNoise } from '../core/noise.ts';
import { DEV } from './settings.ts';

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
  fade: 7000, // over how far a front eases out at its ends: its lines give out from the back, its zone narrows to a rounded tip
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
 * Where the world origin (the plane's start) sits in the territory pattern. With DEV.atStart the
 * pattern is shifted so the origin lands right on cell (0, 0)'s own point: deep inside its territory,
 * as far from any edge as a territory's middle, so the front there is at full strength under the plane.
 */
function territoryOrigin(seed: number): [number, number] {
  if (!DEV.atStart) return [0, 0];
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

const frontCache = new Map<string, Front | null>();

function frontInRegion(seed: number, i: number, j: number): Front | null {
  const key = `${seed},${DEV.density},${DEV.atStart},${i},${j}`;
  if (frontCache.has(key)) return frontCache.get(key)!;
  if (frontCache.size > 5000) frontCache.clear();
  let f: Front | null = null;
  const territory = hash(seed + TERRITORY_SEED + 2, i, j); // cell (i, j)'s id, as cellular gives it
  const atStart = DEV.atStart && i === 0 && j === 0; // the territory the plane starts in (see territoryOrigin)
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

/** The shelled ground runs on, full, nearly to a front's very end: it fades out only over the last of the
 *  easing (`end` below this), as the fire trench itself peters out, and a little past it. */
const DEVASTATION_END = 0.15;
/** How shell-torn the ground is, 0 … 1: total in no-man's land, fading out behind the lines and at a front's ends. */
export const devastationAt = (seed: number, x: number, y: number, u: number, end: number) =>
  smooth((640 - Math.abs(u)) / 480) * smooth(end / DEVASTATION_END) * (0.8 + 0.2 * valueNoise(seed + 201, x / 90, y / 90));

/** For placing other things: distance to the nearest front line (Infinity if none) and the devastation. */
export function frontInfo(seed: number, x: number, y: number): { u: number; dev: number; nml: number } {
  const n = nearest(seed, frontsNear(seed, x, y, x + 1, y + 1), x, y);
  return n ? { u: Math.abs(n.u), dev: devastationAt(seed, x, y, n.u, n.end), nml: n.f.nml } : { u: Infinity, dev: 0, nml: 0 };
}

/**
 * How firmly the landscape is kept clear for a front, 0 … 1: 1 over its core (no-man's land and the
 * trench lines, `core` px beyond no-man's land), easing to 0 over `fade` px behind that. The landscape
 * (world/ground.ts) lowers its lakes, woods and copses by it, so none forms in the trenches, though they
 * may reach in a little at the back. Fades with the front at its ends and its territory's edge.
 */
export const CLEARANCE = { core: 420, fade: 900, step: 32 };

function clearanceAt(seed: number, x: number, y: number): number {
  const n = nearest(seed, frontsNear(seed, x, y, x + 1, y + 1), x, y);
  if (!n) return 0;
  return smooth((n.f.nml + CLEARANCE.core + CLEARANCE.fade - Math.abs(n.u)) / CLEARANCE.fade) * smooth(n.end * 4);
}

// The clearance only changes over hundreds of px, so it's worked out exactly on a world grid every
// CLEARANCE.step px (cached, direct-mapped) and interpolated. Global grid: tiles meet seamlessly.
const CLEAR_SLOTS = 1 << 15;
const clearI = new Int32Array(CLEAR_SLOTS).fill(-2147483648);
const clearJ = new Int32Array(CLEAR_SLOTS);
const clearV = new Float32Array(CLEAR_SLOTS);
const clearWorld = { seed: NaN, density: NaN, atStart: true };
const lastCell = { i: NaN, j: NaN, a: 0, b: 0, c: 0, d: 0 };
function clearCell(seed: number, i: number, j: number): number {
  const h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) & (CLEAR_SLOTS - 1);
  if (clearI[h] === i && clearJ[h] === j) return clearV[h];
  const v = clearanceAt(seed, i * CLEARANCE.step, j * CLEARANCE.step);
  clearI[h] = i;
  clearJ[h] = j;
  clearV[h] = v;
  return v;
}

/** The front clearance at a world point (see CLEARANCE): 0 everywhere when the fronts are off. */
export function frontClearance(seed: number, x: number, y: number): number {
  if (!DEV.fronts) return 0;
  if (seed !== clearWorld.seed || DEV.density !== clearWorld.density || DEV.atStart !== clearWorld.atStart) {
    clearWorld.seed = seed; // another world: forget the cached grid
    clearWorld.density = DEV.density;
    clearWorld.atStart = DEV.atStart;
    clearI.fill(-2147483648);
    lastCell.i = NaN;
  }
  const gx = x / CLEARANCE.step;
  const gy = y / CLEARANCE.step;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const L = lastCell; // pixels come in rows, so the next one is nearly always in the same grid cell
  if (i !== L.i || j !== L.j) {
    L.i = i;
    L.j = j;
    L.a = clearCell(seed, i, j);
    L.b = clearCell(seed, i + 1, j);
    L.c = clearCell(seed, i, j + 1);
    L.d = clearCell(seed, i + 1, j + 1);
  }
  const u = gx - i;
  const v = gy - j;
  if (L.a === 0 && L.b === 0 && L.c === 0 && L.d === 0) return 0; // far from any front (most of the world)
  return L.a + (L.b - L.a) * u + (L.c - L.a) * v + (L.a - L.b - L.c + L.d) * u * v;
}
