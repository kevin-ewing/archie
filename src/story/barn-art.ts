// The Story screen's picture: the pilot's desk in the barn, seen from straight above, filling the screen, in
// the game's own pixels (the same size as in flight). Old planks; on them the things of the job
// (story/desk-items.ts), scattered the way a desk gets, every one still partly in view. Pure.

import { bayer, fbm, hash, valueNoise } from '../core/noise.ts';
import { createPx, plot, type Px, type RGBA } from '../core/pixels.ts';
import * as I from './desk-items.ts';
import { CLUTTER, messagePad } from './clutter.ts';

export type SpotId = I.ItemId;
export type Spot = { id: SpotId; x: number; y: number; w: number; h: number };
export type BarnInfo = I.DateInfo & {
  sortie: number;
  date: string;
  hours?: number; // the watch's time of day …
  sunset?: number; // … and its sunset mark
  logbook?: Readonly<I.LogbookCover>; // the log book as the story has it (rank, number, wear); default: as he arrives
  orders?: Readonly<I.OrdersText>; // what today's orders say, filled in as the story unlocks them; default: the first sortie's
};

// Every drawing here depends only on what it's drawn from, and some are slow (the chart ~14 ms): each is made once and kept, so a resize or a new arrangement costs only the layout.
const drawings = new Map<string, Px>();
/** The drawing `key` names, made once. (Callers must not draw into it: it's shared.) */
export const drawing = (key: string, make: () => Px): Px => drawings.get(key) ?? (drawings.set(key, make()), drawings.get(key)!);

const SEED = 1916;
// For now: only these things are on the desk, brought back one at a time (none of the loose clutter).
export const SHOWN: readonly I.ItemId[] = ['chart', 'orders', 'calendar', 'logbook', 'clockcode', 'goggles', 'mug', 'watch', 'pad'];
// … and of the loose clutter (story/clutter.ts), only these by name, brought back one at a time. (The sixpence, 'coin', is the last, above.)
export const CLUTTER_SHOWN: readonly string[] = ['postcard', 'spanner'];
type Box = { x: number; y: number; w: number; h: number };
type Thing = { id: I.ItemId | null; art: Px; turn: number; live?: boolean; k: number; keep?: Box[]; z?: number; depth?: number; spin?: boolean; relit?: (turn: number) => Px }; // k: drawn at this size (the drawing's pixels × k game px) // keep: parts of it (in its pixels) nothing may cover

/** The usable things, bottom of the pile first, then what just lies about. */
/**
 * How big things are drawn on a W × H desk (game px), seen through `pixel` device px per game px:
 * - the maps shrink a little on smaller screens, never below 85 %, then just run further off the edges;
 * - the things you use shrink as much as they need to stay whole and easy to press (down to half size), but
 *   only in steps that keep every pixel a whole number of device pixels square.
 */
export function sizes(W: number, H: number, pixel: number): { map: number; usable: number } {
  const fit = Math.min(Math.max(W, H * 0.8) / 720, Math.max(H, W * 0.55) / 400);
  const map = Math.round(Math.min(1, Math.max(0.85, fit)) * 20) / 20; // in 5 % steps: few redraws of the chart
  const want = Math.min(1, Math.max(0.5, Math.min(W / 560, H / 340)));
  const usable = Math.max(1, Math.round(want * pixel)) / pixel;
  return { map, usable };
}

function things(info: BarnInfo, W: number, H: number, pixel: number): { usable: Thing[]; loose: Thing[] } {
  const size = sizes(W, H, pixel);
  // The chart is a big background sheet of a fixed size (it doesn't shrink with the screen; on small screens
  // more of it runs off the edge), turned about 20°.
  // Full size on any normal window; only once it is smaller than 720 × 400 game px do the big things shrink, together.
  // They shrink a little on small windows, but never below 65 %: they just run further off the edge (at least about a third stays in view).
  const cw = Math.round(520 * size.map);
  const bigCal = W >= 360 && H >= 230; // the large calendar page on anything but a phone (it may run off the edge; its date stays on screen)
  const t = (id: I.ItemId | null, art: Px, n: number): Thing => ({ id, art, turn: (hash(SEED, n, 3) - 0.5) * 0.5, k: size.usable });
  return {
    usable: [
      { ...t('chart', drawing(`chart:${cw}:${size.usable}`, () => I.chartArt(cw, Math.round((cw * 176) / 250), 0, size.usable)), 1), turn: 0.35, k: 1 }, // the map: its own size
      { ...t('orders', ordersDrawing(info), 4), turn: 0 }, // square, front and centre, and on top of everything: the way to the next flight
      { ...t('calendar', drawing(`calendar:${info.day}:${info.month}:${info.year}:${bigCal}`, () => I.calendarArt(info, bigCal)), 8), k: 1, keep: I.calendarKeep(info, bigCal) }, // its own size, like the maps; the month and the days round today stay in view
      { ...t('clockcode', drawing('clockcode', I.clockcodeArt), 5), turn: -0.1 }, // placed first so the rest lie around it; only a little off square, the other way, to be read where it lies
      ...(SHOWN.includes('letters') ? [t('letters', drawing('letters', I.lettersArt), 3)] : []), // (not drawn at all while it's off the desk, and nothing lies round where it would be)
      t('logbook', logbookDrawing(info), 2),
      { ...t('goggles', drawing('goggles', I.gogglesArt), 24), turn: -0.2, k: Math.max(1, Math.round(size.usable * pixel * (W >= 700 ? 0.8 : 0.55))) / pixel, keep: [{ x: 20, y: 6, w: 174, h: 72 }] }, // the mask and lenses stay in view; the strap round them may be covered // three quarters of the other things' size (half on a small screen), still whole device pixels: it's a big thing to lay down
      t('mug', drawing('coffee', I.coffeeArt), 12),
      ...(SHOWN.includes('pad') ? [t('pad', drawing('pad', messagePad), 10)] : []), // the message pad: a thing you can pick up
      ...(SHOWN.includes('coin') ? [{ ...t('coin', drawing('coin', I.coinArt), 21), turn: hash(SEED, 21, 9) * Math.PI * 2 }] : []), // the sixpence: the one bit of clutter you can pick up
      { ...t('watch', drawing(`watch:${info.hours ?? 8}:${info.sunset ?? 19.5}`, () => I.watchArt(info.hours ?? 8, info.sunset ?? 19.5, false)), 20), live: true }, // redrawn as time passes
    ],
    // The clutter (story/clutter.ts), at the size of the things you use, each turned any way at all.
    loose: CLUTTER.flatMap((c, n) => (CLUTTER_SHOWN.includes(c.name) ? [{ ...t(null, drawing(`clutter:${c.name}`, c.art), 60 + n), turn: c.turn ?? hash(SEED, 60 + n, 9) * Math.PI * 2, z: c.z, depth: c.depth, spin: c.spin, relit: c.spin ? (turn: number) => drawing(`clutter:${c.name}:${turn.toFixed(3)}`, () => c.art(turn)) : undefined }] : [])),
  };
}

/** The smallest box round a thing's drawn pixels when turned (and drawn `k` × size), from its centre: a
 * button that covers all of it and no more (a round watch's box is not its square drawing's, turned). */
const hugs = new WeakMap<Px, Map<string, { x0: number; y0: number; x1: number; y1: number }>>();
function hug(a: Px, turn: number, k: number) {
  const key = `${turn}:${k}`, kept = hugs.get(a)?.get(key);
  if (kept) return kept;
  const c = Math.cos(turn), s = Math.sin(turn), half = 0.5 * k * (Math.abs(c) + Math.abs(s));
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (!a.data[(y * a.w + x) * 4 + 3]) continue;
    const lx = (x + 0.5 - a.w / 2) * k, ly = (y + 0.5 - a.h / 2) * k, X = lx * c - ly * s, Y = lx * s + ly * c;
    b.x0 = Math.min(b.x0, X - half); b.x1 = Math.max(b.x1, X + half); b.y0 = Math.min(b.y0, Y - half); b.y1 = Math.max(b.y1, Y + half);
  }
  if (!hugs.has(a)) hugs.set(a, new Map());
  hugs.get(a)!.set(key, b);
  return b;
}
/** A thing's bounding box when turned. */
const extent = (a: Px, turn: number, k = 1) => ({ w: Math.ceil((Math.abs(a.w * Math.cos(turn)) + Math.abs(a.h * Math.sin(turn))) * k), h: Math.ceil((Math.abs(a.w * Math.sin(turn)) + Math.abs(a.h * Math.cos(turn))) * k) });
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where everything goes: each usable thing at the seeded spot (of many tried) that covers the least of the
 * ones already down, so the desk looks scattered but each stays mostly in view; the loose things wherever
 * they fall, under the usable ones. `keepClear` is screen space other controls use (the plates).
 */
export function arrange(W: number, H: number, info: BarnInfo, keepClear: { x: number; y: number; w: number; h: number }[] = [], pixel = 4) {
  const { usable, loose } = things(info, W, H, pixel);
  const placed: (Spot & { t: Thing })[] = [];
  const guard: (Box & { id: I.ItemId })[] = []; // on screen, what nothing may cover (the calendar's month and its days round today)
  const m = 2;
  /** Where on screen the parts of `t` it keeps clear end up, when it lies in box `s`. */
  const kept = (t: Thing, s: Box): Box[] => (t.keep ?? []).map((b) => {
    const c = Math.cos(t.turn), n = Math.sin(t.turn), xs: number[] = [], ys: number[] = [];
    for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
      const lx = (px - t.art.w / 2) * t.k, ly = (py - t.art.h / 2) * t.k;
      xs.push(s.x + s.w / 2 + lx * c - ly * n); ys.push(s.y + s.h / 2 + lx * n + ly * c);
    }
    const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
    return { x, y, w: Math.ceil(Math.max(...xs)) - x, h: Math.ceil(Math.max(...ys)) - y };
  });
  const spotFor = (t: Thing, k: number, avoid: readonly (Box & { weight?: number })[]): Spot & { turn: number } => {
    let e = extent(t.art, t.turn, t.k);
    // The orders lie square in the middle of the desk, a touch low, whatever else has to move round them.
    if (t.id === 'orders') return { id: 'orders' as I.ItemId, x: Math.round((W - e.w) / 2), y: Math.round(Math.max(m, (H - e.h) / 2 + H * 0.03)), ...e, turn: t.turn };
    // The chart lies right of centre and a little low, bleeding off the right and bottom edges.
    if (t.id === 'chart') {
      const cx = Math.max(W * 0.55, W - e.w * 0.45), cy = Math.max(H * 0.55, H - e.h * 0.45);
      return { id: 'chart' as I.ItemId, x: Math.round(cx - e.w / 2), y: Math.round(cy - e.h / 2), ...e, turn: t.turn };
    }
    let best: (Spot & { turn: number }) | null = null;
    let bestScore = Infinity;
    // Where it may go: anywhere on screen; the calendar may run a third of itself off any edge (its kept parts
    // stay on); the clock-code card on the left, to balance the pale papers on the right.
    const bleed = t.id === 'calendar' ? 0.35 : t.id === 'goggles' ? 0.25 : 0; // the goggles' strap loop may run off an edge (the mask and lenses may not)
    const x0 = m - e.w * bleed, x1 = Math.max(x0, t.id === 'clockcode' ? W * 0.34 - e.w / 2 : W - e.w * (1 - bleed) - m); // the card's centre stays in the left third
    const y0 = m - e.h * bleed, y1 = Math.max(y0, H - e.h * (1 - bleed) - m);
    for (let i = 0; i < (t.spin ? 3000 : 900); i++) { // (many tries: the desk is crowded)
      const turn = t.spin ? Math.floor(hash(SEED + k, i, 3) * 36) / 36 * Math.PI * 2 : t.turn; // a long thing is tried every way round
      if (t.spin) e = extent(t.art, turn, t.k);
      const mm = t.spin ? 8 : 0, X1 = t.spin ? Math.max(x0 + mm, W - e.w - m - mm) : x1, Y1 = t.spin ? Math.max(y0 + mm, H - e.h - m - mm) : y1; // (kept a little off the screen's edge)
      const x = Math.round(x0 + mm + hash(SEED + k, i, 1) * (X1 - x0 - mm));
      const y = Math.round(y0 + mm + hash(SEED + k, i, 2) * (Y1 - y0 - mm));
      const s = { id: (t.id ?? 'chart') as I.ItemId, x, y, ...e, turn };
      // What it covers: its box, or for a long thing turned, a row of squares along its length (its box, turned
      // diagonal, would be mostly empty desk).
      const n = t.spin ? Math.max(1, Math.round(t.art.w / t.art.h)) : 1, side = t.art.h * t.k, step = (t.art.w * t.k - side) / Math.max(1, n - 1);
      const pieces: Box[] = n === 1 ? [s] : Array.from({ length: n }, (_, j) => { const o = (j - (n - 1) / 2) * step; return { x: x + e.w / 2 + Math.cos(turn) * o - side / 2, y: y + e.h / 2 + Math.sin(turn) * o - side / 2, w: side, h: side }; });
      const cover = (a: Box) => pieces.reduce((q, b) => q + overlap(b, a), 0);
      const own = kept(t, s); // its own kept parts must stay on screen and clear of the plates
      const off = own.reduce((q, b) => q + b.w * b.h - overlap(b, { x: 0, y: 0, w: W, h: H }), 0);
      const low = t.id === 'goggles' && W < 700 ? (y1 - y) * 3 : 0; // shrunk right down, it prefers the bottom of the desk, where the room is
      const score = low + avoid.reduce((sum, a) => sum + cover(a) * (a.weight ?? 1), 0) +
        own.reduce((q, b) => q + avoid.reduce((r, a) => r + overlap(b, a), 0), 0) * 100000 + // and what a thing keeps clear isn't under what's already down
         off * 1000000 + keepClear.reduce((sum, a) => sum + cover(a) * 30 + own.reduce((q, b) => q + overlap(b, a) * 1000, 0), 0) + guard.reduce((sum, a) => sum + cover(a) * 100000, 0);
      if (score < bestScore) { best = s; bestScore = score; }
    }
    return best!;
  };
  usable.forEach((t, k) => { const s = spotFor(t, k, placed.filter((p) => !SCENERY.includes(p.id))); // things may lie on the maps and the calendar (but never on its days round today)
    placed.push({ ...s, id: t.id!, t }); if (SHOWN.includes(t.id!)) guard.push(...kept(t, s).map((b) => ({ ...b, id: t.id! }))); });
  const onDesk = placed.filter((p) => SHOWN.includes(p.id) && Z[p.id] >= 1); // loose things keep off what's shown, but may lie on the maps
  // The clutter fills what's left: biggest first, each where it covers least of the things you use and of
  // the clutter already down (so it spreads out into every gap), and never what any of them keeps clear.
  const down: Box[] = [];
  const lying = [...loose].sort((a, b) => b.art.w * b.art.h - a.art.w * a.art.h).map((t, k) => {
    const cal = placed.filter((p) => p.id === 'calendar'); // the calendar is to be read: clutter keeps mostly off its face
    // Most clutter keeps off the things you use (they count three times over); what lies on top of them (a high
    // `z`) may lie across almost anything, only shy of what it would hide (the orders above it, the watch's face,
    // the coffee) and a little of the rest.
    const high = (t.z ?? 0) >= 1, shy: I.ItemId[] = ['orders', 'watch', 'mug'];
    const avoid = high ? [...placed.filter((p) => SHOWN.includes(p.id)).map((p) => ({ ...p, weight: shy.includes(p.id) ? 50 : p.id === 'chart' ? 0 : 0.2 })), ...down] : [...onDesk, ...onDesk, ...onDesk, ...cal, ...down];
    const s = spotFor(t, 40 + k, avoid);
    down.push(s);
    return { t: { ...t, turn: s.turn, art: t.relit?.(s.turn) ?? t.art }, ...s };
  });
  return { usable: placed, loose: lying, guard };
}

const DARK: RGBA = I.P.dark;
const TONE = 6; // the desk's brightness step: grain tones come in multiples of this, dithered between

/** The desk top: wide planks across, each its own shade, with growth-ring grain, and old mug rings. */
let bare: Px | null = null;
/** The bare desk for this size: the slowest part of a layout, so it's made once, a little bigger than asked
 * (a quarter more, to the next 128 px), and a smaller screen just sees less of it. */
function planks(W: number, H: number): Px {
  if (!bare || bare.w < W || bare.h < H) {
    bare = createPx(Math.ceil((Math.max(W, bare?.w ?? 0) * 1.25) / 128) * 128, Math.ceil((Math.max(H, bare?.h ?? 0) * 1.25) / 128) * 128); // room to grow
    desk(bare);
  }
  if (bare.w === W && bare.h === H) return bare;
  const out = createPx(W, H);
  for (let y = 0; y < H; y++) out.data.set(bare.data.subarray(y * bare.w * 4, (y * bare.w + W) * 4), y * W * 4);
  return out;
}
/** The orders as the story has them for this sortie. */
export const ordersDrawing = (info: BarnInfo) => drawing(`orders:${info.sortie}:${info.date}:${JSON.stringify(info.orders ?? 0)}`, () => I.ordersArt(info.sortie, info.date, info.orders));
/** The log book as the story has it. */
export const logbookDrawing = (info: BarnInfo) => {
  const c = info.logbook ?? I.LOGBOOK_START;
  return drawing(`logbook:${c.rank}:${c.formerRank ?? ''}:${c.number}:${c.wear.toFixed(2)}`, () => I.logbookArt(c));
};

function desk(px: Px) {
  const { w: W, h: H } = px;
  const board = 132; // plank width
  for (let y = 0; y < H; y++) {
    const b = Math.floor(y / board);
    const within = y - b * board;
    for (let x = 0; x < W; x++) {
      if (within === 0) { plot(px, x, y, DARK); continue; }
      // Everything below is per plank, so the grain stops dead at every seam.
      const p = b;
      const u = x + Math.floor(hash(SEED, p, 14) * 5000); // where along its log this plank was cut
      const hue = p + 6; // which colour each plank gets: this order puts a calm, dark grey-brown on top, not the most saturated one
      const shade = Math.floor(hash(SEED, hue, 0) * 4) * 5;
      const tint = [(hash(SEED, hue, 10) - 0.5) * 7, (hash(SEED, hue, 11) - 0.5) * 4, (hash(SEED, hue, 12) - 0.5) * 5]; // each plank a slightly different hue
      // Cap each plank's saturation: darker planks read as more saturated, so pull any above the cap towards grey.
      const base = [76 + shade + tint[0], 65 + shade + tint[1], 56 + shade + tint[2]];
      const mean = (base[0] + base[1] + base[2]) / 3;
      const k = Math.max(0, 1 - 0.235 / ((Math.max(...base) - Math.min(...base)) / Math.max(...base)));
      for (let i = 0; i < 3; i++) tint[i] += (mean - base[i]) * k;
      if (within === 1) { plot(px, x, y, [92 + shade + tint[0], 80 + shade + tint[1], 69 + shade + tint[2], 255]); continue; } // the lit edge
      // Growth rings: bands ~11 px apart, warped by slow noise into long waves that pinch and swell along the plank.
      const spacing = 9 + hash(SEED, p, 15) * 5;
      const ring = (within + (fbm(SEED + 5 + p, u / 120, within / 90, 3) - 0.5) * 55 + Math.sin(u / 70 + p) * 5) / spacing;
      const f0 = ring - Math.floor(ring); // 0 … 1 across one ring
      const f = b % 2 ? 1 - f0 : f0; // every other plank is laid the other way up, so its rings shade the other way
      const band = f < 0.14 ? -42 : f < 0.26 ? -26 : f < 0.4 ? -10 : Math.round((f - 0.4) * 22); // dark latewood line, fading into pale earlywood
      // Fine detail riding the rings: dark streaks, pale flecks, open pores, and a little roughness. All of it
      // is sampled along the warped ring coordinate (not raw x / y), and the streaks and flecks come from smooth
      // noise along the grain, so their lengths and ends vary. Hashing whole x / y cells here made hard-edged,
      // axis-aligned rectangles, and value noise on the x / y grid showed its square lattice.
      // Each streak / fleck is thickest mid-lane and thins towards the lane's edges, so it tapers to points
      // at its ends instead of stopping in a square cut.
      const lane = Math.floor(ring * 4); // four lanes per ring, bending with it
      const streak = valueNoise(SEED + 1 + p, u / 11, lane) > 0.8 + Math.abs(ring * 4 - lane - 0.5) * 0.3 ? -14 : 0;
      const flane = Math.floor(ring * 7);
      const fleck = valueNoise(SEED + 2 + p, u / 5, flane) > 0.88 + Math.abs(ring * 7 - flane - 0.5) * 0.2 ? 10 : 0;
      const pore = hash(SEED + 6 + p, x, y) < 0.02 ? -18 : 0; // single pixels
      const rough = Math.round((fbm(SEED + 3 + p, u / 16 + ring * 0.6, ring * 1.4, 3) - 0.5) * 16);
      // Pixel-art tones, like the ground's: the grain's brightness is snapped to a few fixed steps, blended
      // with the same 4×4 ordered dither (core/noise.ts `bayer`), not a smooth gradient of every shade.
      const raw = (band + streak + fleck) * 0.45 + rough;
      const v = Math.floor(raw / TONE + bayer(x, y)) * TONE + pore * 0.45; // pores stay single sharp pixels
      // Large soft patches a step lighter or darker, as ground.ts `groundShade` does for fields and woods.
      const patch = fbm(SEED + 7 + p, u / 140, y / 90, 3) + (bayer(x, y) - 0.5) * 0.12;
      const lit = patch < 0.38 ? 0.93 : patch > 0.62 ? 1.05 : 1;
      plot(px, x, y, [Math.round((76 + shade + v + tint[0]) * lit), Math.round((65 + shade + v + tint[1]) * lit), Math.round((56 + shade + v * 0.9 + tint[2]) * lit), 255]); // dark, weathered grey-brown: a backdrop, not a feature
    }
  }
  blemishes(px);
}

/**
 * Old mug rings, laid on the desk for this layout (not baked into the bare desk) because they're the mug's
 * size, and the mug shrinks with everything else you can use: `scale` = that size (1 = full). Stains that
 * darken the wood under them (so the grain shows through), sharpest at the outer rim where the liquid dried
 * and fading inward, worn away smoothly round one side. Darkness comes in the desk's tone steps, dithered.
 * They're placed over a fixed 2400 × 1400 area, so a resize doesn't move them, only shows more or fewer.
 */
function mugRings(px: Px, scale: number) {
  const { w: W, h: H } = px;
  for (let k = 0; k < Math.ceil((2400 * 1400) / 30000); k++) {
    const rx = hash(SEED, k, 7) * 2400, ry = hash(SEED, k, 8) * 1400;
    const r = (30 + hash(SEED, k, 16) * 3) * scale; // 30 … 33 px at full size: the mug's narrower bottom (its rim, 37, is a little wider), bigger than the pocket watch (27)
    if (rx + r + 2 < 0 || ry + r + 2 < 0 || rx - r - 2 >= W || ry - r - 2 >= H) continue;
    const depth = 0.7 + hash(SEED, k, 17) * 0.6; // how deep the stain went
    const width = (1.2 + hash(SEED, k, 18) * 1.3) * Math.max(0.6, scale); // how far it soaked in from the rim
    const gap = hash(SEED, k, 20) * 6.283; // the side it has worn away most
    const whole = hash(SEED, k, 21) < 0.4; // a recent one: still crisp all the way round
    const R = Math.ceil(r + 2);
    for (let y = Math.floor(ry - R); y <= ry + R; y++) {
      for (let x = Math.floor(rx - R); x <= rx + R; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || y % 132 === 0) continue; // not on the seams
        const d = Math.hypot(x + 0.5 - rx, y + 0.5 - ry);
        const t = r - d; // px inside the rim
        if (t < -1 || t > width * 3) continue;
        const a = Math.atan2(y + 0.5 - ry, x + 0.5 - rx);
        const wear = whole ? 0.8 + valueNoise(SEED + 30 + k, (a + Math.PI) * r / 7, 0) * 0.3 : valueNoise(SEED + 30 + k, (a + Math.PI) * r / 7, 0) * 0.7 + 0.3 * Math.cos(a - gap) + 0.15; // smooth gaps, more on one side
        const s = (t < 0 ? 1 + t : Math.exp(-t / width)) * depth * Math.min(1, Math.max(0, wear * 1.8));
        const steps = Math.floor(s * 4.5 + bayer(x, y) - 0.3); // 0 … 5 steps darker
        if (steps <= 0) continue;
        darken(px, x, y, steps);
      }
    }
  }
}

/** Darken / lighten one desk pixel by whole tone steps, as a ratio so it keeps the wood's hue (never on a seam). */
function shift(px: Px, x: number, y: number, steps: number) {
  x = Math.round(x); y = Math.round(y);
  if (!steps || x < 0 || y < 0 || x >= px.w || y >= px.h || y % 132 === 0) return;
  const i = (y * px.w + x) * 4, k = 1 + steps * (steps < 0 ? 0.075 : 0.06);
  for (let c = 0; c < 3; c++) px.data[i + c] = Math.min(255, Math.round(px.data[i + c] * k));
}
const darken = (px: Px, x: number, y: number, steps: number) => steps > 0 && shift(px, x, y, -steps);
/** Blend a colour over one desk pixel (never on a seam). */
function stain(px: Px, x: number, y: number, c: readonly number[], a: number) {
  x = Math.round(x); y = Math.round(y);
  if (a <= 0 || x < 0 || y < 0 || x >= px.w || y >= px.h || y % 132 === 0) return;
  const i = (y * px.w + x) * 4;
  for (let n = 0; n < 3; n++) px.data[i + n] = Math.round(px.data[i + n] + (c[n] - px.data[i + n]) * Math.min(1, a));
}

/** Wear of a desk knocked together in a hut on an aerodrome and used hard: knife scratches, cigarette
 * burns, ink blots and spatter, candle-wax drips, greasy thumb smudges and hammer dents. All dithered in
 * the desk's tone steps. */
function blemishes(px: Px) {
  const { w: W, h: H } = px;
  const n = (per: number, salt: number) => Math.max(1, Math.round((W * H) / per * (0.7 + hash(SEED, salt, 99) * 0.6)));
  const along = (cx: number, cy: number, a: number, len: number, wid: number, R: number, f: (x: number, y: number, lx: number, ly: number) => void) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      f(x, y, (dx * c + dy * s) / len, (-dx * s + dy * c) / wid);
    }
  };

  // Greasy smudges: big, faint, soft-edged darker patches where hands rest (under everything else).
  for (let k = 0; k < n(70000, 1); k++) {
    const cx = hash(SEED + 40, k, 1) * W, cy = hash(SEED + 40, k, 2) * H, r = 8 + hash(SEED + 40, k, 3) * 10;
    along(cx, cy, hash(SEED + 40, k, 4) * 3.14, r * 1.3, r, r * 1.4, (x, y, lx, ly) => {
      const e = Math.hypot(lx, ly) + (valueNoise(SEED + 41 + k, x / 4, y / 4) - 0.5) * 0.6;
      darken(px, x, y, Math.floor((1 - e) * 2.2 + bayer(x, y) - 0.2));
    });
  }

  // Knife scratches: thin grooves at any angle, a dark cut with a lit lower lip, tapering out at both ends.
  for (let k = 0; k < n(6000, 2); k++) {
    let x = hash(SEED + 50, k, 1) * W, y = hash(SEED + 50, k, 2) * H;
    let a = hash(SEED + 50, k, 3) * 6.283;
    const len = 8 + hash(SEED + 50, k, 4) ** 2 * 50, bend = (hash(SEED + 50, k, 5) - 0.5) * 0.04, deep = 1 + hash(SEED + 50, k, 6) * 1.6;
    for (let t = 0; t < len; t += 0.5) {
      const taper = Math.min(1, t / 4, (len - t) / 4);
      darken(px, x, y, Math.floor(deep * taper + bayer(Math.round(x), Math.round(y)) * 0.8));
      if (taper > 0.5 && Math.abs(Math.sin(a)) < 0.8) shift(px, x, y + 1, 1); // the lip below catches the light
      x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5; a += bend;
    }
  }

  // Hammer dents: small dark crescents with a pale rim on the lit side.
  for (let k = 0; k < n(40000, 3); k++) {
    const cx = hash(SEED + 60, k, 1) * W, cy = hash(SEED + 60, k, 2) * H, r = 1.6 + hash(SEED + 60, k, 3) * 1.6;
    along(cx, cy, 0, r, r, r + 2, (x, y, lx, ly) => {
      const e = Math.hypot(lx, ly);
      if (e < 1) darken(px, x, y, lx + ly > 0 ? 0 : 2); // the far wall, in shade
      else if (e < 1.5 && lx + ly > 0.4) shift(px, x, y, 1); // the lit rim
    });
  }

  // Cigarette burns: a cigarette left lying, so an elongated char, black at the core, browned around.
  for (let k = 0; k < n(55000, 4); k++) {
    const cx = hash(SEED + 70, k, 1) * W, cy = hash(SEED + 70, k, 2) * H, len = 4 + hash(SEED + 70, k, 3) * 5, wid = 1.4 + hash(SEED + 70, k, 4);
    along(cx, cy, hash(SEED + 70, k, 5) * 6.283, len, wid, len * 2.2, (x, y, lx, ly) => {
      const e = Math.hypot(lx, ly) + (valueNoise(SEED + 71 + k, x / 2, y / 2) - 0.5) * 0.5;
      if (e < 0.75) stain(px, x, y, [22, 16, 12], 0.9);
      else darken(px, x, y, Math.floor((2 - e) * 2.4 + bayer(x, y) - 0.5));
    });
  }

  // Ink: a blot with a few flung droplets round it, in a blue-black that has soaked into the grain.
  for (let k = 0; k < n(60000, 5); k++) {
    const cx = hash(SEED + 80, k, 1) * W, cy = hash(SEED + 80, k, 2) * H, r = 1.5 + hash(SEED + 80, k, 3) * 2.5;
    const blot = (bx: number, by: number, br: number, salt: number) => along(bx, by, 0, br, br, br + 1, (x, y, lx, ly) => {
      const e = Math.hypot(lx, ly) + (valueNoise(SEED + 81 + salt, x / 1.5, y / 1.5) - 0.5) * 0.7;
      if (e < 1) stain(px, x, y, [30, 30, 38], e < 0.6 ? 0.85 : 0.6);
    });
    blot(cx, cy, r, k * 10);
    for (let j = 0; j < 2 + Math.floor(hash(SEED + 80, k, 4) * 5); j++) {
      const a = hash(SEED + 82, k, j) * 6.283, d = r + 2 + hash(SEED + 83, k, j) * 9;
      blot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.5 + hash(SEED + 84, k, j) * 0.9, k * 10 + j + 1);
    }
  }

  // Candle wax: pale, slightly raised drips in a little cluster.
  for (let k = 0; k < n(70000, 6); k++) {
    const cx = hash(SEED + 90, k, 1) * W, cy = hash(SEED + 90, k, 2) * H;
    for (let j = 0; j < 2 + Math.floor(hash(SEED + 90, k, 3) * 3); j++) {
      const bx = cx + (hash(SEED + 91, k, j) - 0.5) * 12, by = cy + (hash(SEED + 92, k, j) - 0.5) * 8, br = 0.8 + hash(SEED + 93, k, j) * 1.6;
      along(bx, by, 0, br, br, br + 1, (x, y, lx, ly) => {
        const e = Math.hypot(lx, ly);
        if (e < 1) stain(px, x, y, lx + ly < -0.3 ? [148, 140, 120] : [124, 116, 98], 0.75); // lit top-left
        else if (e < 1.5 && lx + ly > 0.3) darken(px, x, y, 1); // its little shadow
      });
    }
  }
}

/** A flat silhouette of `art` in the shadow's colour, `alpha` strong. */
const shadows = new WeakMap<Px, Map<number, Px>>();
/** A drawing's shadow (kept with the drawing). */
const silhouette = (art: Px, alpha = 255): Px => {
  const kept = shadows.get(art)?.get(alpha);
  if (kept) return kept;
  const out = createPx(art.w, art.h);
  const c: RGBA = [I.P.shadow[0], I.P.shadow[1], I.P.shadow[2], alpha];
  for (let i = 0; i < art.w * art.h; i++) if (art.data[i * 4 + 3] >= 128) out.data.set(c, i * 4); // glass (clear, translucent) casts none
  if (!shadows.has(art)) shadows.set(art, new Map());
  shadows.get(art)!.set(alpha, out);
  return out;
};
/** How high each thing lies on the desk, bottom to top: the charts always at the bottom (the calendar just above them), the orders always on
 * top (they're how you go and fly, so nothing may ever lie on them); the loose clutter lies between 0 and 1. */
export const Z: Record<I.ItemId, number> = { chart: 0, calendar: 0.5, letters: 3, logbook: 5, clockcode: 4.5, pad: 4.8, coin: 6, watch: 7, mug: 8, goggles: 8.5, orders: 9 };
/** Things that are part of the scenery: drawn, but not buttons. */
export const SCENERY: readonly I.ItemId[] = ['chart', 'calendar'];
/** How things lie: the chart flat on the desk (a low, faint shadow); everything else on top of it. */
const lie = (id: I.ItemId | null) => (id === 'chart' || id === 'calendar' ? { depth: 2, alpha: 120 } : { depth: id === 'orders' || id === 'clockcode' ? 2 : id === 'logbook' || id === 'watch' || id === 'goggles' ? 4 : id === 'mug' ? 6 : id ? 3 : 2, alpha: 180 }); // one kind of shadow for everything that lies on the desk, hidden things too (the same soft dark, never pitch black); the flat sheets lie lower and fainter

/**
 * One thing on the desk: its square, axis-aligned drawing and a shadow of it, to be drawn turned by `turn`
 * about (cx, cy) (game px), the shadow `depth` px down-right. The pictures are never resampled here: as in
 * flight (see docs/TECH.md §2), they're drawn rotated whole, so each pixel stays a square.
 */
export type Drawn = { id: I.ItemId | null; art: Px; shadow: Px; cx: number; cy: number; turn: number; depth: number; live?: boolean; k: number }; // k: drawn at this size // live: the watch, redrawn as time passes
export type BarnScene = { px: Px; spots: Spot[]; drawn: Drawn[] };

/** The desk on a W × H screen (game px). `order` lifts picked-up things to the top of the pile. */
/** `pixel`: device px per game px on this screen (the usable things shrink only in whole device pixels). */
export function barnScene(W: number, H: number, info: BarnInfo, order: readonly I.ItemId[] = [], keepClear: { x: number; y: number; w: number; h: number }[] = [], pixel = 4): BarnScene {
  const px = createPx(W, H);
  px.data.set(planks(W, H).data); // the bare desk, made once per size
  mugRings(px, sizes(W, H, pixel).usable); // the mug's rings, at the size the things you use are drawn
  const all = arrange(W, H, info, keepClear, pixel);
  const usable = all.usable.filter((u) => SHOWN.includes(u.id)), loose = all.loose;
  // By height on the desk (Z); within a height, picked-up things come to the top.
  const lift = (id: I.ItemId) => (order.includes(id) ? 1 + order.indexOf(id) : 0);
  const sorted = [...usable].sort((a, b) => Z[a.id] - Z[b.id] || lift(a.id) - lift(b.id));
  // A second sheet of the series under the chart, turned less, peeking out above and to its left.
  const chart = sorted.find((u) => u.id === 'chart');
  const under = chart ? (() => {
    const art = drawing(`chart-under:${chart.t.art.w}`, () => I.chartArt(Math.round(chart.t.art.w * 1.08), Math.round(chart.t.art.h * 1.08), 1)), turn = chart.t.turn - 0.14, e = extent(art, turn);
    const cx = chart.x + chart.w / 2 - 28, cy = chart.y + chart.h / 2 - 16;
    return [{ t: { id: 'chart', art, turn, k: 1 } as Thing, x: cx - e.w / 2, y: cy - e.h / 2, ...e }];
  })() : [];
  const zOf = (t: Thing) => t.z ?? (t.id ? Z[t.id] : 0.9); // loose clutter: on the maps, under the things you use (unless it says)
  const upper = [...sorted.filter((u) => Z[u.id] >= 1), ...loose.filter((l) => zOf(l.t) >= 1)].sort((a, b) => zOf(a.t) - zOf(b.t)); // (stable: picked-up order kept)
  const drawn = [...under, ...sorted.filter((u) => Z[u.id] < 1), ...loose.filter((l) => zOf(l.t) < 1), ...upper].map(({ t, x, y, w, h }) => ({ id: t.id, art: t.art, shadow: silhouette(t.art, lie(t.id).alpha), cx: x + w / 2, cy: y + h / 2, turn: t.turn, depth: t.depth ?? lie(t.id).depth, live: t.live, k: t.k }));
  return { px, spots: sorted.filter((u) => !SCENERY.includes(u.id)).map(({ id, t, x, y, w, h }) => { // what's on screen of each (the calendar and goggles may run off an edge)
      const b = hug(t.art, t.turn, t.k), cx = x + w / 2, cy = y + h / 2;
      const x0 = Math.max(0, Math.floor(cx + b.x0)), y0 = Math.max(0, Math.floor(cy + b.y0));
      return { id, x: x0, y: y0, w: Math.min(W, Math.ceil(cx + b.x1)) - x0, h: Math.min(H, Math.ceil(cy + b.y1)) - y0 };
    }), drawn };
}
