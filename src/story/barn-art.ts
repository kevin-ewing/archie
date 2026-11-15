// The Story screen's picture: the pilot's desk in the barn, seen from straight above, filling the screen, in
// the game's own pixels (the same size as in flight). Old planks; on them the things of the job
// (story/desk-items.ts), scattered the way a desk gets, every one still partly in view. Pure.

import { hash } from '../core/noise.ts';
import { createPx, plot, type Px, type RGBA } from '../core/pixels.ts';
import * as I from './desk-items.ts';

export type SpotId = I.ItemId;
export type Spot = { id: SpotId; x: number; y: number; w: number; h: number };
export type BarnScene = { px: Px; spots: Spot[] };
export type BarnInfo = I.DateInfo & { sortie: number; date: string };

const SEED = 1916;
type Thing = { id: I.ItemId | null; art: Px; turn: number };

/** The usable things, bottom of the pile first, then what just lies about. */
function things(info: BarnInfo): { usable: Thing[]; loose: Thing[] } {
  const t = (id: I.ItemId | null, art: Px, k: number): Thing => ({ id, art, turn: (hash(SEED, k, 3) - 0.5) * 0.5 });
  return {
    usable: [t('chart', I.chartArt(), 1), t('logbook', I.logbookArt(), 2), t('letters', I.lettersArt(), 3), t('orders', I.ordersArt(info.sortie, info.date), 4), t('clockcode', I.clockcodeArt(), 5), t('helmet', I.helmetArt(), 6), t('photo', I.photoArt(), 7), t('calendar', I.calendarArt(info), 8)],
    loose: [t(null, I.padArt(), 10), t(null, I.tinArt(), 11), t(null, I.mugArt(), 12), t(null, I.lampArt(), 13), t(null, I.compassArt(), 14), t(null, I.matchesArt(), 15), t(null, I.pencilArt(), 16), t(null, I.penArt(), 17), t(null, I.spentMatchArt(), 18), t(null, I.spentMatchArt(), 19)],
  };
}

/** A thing's bounding box when turned. */
const extent = (a: Px, turn: number) => ({ w: Math.ceil(Math.abs(a.w * Math.cos(turn)) + Math.abs(a.h * Math.sin(turn))), h: Math.ceil(Math.abs(a.w * Math.sin(turn)) + Math.abs(a.h * Math.cos(turn))) });
const overlap = (a: Spot, b: { x: number; y: number; w: number; h: number }) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where everything goes: each usable thing at the seeded spot (of many tried) that covers the least of the
 * ones already down, so the desk looks scattered but each stays mostly in view; the loose things wherever
 * they fall, under the usable ones. `keepClear` is screen space other controls use (the plates).
 */
export function arrange(W: number, H: number, info: BarnInfo, keepClear: { x: number; y: number; w: number; h: number }[] = []) {
  const { usable, loose } = things(info);
  const placed: (Spot & { t: Thing })[] = [];
  const m = 2;
  const spotFor = (t: Thing, k: number, avoid: readonly { x: number; y: number; w: number; h: number }[]) => {
    const e = extent(t.art, t.turn);
    let best: Spot | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < 90; i++) {
      const x = Math.round(m + hash(SEED + k, i, 1) * Math.max(0, W - e.w - 2 * m));
      const y = Math.round(m + hash(SEED + k, i, 2) * Math.max(0, H - e.h - 2 * m));
      const s = { id: (t.id ?? 'chart') as I.ItemId, x, y, ...e };
      const score = avoid.reduce((sum, a) => sum + overlap(s, a), 0) + keepClear.reduce((sum, a) => sum + overlap(s, a) * 4, 0);
      if (score < bestScore) { best = s; bestScore = score; }
    }
    return best!;
  };
  usable.forEach((t, k) => placed.push({ ...spotFor(t, k, placed), id: t.id!, t }));
  const lying = loose.map((t, k) => ({ t, ...spotFor(t, 40 + k, placed) }));
  return { usable: placed, loose: lying };
}

const DARK: RGBA = I.P.dark;

/** The desk top: wide planks across, each its own shade, long grain streaks, knots, nail heads, old rings. */
function desk(px: Px) {
  const { w: W, h: H } = px;
  const board = 26;
  for (let y = 0; y < H; y++) {
    const b = Math.floor(y / board);
    const within = y - b * board;
    const shade = Math.floor(hash(SEED, b, 0) * 4) * 5;
    for (let x = 0; x < W; x++) {
      if (within === 0) { plot(px, x, y, DARK); continue; }
      if (within === 1) { plot(px, x, y, [126 + shade, 86 + shade, 52 + shade, 255]); continue; }
      // Grain: streaks a few px long, wavy across the board.
      const wave = Math.round(3 * Math.sin((x + b * 37) / 23) + 2 * Math.sin((x + b * 11) / 7));
      const streak = hash(SEED + 1, Math.floor((x + b * 101) / 9), within + wave) < 0.16;
      const dark = hash(SEED + 2, Math.floor((x + b * 53) / 5), within + wave) < 0.07;
      const v = streak ? -10 : dark ? -18 : 0;
      plot(px, x, y, [104 + shade + v, 68 + shade + v, 40 + shade + Math.round(v * 0.7), 255]);
    }
    // A butt joint now and then, with its nails.
    const joint = Math.floor(hash(SEED, b, 4) * W);
    for (let k = 1; k < board && y === b * board; k++) {
      plot(px, joint, b * board + k, DARK);
      if (k === 4 || k === board - 5) { plot(px, joint - 3, b * board + k, [140, 132, 116, 255]); plot(px, joint + 3, b * board + k, [140, 132, 116, 255]); }
    }
  }
  for (let k = 0; k < Math.ceil((W * H) / 9000); k++) { // knots
    const kx = Math.floor(hash(SEED, k, 5) * W), ky = Math.floor(hash(SEED, k, 6) * H);
    for (let a = 0; a < 40; a++) for (const r of [2, 3.5]) plot(px, kx + Math.round(Math.cos(a / 6.4) * r * 1.6), ky + Math.round(Math.sin(a / 6.4) * r * 0.8), r < 3 ? [60, 38, 22, 255] : [82, 54, 32, 255]);
  }
  for (let k = 0; k < Math.ceil((W * H) / 30000); k++) { // old mug rings
    const rx = Math.floor(hash(SEED, k, 7) * W), ry = Math.floor(hash(SEED, k, 8) * H);
    for (let a = 0; a < 90; a++) if (hash(SEED, k * 90 + a, 9) < 0.7) plot(px, rx + Math.round(Math.cos(a / 14.3) * 15), ry + Math.round(Math.sin(a / 14.3) * 15), [78, 50, 30, 255]);
  }
}

/** Lay `art` on the desk turned by `turn`, top-left of its box at (x, y), with a shadow down-right. */
function lay(px: Px, art: Px, x: number, y: number, turn: number, shadow = 2) {
  const e = extent(art, turn);
  const c = Math.cos(turn), s = Math.sin(turn);
  for (const pass of shadow ? [0, 1] : [1]) {
    const off = pass ? 0 : shadow;
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) {
      const du = i - e.w / 2 + 0.5, dv = j - e.h / 2 + 0.5;
      const ax = Math.floor(du * c + dv * s + art.w / 2);
      const ay = Math.floor(-du * s + dv * c + art.h / 2);
      if (ax < 0 || ay < 0 || ax >= art.w || ay >= art.h) continue;
      const k = (ay * art.w + ax) * 4;
      if (!art.data[k + 3]) continue;
      plot(px, x + i + off, y + j + off, pass ? [art.data[k], art.data[k + 1], art.data[k + 2], 255] : I.P.shadow);
    }
  }
}

/** The desk on a W × H screen (game px). `order` lifts picked-up things to the top of the pile. */
export function barnScene(W: number, H: number, info: BarnInfo, order: readonly I.ItemId[] = [], keepClear: { x: number; y: number; w: number; h: number }[] = []): BarnScene {
  const px = createPx(W, H);
  desk(px);
  const { usable, loose } = arrange(W, H, info, keepClear);
  for (const l of loose) lay(px, l.t.art, l.x, l.y, l.t.turn);
  const sorted = [...usable.filter((u) => !order.includes(u.id)), ...order.map((id) => usable.find((u) => u.id === id)!).filter(Boolean)];
  for (const u of sorted) lay(px, u.t.art, u.x, u.y, u.t.turn, 3);
  return { px, spots: sorted.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) };
}
