// The Story screen's picture: the pilot's desk in the barn, seen from straight above, filling the screen, in
// the game's own pixels (the same size as in flight). Old planks; on them the things of the job
// (story/desk-items.ts), scattered the way a desk gets, every one still partly in view. Pure.

import { bayer, fbm, hash, valueNoise } from '../core/noise.ts';
import { createPx, plot, type Px, type RGBA } from '../core/pixels.ts';
import * as I from './desk-items.ts';
import { CLUTTER, cigaretteEnd, messagePad, sealedLetter, spentMatch } from './clutter.ts';

export type SpotId = I.ItemId;
/** A thing's own box: the rectangle round its drawn pixels, in its own frame, turned with it (game px). */
export type OBox = { cx: number; cy: number; w: number; h: number; turn: number };
/** A pressable thing: where its own box lies (`box`), and the screen rectangle round that, clipped to the screen. */
export type Spot = { id: SpotId; x: number; y: number; w: number; h: number; box: OBox };
export type BarnInfo = I.DateInfo & {
  sortie: number;
  date: string;
  hours?: number; // the watch's time of day …
  sunset?: number; // … and its sunset mark
  logbook?: Readonly<I.LogbookCover>; // the log book as the story has it (rank, number, wear); default: as he arrives
  orders?: Readonly<I.OrdersText>; // what today's orders say, filled in as the story unlocks them; default: the first sortie's
  mail?: boolean; // a letter from home has come: it lies on the desk, sealed, until the story moves on
};

// Every drawing here depends only on what it's drawn from, and some are slow (the chart ~14 ms): each is made once and kept, so a resize or a new arrangement costs only the layout.
const drawings = new Map<string, Px>();
/** The drawing `key` names, made once. (Callers must not draw into it: it's shared.) */
export const drawing = (key: string, make: () => Px): Px => drawings.get(key) ?? (drawings.set(key, make()), drawings.get(key)!);

/** What the barn's loading screen says while the desk is set out: one, at random. */
export const BARN_LOADING = [
  'SORTING THE MORNING POST', 'CLEARING A SPACE ON THE DESK', 'WINDING THE WATCH', 'SHARPENING THE PENCIL',
  'FINDING THE GOGGLES', 'WARMING UP THE COFFEE', 'SMOOTHING OUT THE MAPS', 'READING THE ORDERS TWICE',
  'BLOTTING THE INK', 'TURNING THE CALENDAR', 'EMPTYING THE ASHTRAY', 'FILLING IN THE LOG BOOK',
  'PINNING UP THE CHART', 'LIGHTING THE PIPE', 'LOOKING FOR THE SIXPENCE', 'TIDYING AWAY THE TOOLS',
  'CHECKING THE CLOCK CODE', 'STRAIGHTENING THE PAPERS', 'PUSHING ASIDE THE BISCUITS', 'TRIMMING THE CANDLE',
] as const;

const SEED = 1916;
// The things you use on the desk, brought back one at a time (the letters are still to come).
export const SHOWN: readonly I.ItemId[] = ['chart', 'orders', 'calendar', 'logbook', 'clockcode', 'goggles', 'mug', 'watch', 'pad', 'coin'];
// … and of the loose clutter (story/clutter.ts), only these by name, brought back one at a time.
export const CLUTTER_SHOWN: readonly string[] = ['postcard', 'spanner', 'ashtray', 'pencil', 'matches', 'tin', 'ink', 'knife', 'flask', 'pen', 'candle', 'rounds'];
type Box = { x: number; y: number; w: number; h: number };
type Thing = { id: I.ItemId | null; art: Px; turn: number; live?: boolean; k: number; keep?: Box[]; z?: number; depth?: number; spin?: boolean; relit?: (turn: number) => Px; bears: boolean; name?: string; body?: Box; shy?: Box }; // shy: the part of it (in its pixels) others keep off, if not all of it // body: the part of its drawing (in its pixels) that is its own box, if not all of it // bears: whether anything may lie on top of it // k: drawn at this size (the drawing's pixels × k game px) // keep: parts of it (in its pixels) nothing may cover

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
  const t = (id: I.ItemId | null, art: Px, n: number): Thing => ({ id, art, turn: (hash(SEED, n, 3) - 0.5) * 0.5, k: size.usable, bears: id ? BEARS[id] : true });
  return {
    usable: [
      { ...t('chart', drawing(`chart:${cw}:${size.usable}`, () => I.chartArt(cw, Math.round((cw * 176) / 250), 0, size.usable)), 1), turn: 0.35, k: 1 }, // the map: its own size
      { ...t('orders', ordersDrawing(info), 4), turn: 0 }, // square, front and centre, and on top of everything: the way to the next flight
      { ...t('calendar', drawing(`calendar:${info.day}:${info.month}:${info.year}:${bigCal}`, () => I.calendarArt(info, bigCal)), 8), k: 1, keep: I.calendarKeep(info, bigCal) }, // its own size, like the maps; the month and the days round today stay in view
      { ...t('clockcode', drawing('clockcode', I.clockcodeArt), 5), turn: -0.1, shy: { x: 42, y: 44, w: 116, h: 128 } }, // others keep off only its rings, the middle third; its margins may be covered // placed first so the rest lie around it; only a little off square, the other way, to be read where it lies
      ...(info.mail ? [t('letters', drawing('letters', sealedLetter), 3)] : []), // a letter from home, sealed: only while there is mail (nothing lies round where it would be otherwise)
      t('logbook', logbookDrawing(info), 2),
      { ...t('goggles', drawing('goggles', I.gogglesArt), 24), turn: -0.2, body: { x: 20, y: 6, w: 174, h: 72 }, keep: [{ x: 20, y: 6, w: 174, h: 72 }] }, // its own box is the mask and lenses: the strap may run off an edge, and things may lie on it // the mask and lenses stay in view; the strap round them may be covered // the same size as the other things you use, shrinking with them
      ...(SHOWN.includes('pad') ? [t('pad', drawing('pad', messagePad), 10)] : []), // the message pad: a thing you can pick up (the last of the papers, after the goggles, which need the room most)
      t('mug', drawing('coffee', I.coffeeArt), 12),
      ...(SHOWN.includes('coin') ? [((turn) => ({ ...t('coin', drawing(`coin:${turn.toFixed(3)}`, () => I.coinArt(turn)), 21), turn }))(hash(SEED, 21, 9) * Math.PI * 2)] : []), // the sixpence: the one bit of clutter you can pick up, dropped any way round (and lit for it)
      { ...t('watch', drawing(`watch:${info.hours ?? 8}:${info.sunset ?? 19.5}`, () => I.watchArt(info.hours ?? 8, info.sunset ?? 19.5)), 20), live: true }, // redrawn as time passes
    ],
    // The clutter (story/clutter.ts), at the size of the things you use, each turned any way at all.
    loose: CLUTTER.flatMap((c, n) => (CLUTTER_SHOWN.includes(c.name) ? [{ ...t(null, drawing(`clutter:${c.name}`, c.art), 60 + n), turn: c.turn ?? hash(SEED, 60 + n, 9) * Math.PI * 2, z: c.z, depth: c.depth, spin: c.spin, bears: c.bears, name: c.name, relit: c.spin ? (turn: number) => drawing(`clutter:${c.name}:${turn.toFixed(3)}`, () => c.art(turn)) : undefined }] : [])),
  };
}

// ── Geometry: every collision is between things' own boxes (turned rectangles), by the area they share.
type Pt = [number, number];
export type Quad = Pt[];
/** The four corners of a turned box. */
export const quadOf = (b: OBox): Quad => {
  const c = Math.cos(b.turn), n = Math.sin(b.turn), hw = b.w / 2, hh = b.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [b.cx + x * c - y * n, b.cy + x * n + y * c] as Pt);
};
const rectQuad = (b: Box): Quad => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
const signed = (p: Quad) => p.reduce((q, [x, y], i) => { const [X, Y] = p[(i + 1) % p.length]; return q + x * Y - X * y; }, 0) / 2;
export const quadArea = (p: Quad) => Math.abs(signed(p));
/** The area two convex shapes share (Sutherland–Hodgman: clip one by each edge of the other). */
export function meet(a: Quad, b: Quad): number {
  const ax0 = Math.min(...a.map((p) => p[0])), ax1 = Math.max(...a.map((p) => p[0])), ay0 = Math.min(...a.map((p) => p[1])), ay1 = Math.max(...a.map((p) => p[1]));
  const bx0 = Math.min(...b.map((p) => p[0])), bx1 = Math.max(...b.map((p) => p[0])), by0 = Math.min(...b.map((p) => p[1])), by1 = Math.max(...b.map((p) => p[1]));
  if (ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0) return 0;
  const dir = Math.sign(signed(b)) || 1;
  let out: Pt[] = a;
  for (let i = 0; i < b.length && out.length; i++) {
    const [px, py] = b[i], [qx, qy] = b[(i + 1) % b.length], ins = (p: Pt) => ((qx - px) * (p[1] - py) - (qy - py) * (p[0] - px)) * dir >= 0;
    const cut = (p: Pt, q: Pt): Pt => { const d1 = (qx - px) * (p[1] - py) - (qy - py) * (p[0] - px), d2 = (qx - px) * (q[1] - py) - (qy - py) * (q[0] - px), t = d1 / (d1 - d2); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    const next: Pt[] = [];
    out.forEach((cur, j) => {
      const prev = out[(j + out.length - 1) % out.length];
      if (ins(cur)) { if (!ins(prev)) next.push(cut(prev, cur)); next.push(cur); } else if (ins(prev)) next.push(cut(prev, cur));
    });
    out = next;
  }
  return out.length > 2 ? quadArea(out) : 0;
}
/** Whether (x, y) lies inside a convex quad. */
const inside = (q: Quad, x: number, y: number) => { const d = Math.sign(signed(q)) || 1; return q.every(([ax, ay], i) => { const [bx, by] = q[(i + 1) % q.length]; return ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) * d >= 0; }); };
/** A few drips of ink spilt beside the bottle (its own box `b`, drawn `k` × size), as a flat stain in screen
 * space, centred on the bottle: none where `blocked` (what stands up off the desk there, which the ink can't lie on). */
const DROPS = [[0, 4, 3.4], [0.32, 3, 2], [-0.22, 9, 1.6], [0.12, 12, 1.1], [-0.08, 14.5, 0.8], [0.42, 8, 1], [-0.4, 4.5, 1.2]]; // [angle off the side, px out, radius]: a pool and its splashes
/** Where each drop lands (screen px) when they fall on `side` of the bottle. */
const dropsAt = (b: OBox, k: number, side: number) => { const out = Math.min(b.w, b.h) / 2; return DROPS.map(([da, dd, r]) => [b.cx + Math.cos(side + da) * (out + dd * k), b.cy + Math.sin(side + da) * (out + dd * k), r] as const); };
function inkDrips(b: OBox, k: number, blocked: (x: number, y: number) => boolean, side: number): Px {
  const R = Math.ceil(Math.hypot(b.w, b.h) / 2 / k + 16), S = 2 * R, px = createPx(S, S);
  const INK: RGBA = [26, 30, 46, 255], WET: RGBA = [70, 82, 112, 255];
  for (const [sx, sy, r] of dropsAt(b, k, side)) { // all to one side, from the bottle's edge: where it was knocked
    const cx = R + (sx - b.cx) / k, cy = R + (sy - b.cy) / k;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + (valueNoise(SEED + 72, x, y) - 0.5) * 0.5;
      if (d > r || x < 0 || y < 0 || x >= S || y >= S) continue;
      if (blocked(b.cx + (x + 0.5 - R) * k, b.cy + (y + 0.5 - R) * k)) continue;
      plot(px, x, y, r > 1.4 && x + 0.5 < cx - r * 0.3 && y + 0.5 < cy - r * 0.3 ? WET : INK); // the bigger drops still wet: a lit edge on the top-left
    }
  }
  return px;
}
/** The rectangle round a drawing's pixels, in its own pixels. */
const tights = new WeakMap<Px, Box>();
const tight = (a: Px): Box => {
  const kept = tights.get(a);
  if (kept) return kept;
  let x0 = a.w, y0 = a.h, x1 = 0, y1 = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.data[(y * a.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
  const b = x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: a.w, h: a.h };
  tights.set(a, b);
  return b;
};
/** The box of part `b` (in the drawing's pixels; default: all of it) of `art` drawn `k` × size, turned, centred at (cx, cy). */
const ownBox = (art: Px, turn: number, k: number, cx: number, cy: number, b: Box = tight(art)): OBox => {
  const ox = (b.x + b.w / 2 - art.w / 2) * k, oy = (b.y + b.h / 2 - art.h / 2) * k, c = Math.cos(turn), n = Math.sin(turn);
  return { cx: cx + ox * c - oy * n, cy: cy + ox * n + oy * c, w: b.w * k, h: b.h * k, turn };
};
/** A thing's bounding box when turned. */
const extent = (a: Px, turn: number, k = 1) => ({ w: Math.ceil((Math.abs(a.w * Math.cos(turn)) + Math.abs(a.h * Math.sin(turn))) * k), h: Math.ceil((Math.abs(a.w * Math.sin(turn)) + Math.abs(a.h * Math.cos(turn))) * k) });

/**
 * Where everything goes: each usable thing at the seeded spot (of many tried) that covers the least of the
 * ones already down, so the desk looks scattered but each stays mostly in view; the loose things wherever
 * they fall, under the usable ones. `keepClear` is screen space other controls use (the plates).
 */
export function arrange(W: number, H: number, info: BarnInfo, keepClear: { x: number; y: number; w: number; h: number }[] = [], pixel = 4) {
  const { usable, loose } = things(info, W, H, pixel);
  const shown = (id: I.ItemId) => SHOWN.includes(id) || (id === 'letters' && !!info.mail); // what's on the desk now (the letter only with mail)
  type Laid = Spot & { t: Thing; turn: number; quad: Quad; shyQuad: Quad; score: number; ex: number; ey: number; e: { w: number; h: number } }; // ex, ey, e: the turned drawing's extent on screen (it's drawn centred in it)
  const placed: Laid[] = [];
  const guard: { id: I.ItemId; box: OBox; quad: Quad }[] = []; // what nothing may cover (the calendar's month and its days round today, the goggles' lenses)
  const m = 2, screen = rectQuad({ x: 0, y: 0, w: W, h: H }), plates = keepClear.map(rectQuad);
  /** The parts of `t` it keeps clear, when it lies centred at (cx, cy) turned by `turn`. */
  const kept = (t: Thing, cx: number, cy: number, turn: number) => (t.keep ?? []).map((b) => ownBox(t.art, turn, t.k, cx, cy, b));
  // Everything down so far, with its height and whether it bears weight: nothing may lie on what doesn't.
  const laid: { quad: Quad; z: number; bears: boolean }[] = [];
  const zOf = (t: Thing) => t.z ?? (t.id ? Z[t.id] : 0.9); // loose clutter: on the maps, under the things you use (unless it says)
  /** A thing lying at the screen box `e` (its turned extent) put at (x, y): its own box, and the screen rectangle round that. */
  const at = (t: Thing, x: number, y: number, e: { w: number; h: number }, turn: number) => {
    const box = ownBox(t.art, turn, t.k, x + e.w / 2, y + e.h / 2, t.body), quad = quadOf(box);
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const shyQuad = t.shy ? quadOf(ownBox(t.art, turn, t.k, x + e.w / 2, y + e.h / 2, t.shy)) : quad; // what others keep off
    return { id: (t.id ?? 'chart') as I.ItemId, x: x0, y: y0, w: Math.min(W, Math.ceil(Math.max(...xs))) - x0, h: Math.min(H, Math.ceil(Math.max(...ys))) - y0, box, quad, shyQuad, turn, ex: x, ey: y, e };
  };
  const apart = Math.hypot(W, H) / 3; // how far apart the big papers' centres would like to be
  const CENTRE = 3; // how hard the papers lean in to the middle (per px² of paper, at the screen's corner)
  const spotFor = (t: Thing, k: number, avoid: readonly { quad: Quad; weight?: number }[]): Laid => {
    let e = extent(t.art, t.turn, t.k);
    // The orders lie square in the middle of the desk, a touch low, whatever else has to move round them.
    if (t.id === 'orders') return { ...at(t, Math.round((W - e.w) / 2), Math.round(Math.max(m, (H - e.h) / 2 + H * 0.03)), e, t.turn), t, score: 0 };
    // The chart lies right of centre and a little low, bleeding off the right and bottom edges.
    if (t.id === 'chart') {
      const cx = Math.max(W * 0.55, W - e.w * 0.45), cy = Math.max(H * 0.55, H - e.h * 0.45);
      return { ...at(t, Math.round(cx - e.w / 2), Math.round(cy - e.h / 2), e, t.turn), t, score: 0 };
    }
    let best: Laid | null = null;
    const zt = zOf(t);
    // Where it may go: anywhere on screen; the calendar may run a third of itself off any edge (its kept parts
    // stay on); the clock-code card on the left, to balance the pale papers on the right.
    const bleed = t.id === 'calendar' ? 0.35 : t.id === 'goggles' ? 0.45 : 0; // the goggles' strap may run off an edge (the mask and lenses, its kept parts, may not)
    const x0 = m - e.w * bleed, x1 = Math.max(x0, t.id === 'clockcode' ? W * 0.34 - e.w / 2 : W - e.w * (1 - bleed) - m); // the card's centre stays in the left third
    const y0 = m - e.h * bleed, y1 = Math.max(y0, H - e.h * (1 - bleed) - m);
    for (let i = 0; i < (t.spin || t.id === 'goggles' ? 3000 : 900); i++) { // (many tries: the desk is crowded; more for what is long or big)
      const turn = t.spin ? Math.floor(hash(SEED + k, i, 3) * 36) / 36 * Math.PI * 2 : t.turn; // a long thing is tried every way round
      if (t.spin) e = extent(t.art, turn, t.k);
      const mm = t.spin ? 8 : 0, X1 = t.spin ? Math.max(x0 + mm, W - e.w - m - mm) : x1, Y1 = t.spin ? Math.max(y0 + mm, H - e.h - m - mm) : y1; // (kept a little off the screen's edge)
      const s = at(t, Math.round(x0 + mm + hash(SEED + k, i, 1) * (X1 - x0 - mm)), Math.round(y0 + mm + hash(SEED + k, i, 2) * (Y1 - y0 - mm)), e, turn);
      const cover = (q: Quad) => meet(s.quad, q);
      const tips = laid.reduce((q, o) => ((zt > o.z ? !o.bears : !t.bears) ? q + cover(o.quad) : q), 0); // lying on (or under) what can't take it
      const own = kept(t, s.ex + e.w / 2, s.ey + e.h / 2, turn).map(quadOf); // its own kept parts must stay on screen and clear of the plates
      const off = own.reduce((q, b) => q + quadArea(b) - meet(b, screen), 0);
      const low = t.id === 'goggles' && W < 700 ? (y1 - s.ey) * 3 : 0; // on a narrow desk the goggles prefer the bottom, where the room is
      // A big paper keeps its distance from the others down (centre to centre), so they spread out evenly.
      const spread = t.id && PAPERS.includes(t.id) ? placed.reduce((q, p) => (PAPERS.includes(p.id) ? q + Math.max(0, apart - Math.hypot(p.box.cx - s.box.cx, p.box.cy - s.box.cy)) ** 2 : q), 0) : 0;
      // The big papers lean in towards the middle of the desk (by their size and how far out they are), while
      // keeping their distance from each other: a balanced group in the centre, the rest scattered round them.
      const out = ((s.box.cx - W / 2) ** 2 + (s.box.cy - H / 2) ** 2) / ((W / 2) ** 2 + (H / 2) ** 2);
      const centre = t.id && PAPERS.includes(t.id) && t.id !== 'calendar' ? CENTRE * quadArea(s.quad) * out : 0; // (the calendar runs off an edge instead, under the rest)
      const score = low + spread + centre + tips * 1000000 + avoid.reduce((sum, a) => sum + cover(a.quad) * (a.weight ?? 1), 0) +
        own.reduce((q, b) => q + laid.reduce((r, o) => (o.z > zt ? r + meet(b, o.quad) : r), 0), 0) * 100000 + // and what a thing keeps clear isn't under anything down already that lies above it
        off * 1000000 + plates.reduce((sum, a) => sum + cover(a) * 30 + own.reduce((q, b) => q + meet(b, a) * 1000, 0), 0) + guard.reduce((sum, a) => sum + cover(a.quad) * 100000, 0);
      if (!best || score < best.score) best = { ...s, t, score };
    }
    return best!;
  };
  usable.forEach((t, k) => {
    const s = spotFor(t, k, placed.filter((p) => !SCENERY.includes(p.id)).map((p) => ({ quad: p.shyQuad, weight: t.id === 'coin' ? 0.2 : 1 }))); // things may lie on the maps and the calendar (but never on its days round today); the sixpence, small, may lie on most things
    placed.push(s); laid.push({ quad: s.quad, z: zOf(t), bears: t.bears });
    if (shown(t.id!)) guard.push(...kept(t, s.ex + s.e.w / 2, s.ey + s.e.h / 2, s.turn).map((box) => ({ id: t.id!, box, quad: quadOf(box) })));
  });
  const onDesk = placed.filter((p) => shown(p.id) && Z[p.id] >= 1); // loose things keep off what's shown, but may lie on the maps
  const shyDesk = onDesk.map((p) => ({ quad: p.shyQuad }));
  // The clutter fills what's left: biggest first, each where it covers least of the things you use and of
  // the clutter already down (so it spreads out into every gap), and never what any of them keeps clear. It is
  // what gives way on a small desk: the things you use never shrink to make room for it, so a piece with no
  // good place is left off (one that would break a hard rule, or, lying under the things you use, be more than
  // a quarter hidden by them).
  const down: { quad: Quad }[] = [];
  const lying = [...loose].sort((a, b) => b.art.w * b.art.h - a.art.w * a.art.h).flatMap((t, k) => {
    const cal = placed.filter((p) => p.id === 'calendar'); // the calendar is to be read: clutter keeps mostly off its face
    // Most clutter keeps off the things you use (they count three times over); what lies on top of them (a high
    // `z`) may lie across anything that bears it (see `BEARS`), a little shy of covering the rest.
    const high = (t.z ?? 0) >= 1;
    const avoid = high ? [...placed.filter((p) => shown(p.id) && p.id !== 'chart').map((p) => ({ quad: p.shyQuad, weight: 0.2 })), ...down] : [...shyDesk, ...shyDesk, ...shyDesk, ...cal, ...down];
    const s = spotFor(t, 40 + k, avoid);
    const hidden = high ? 0 : onDesk.reduce((r, a) => r + meet(s.quad, a.quad), 0) / quadArea(s.quad); // (hidden: by all of what lies over it)
    if (s.score >= 100000 || hidden > 0.25) return [];
    down.push(s); laid.push({ quad: s.quad, z: zOf(t), bears: t.bears });
    return [{ ...s, t: { ...t, turn: s.turn, art: t.relit?.(s.turn) ?? t.art } }];
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
export const Z: Record<I.ItemId, number> = { chart: 0, calendar: 0.5, letters: 3, logbook: 5, clockcode: 4.5, pad: 4.8, coin: 6, watch: 7, goggles: 7.8, mug: 8, orders: 9 }; // the coffee stands on the goggles' strap, never under it
/** Things that are part of the scenery: drawn, but not buttons. */
export const SCENERY: readonly I.ItemId[] = ['chart', 'calendar'];
/** The big papers: placed first (after the chart), spread out evenly over the desk to balance it, and the rest fit
 * in round them. */
export const PAPERS: readonly I.ItemId[] = ['orders', 'calendar', 'clockcode', 'letters', 'logbook', 'pad'];
/** Whether anything may lie on top of each thing: the flat papers and books, yes; what is round, tall or would
 * tip (the coffee, the watch, the goggles, the sixpence on its cord) and the orders (always on top: the way to the next flight), no. */
export const BEARS: Record<I.ItemId, boolean> = { chart: true, calendar: true, letters: true, logbook: true, clockcode: true, pad: true, coin: false, watch: false, mug: false, goggles: false, orders: false };
/** How things lie: the chart flat on the desk (a low, faint shadow); everything else on top of it. */
const lie = (id: I.ItemId | null) => (id === 'chart' || id === 'calendar' ? { depth: 2, alpha: 120 } : { depth: id === 'orders' || id === 'clockcode' || id === 'coin' ? 2 : id === 'logbook' || id === 'watch' || id === 'goggles' ? 4 : id === 'mug' ? 6 : id ? 3 : 2, alpha: 180 }); // one kind of shadow for everything that lies on the desk, hidden things too (the same soft dark, never pitch black); the flat sheets lie lower and fainter

/**
 * One thing on the desk: its square, axis-aligned drawing and a shadow of it, to be drawn turned by `turn`
 * about (cx, cy) (game px), the shadow `depth` px down-right. The pictures are never resampled here: as in
 * flight (see docs/TECH.md §2), they're drawn rotated whole, so each pixel stays a square.
 */
export type Drawn = { id: I.ItemId | null; art: Px; shadow: Px; cx: number; cy: number; turn: number; depth: number; live?: boolean; k: number; stain?: boolean }; // k: drawn at this size // live: the watch, redrawn as time passes // stain: not a thing (spilt ink): no shadow, no button
/** The layout's boxes, for the debug overlay (story.html `?boxes`), as corners in game px:
 * - `box`: each thing's own box, which it is placed, stacked and pressed by (`bears` false: nothing may lie on it);
 * - `shy`: the only part of a thing others keep off, where that isn't all of it (the clock-code's rings);
 * - `keep`: what may never be covered (the calendar's days round today, the goggles' lenses);
 * - `clear`: screen kept for the plates. */
export type DebugBox = { kind: 'box' | 'shy' | 'keep' | 'clear'; label: string; bears?: boolean; quad: Quad };
export type BarnScene = { px: Px; spots: Spot[]; drawn: Drawn[]; boxes: DebugBox[] };

/** The desk on a W × H screen (game px). `order` lifts picked-up things to the top of the pile. */
/** `pixel`: device px per game px on this screen (the usable things shrink only in whole device pixels). */
export function barnScene(W: number, H: number, info: BarnInfo, order: readonly I.ItemId[] = [], keepClear: { x: number; y: number; w: number; h: number }[] = [], pixel = 4): BarnScene {
  const px = createPx(W, H);
  px.data.set(planks(W, H).data); // the bare desk, made once per size
  mugRings(px, sizes(W, H, pixel).usable); // the mug's rings, at the size the things you use are drawn
  const all = arrange(W, H, info, keepClear, pixel);
  const usable = all.usable.filter((u) => SHOWN.includes(u.id) || (u.id === 'letters' && !!info.mail)), loose = all.loose;
  // By height on the desk (Z); within a height, picked-up things come to the top.
  const lift = (id: I.ItemId) => (order.includes(id) ? 1 + order.indexOf(id) : 0);
  const sorted = [...usable].sort((a, b) => Z[a.id] - Z[b.id] || lift(a.id) - lift(b.id));
  // A second sheet of the series under the chart, turned less, peeking out above and to its left.
  const chart = sorted.find((u) => u.id === 'chart');
  const under = chart ? (() => {
    const art = drawing(`chart-under:${chart.t.art.w}`, () => I.chartArt(Math.round(chart.t.art.w * 1.08), Math.round(chart.t.art.h * 1.08), 1)), turn = chart.t.turn - 0.14, e = extent(art, turn);
    const cx = chart.x + chart.w / 2 - 28, cy = chart.y + chart.h / 2 - 16;
    return [{ t: { id: 'chart', art, turn, k: 1 } as Thing, ex: cx - e.w / 2, ey: cy - e.h / 2, e }];
  })() : [];
  const zOf = (t: Thing) => t.z ?? (t.id ? Z[t.id] : 0.9);
  const upper = [...sorted.filter((u) => Z[u.id] >= 1), ...loose.filter((l) => zOf(l.t) >= 1)].sort((a, b) => zOf(a.t) - zOf(b.t)); // (stable: picked-up order kept)
  const drawn: Drawn[] = [...under, ...sorted.filter((u) => Z[u.id] < 1), ...loose.filter((l) => zOf(l.t) < 1), ...upper].map(({ t, ex, ey, e }) => ({ id: t.id, art: t.art, shadow: silhouette(t.art, lie(t.id).alpha), cx: ex + e.w / 2, cy: ey + e.h / 2, turn: t.turn, depth: (t.depth ?? lie(t.id).depth) * t.k, live: t.live, k: t.k }));
  const spots: Spot[] = sorted.filter((u) => !SCENERY.includes(u.id)).map(({ id, x, y, w, h, box }) => ({ id, x, y, w, h, box })); // pressed by its own box
  const boxes: DebugBox[] = [
    ...usable.map((u) => ({ kind: 'box' as const, label: u.id, bears: u.t.bears, quad: u.quad })),
    ...loose.map((l) => ({ kind: 'box' as const, label: l.t.name ?? 'clutter', bears: l.t.bears, quad: l.quad })),
    ...usable.filter((u) => u.t.shy).map((u) => ({ kind: 'shy' as const, label: `${u.id} shy`, quad: u.shyQuad })),
    ...all.guard.map((g) => ({ kind: 'keep' as const, label: `${g.id} keep`, quad: g.quad })),
    ...keepClear.map((c) => ({ kind: 'clear' as const, label: 'plates', quad: rectQuad(c) })),
  ];
  // A few drips of ink by the bottle, on whatever lies there: drawn just under the bottle, and never on what stands
  // up off the desk below it (the coffee, the watch, the goggles, the tin …), where ink couldn't lie.
  const ink = loose.find((l) => l.t.name === 'ink');
  if (ink) {
    const zi = zOf(ink.t), tall = [...usable.filter((u) => !u.t.bears && Z[u.id] < zi), ...loose.filter((l) => l !== ink && !l.t.bears && zOf(l.t) < zi)].map((u) => u.quad);
    const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || tall.some((q) => inside(q, x, y));
    const over = [...usable.filter((u) => Z[u.id] > zi), ...loose.filter((l) => l === ink || zOf(l.t) > zi)].map((u) => ({ q: u.quad, d: (u.t.depth ?? lie(u.t.id).depth) * u.t.k })); // what would hide them, and its shadow (the bottle's own too)
    const sides = Array.from({ length: 8 }, (_, j) => hash(SEED, 71, 1) * Math.PI * 2 + (j * Math.PI) / 4);
    const free = (side: number) => dropsAt(ink.box, ink.t.k, side).reduce((q, [x, y, r]) => q + (blocked(x, y) || over.some((o) => inside(o.q, x, y) || inside(o.q, x - o.d, y - o.d)) ? 0 : r * r), 0);
    const side = sides.reduce((a, b) => (free(b) > free(a) ? b : a)); // they fall on the side with the most clear desk
    const art = inkDrips(ink.box, ink.t.k, blocked, side);
    const at = drawn.findIndex((d) => d.art === ink.t.art);
    drawn.splice(at, 0, { id: null, art, shadow: createPx(1, 1), cx: ink.box.cx, cy: ink.box.cy, turn: 0, depth: 0, live: false, k: ink.t.k, stain: true });
  }
  // What's been left by the ashtray and the candle: a few cigarette ends and spent matches beside each, lying on
  // whatever is there (never on what stands up, never where something above would hide them), drawn just under it.
  const things_ = [...usable.map((u) => ({ q: u.quad, z: Z[u.id], bears: u.t.bears, d: (u.t.depth ?? lie(u.t.id).depth) * u.t.k })), ...loose.map((l) => ({ q: l.quad, z: zOf(l.t), bears: l.t.bears, d: (l.t.depth ?? 2) * l.t.k }))];
  const litter: Quad[] = [];
  const beside = (name: string, make: (n: number, turn: number) => Px, count: number, salt: number) => {
    const p = loose.find((l) => l.t.name === name);
    if (!p) return;
    const zp = zOf(p.t), k = p.t.k;
    const clear = (x: number, y: number) => x > 1 && y > 1 && x < W - 1 && y < H - 1 && !inside(p.quad, x, y) &&
      things_.every((o) => (o.z > zp ? !inside(o.q, x, y) && !inside(o.q, x - o.d, y - o.d) : o.bears || !inside(o.q, x, y))) && !litter.some((q) => inside(q, x, y));
    for (let n = 0; n < count; n++) {
      for (let i = 0; i < 60; i++) {
        const a = hash(SEED + salt, n, i) * Math.PI * 2, turn = hash(SEED + salt + 1, n, i) * Math.PI * 2;
        const dist = Math.min(p.box.w, p.box.h) / 2 + (4 + hash(SEED + salt + 2, n, i) * 14) * k;
        const cx = p.box.cx + Math.cos(a) * dist, cy = p.box.cy + Math.sin(a) * dist, art = drawing(`${name}:litter:${n}:${turn.toFixed(2)}`, () => make(n, turn));
        const q = quadOf(ownBox(art, turn, k, cx, cy));
        if (![...q, [cx, cy]].every(([x, y]) => clear(x, y))) continue;
        litter.push(q);
        drawn.splice(drawn.findIndex((d) => d.art === p.t.art), 0, { id: null, art, shadow: silhouette(art, lie(null).alpha), cx, cy, turn, depth: 1 * k, live: false, k, stain: true });
        break;
      }
    }
  };
  beside('ashtray', (n, turn) => (n < 2 ? cigaretteEnd(n, turn) : spentMatch(n, turn)), 3, 81);
  beside('candle', (n, turn) => spentMatch(n + 3, turn), 2, 91);
  return { px, spots, drawn, boxes };
}
