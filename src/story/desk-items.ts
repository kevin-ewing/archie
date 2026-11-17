// The things on the pilot's desk, each drawn from straight above in the game's pixels, in detail: real
// lettering where it would be legible, shading lit from the top-left, wear and stains. The desk
// (story/barn-art.ts) scatters them; picking one up shows the same drawing close up.

import { bayer, fbm, hash, valueNoise } from '../core/noise.ts';
import { watchPx } from '../ui/clock.ts';
import { LUCK, luckPx } from '../ui/luck.ts';
import { createPx, line, plot, text, textWidth, type Px, type RGBA } from '../core/pixels.ts';

export const P = {
  dark: [24, 19, 15, 255], shadow: [36, 24, 15, 255], ink: [40, 34, 30, 255], pencil: [96, 92, 88, 255],
  paper: [214, 198, 154, 255], paperShade: [188, 170, 126, 255], paperDark: [160, 142, 102, 255],
  cream: [236, 224, 186, 255], creamShade: [214, 200, 160, 255], white: [244, 240, 226, 255],
  red: [138, 50, 38, 255], redLit: [180, 74, 54, 255],
} satisfies Record<string, RGBA>;

export type ItemId = 'orders' | 'chart' | 'letters' | 'logbook' | 'clockcode' | 'calendar' | 'mug' | 'watch' | 'goggles' | 'coin' | 'pad';
export type DateInfo = { day: number; month: string; year: number };

const rect = (px: Px, x: number, y: number, w: number, h: number, c: RGBA) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) plot(px, x + i, y + j, c); };
const disc = (px: Px, cx: number, cy: number, r: number, c: (d: number, dx: number, dy: number) => RGBA | null) => {
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) { const d = Math.hypot(dx, dy); if (d <= r) { const k = c(d, dx, dy); if (k) plot(px, cx + dx, cy + dy, k); } }
};

/**
 * What the orders say: all of it text the story fills in, so each new sortie can bring its own orders as they
 * are unlocked. `body` is a list of numbered paragraphs, `signed` the signature block under the Major's
 * hand. About nine lines of body fit on the sheet; any more are cut off at its bottom edge.
 */
export type OrdersText = {
  heading: readonly string[]; // the printed letterhead, centred
  title: string; // what the sheet is, underlined
  to: string; // who it's for
  duty: string; // the job
  body: readonly string[]; // the numbered paragraphs
  signed: string; // typed under the signature
  stamp: string; // the squadron's rubber stamp
};
export const ORDERS_START: Readonly<OrdersText> = Object.freeze({
  heading: ['ROYAL FLYING CORPS.', 'NO. 6 SQUADRON.'],
  title: 'SQUADRON ORDERS.',
  to: "TO: 2ND LIEUT., 'A' FLIGHT.",
  duty: 'DUTY: ARTILLERY OBSERVATION.',
  body: [
    'OBSERVE FOR THE HEAVY BATTERY OVER THE SECTOR.',
    'KEEP THE CANAL ON YOUR LEFT GOING OUT.',
    'WATCH FOR THE BATTERY PANELS.',
    'BE BACK OVER THE LINES BEFORE THE LIGHT GOES.',
  ],
  signed: 'MAJOR, O.C. NO. 6 SQDN. R.F.C.',
  stamp: 'NO 6',
});

/**
 * Squadron orders, typed, on a clipboard, in the desk's style (tone steps, ordered dither, no outlines): a
 * worn hardboard, the typed sheet with its folds and a little foxing held under a nickel spring clip (the clock's
 * metal, with its ribbing), the squadron's rubber stamp, the Major's signature, a pencilled tick by each
 * paragraph read. Always laid square, and the same size however it's read: it is the way to the next flight.
 */
export function ordersArt(sortie = 1, date = '10 MAY 1915', words: Readonly<OrdersText> = ORDERS_START): Px {
  const W = 160, H = 216, PX = 9, PT = 12, PB = 10; // the sheet's inset from the board; it runs up under the clip
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H), A = new Uint8Array(W * H); // A: 2 = whole tones, no dither
  const BOARD = [90, 74, 58], PAPER = [202, 192, 162];
  const inPaper = (x: number, y: number) => x >= PX && x < W - PX && y >= PT && y < H - PB;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (inPaper(x, y)) {
      C.set(PAPER, i * 3);
      const e = Math.min(x - PX, y - PT, W - PX - 1 - x, H - PB - 1 - y);
      T[i] = (fbm(140, x / 30, y / 36, 3) - 0.5) * 7 - Math.max(0, 2 - e) * 3 + (x === PX || y === PT ? 8 : 0) - (x === W - PX - 1 || y === H - PB - 1 ? 8 : 0)
        + (valueNoise(147, x / 2, y / 40) - 0.5) * 3; // the laid paper's faint lines
      for (const fy of [PT + 71, PT + 142]) { // the sheet folded in three, creased and gone grey along each fold
        if (y === fy) T[i] -= 9; else if (y === fy + 1) T[i] += 5; else if (Math.abs(y - fy) < 4) T[i] -= 2;
      }
    } else {
      C.set(BOARD, i * 3);
      T[i] = (fbm(141, x / 9, y / 40, 3) - 0.5) * 10 + (valueNoise(142, x / 2, y / 30) - 0.5) * 5 + (x === 0 || y === 0 ? 8 : 0) - (x === W - 1 || y === H - 1 ? 10 : 0);
      if ((x >= W - PX && x < W - PX + 2 && y >= PT + 2 && y < H - PB + 2) || (y >= H - PB && y < H - PB + 2 && x >= PX + 2 && x < W - PX + 2)) T[i] -= 14; // the sheet's shadow
    }
  }
  const ink = (x: number, y: number, c: readonly number[], a: number) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3;
    for (let n = 0; n < 3; n++) C[i + n] += (c[n] - C[i + n]) * Math.min(1, a);
  };
  for (let y = PT; y < H - PB; y++) for (let x = PX; x < W - PX; x++) { // foxing
    const f = fbm(143, x / 8, y / 8, 3);
    if (f > 0.76) ink(x, y, [150, 128, 96], (f - 0.76) * 1.6);
  }
  // A greasy thumb on the board: the hut's own wear. (The sheet itself stays clean of rings and spills: the orders are always fresh.)
  for (let y = H - 42; y < H - 8; y++) for (let x = 0; x < PX; x++) { const e = Math.hypot((x - 2) / 7, (y - (H - 24)) / 16); if (e < 1) T[y * W + x] -= (1 - e) * 10; }
  // The typing, onto a layer first so it can be rubbed thin in places.
  const lay = createPx(W, H), TYPED: RGBA = [44, 40, 42, 255], x0 = PX + 8, width = W - 2 * PX - 16, mid = W / 2, LIMIT = H - PB - 42;
  const centred1 = (y: number, s: string) => text(lay, Math.round(mid - textWidth(s) / 2), y, s, TYPED);
  let y = PT + 22;
  for (const h of words.heading) { centred1(y, h); y += 8; }
  y += 2;
  centred1(y, words.title);
  for (let x = Math.round(mid - textWidth(words.title) / 2); x < Math.round(mid + textWidth(words.title) / 2); x++) { plot(lay, x, y + 7, TYPED); plot(lay, x, y + 9, TYPED); } // doubly underlined
  y += 16;
  text(lay, x0, y, words.to, TYPED); y += 8;
  text(lay, x0, y, words.duty, TYPED); y += 8;
  text(lay, x0, y, `SORTIE ${sortie}.`, TYPED);
  text(lay, x0 + width - textWidth(date), y, date, TYPED);
  y += 9;
  for (let x = x0; x < x0 + width; x++) plot(lay, x, y, TYPED);
  y += 7;
  const ticks: number[] = []; // where each paragraph starts, for the pencilled ticks
  let row = 0;
  for (const [n, para] of words.body.entries()) {
    if (y + 5 > LIMIT) break; // ponytail: more than fits is cut off at the sheet's bottom; paginate or shrink the type if orders ever run longer
    ticks.push(y);
    text(lay, x0, y, `${n + 1}.`, TYPED);
    let cur = '';
    const put = (s: string) => { text(lay, x0 + 10 + (hash(144, row++, 1) < 0.25 ? 1 : 0), y, s, TYPED); y += 7; }; // a typewriter's uneven margin
    for (const w of para.split(' ')) {
      if (cur && textWidth(`${cur} ${w}`) > width - 10) { if (y + 5 > LIMIT) break; put(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur && y + 5 <= LIMIT) put(cur);
    y += 3;
  }
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const i = (yy * W + xx) * 4;
    if (!lay.data[i + 3]) continue;
    ink(xx, yy, [lay.data[i], lay.data[i + 1], lay.data[i + 2]], 0.88 * Math.min(1, Math.max(0.45, valueNoise(145, xx / 5, yy / 5) * 1.6)));
  }
  // In pencil: a tick in the margin by each paragraph.
  const PENCIL = [64, 62, 68];
  for (const [n, ty] of ticks.entries()) {
    const j = (hash(149, n, 1) - 0.5) * 2;
    for (let t = 0; t < 3; t++) ink(PX + 3 + t, ty + 2 + t + j, PENCIL, 0.7);
    for (let t = 0; t < 7; t++) ink(PX + 5 + t, ty + 4 - t * 0.8 + j, PENCIL, 0.7);
  }
  // The rubber stamp, crooked and part inked.
  const RED = [138, 52, 40], sx = W - PX - 34, sy = H - PB - 36;
  for (let a = 0; a < 6.283; a += 0.025) for (const r of [15, 14]) ink(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.82, RED, 0.7 * Math.min(1, valueNoise(146, a * 3, 0) * 1.8 + 0.2));
  const stamp = createPx(textWidth(words.stamp), 5);
  text(stamp, 0, 0, words.stamp, [0, 0, 0, 255]);
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < stamp.w; xx++) if (stamp.data[(yy * stamp.w + xx) * 4 + 3]) ink(sx - stamp.w / 2 + xx, sy - 2 + yy, RED, 0.75);
  // The Major's signature in blue-black ink, looping, a flourish under it, and his title typed below.
  const INK = [40, 44, 72], sigY = H - PB - 30;
  for (let t = 0; t < 46; t += 0.2) ink(x0 + t, sigY + Math.sin(t / 2.4) * 3.2 + Math.sin(t / 7) * 2 - t * 0.06, INK, 0.85);
  for (let t = 0; t < 24; t += 0.2) ink(x0 + 3 + t, sigY + 9 + t * 0.03 + Math.sin(t) * 0.4, INK, 0.6);
  const sg = createPx(textWidth(words.signed), 5);
  text(sg, 0, 0, words.signed, [0, 0, 0, 255]);
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < sg.w; xx++) if (sg.data[(yy * sg.w + xx) * 4 + 3]) ink(x0 + xx, H - PB - 16 + yy, TYPED, 0.82);
  // The spring clip: the clock's nickel, ribbed like its crown, lit along the top and dark along the bottom, a
  // jaw gripping the sheet (the sheet runs up under it), two rivets, and its shadow on the paper below.
  const set = (x: number, yy: number, c: readonly number[], v: number) => { const i = yy * W + x; C.set(c, i * 3); T[i] = v; A[i] = 2; };
  const METAL = [0x9c, 0x98, 0x82], DARKM = [0x56, 0x54, 0x49], LITM = [0xe2, 0xe0, 0xd6], GLINT = [0xf2, 0xee, 0xe2];
  const cl = 40, cr = W - 40; // the clip's span
  for (let yy = 22; yy < 29; yy++) for (let x = cl + 6; x < cr - 6; x++) T[yy * W + x] -= 16 - (yy - 22) * 2.4; // its shadow
  for (let yy = 3; yy < 14; yy++) for (let x = cl; x < cr; x++) { // the body
    const rib = (x - cl) % 4 < 2 ? 0 : -6; // ribbing: alternate lit / shaded, as on the watch's crown
    set(x, yy, yy === 3 ? GLINT : yy === 4 ? LITM : yy > 11 ? DARKM : METAL, yy <= 4 ? 6 : yy > 11 ? -4 : rib + (yy < 8 ? 6 : 0));
  }
  for (let yy = 14; yy < 22; yy++) for (let x = cl + 8; x < cr - 8; x++) set(x, yy, yy === 14 ? DARKM : yy < 17 ? METAL : DARKM, yy === 14 ? -8 : yy < 17 ? 0 : -10 + (yy - 17) * -2); // the jaw, darker, in shade
  for (let yy = 1; yy < 9; yy++) for (let x = W / 2 - 11; x < W / 2 + 11; x++) set(x, yy, yy < 3 ? GLINT : yy < 6 ? LITM : METAL, yy < 3 ? 8 : yy < 6 ? 2 : -4); // the bridge
  for (const rx of [cl + 6, cr - 8]) { set(rx, 8, GLINT, 12); set(rx + 1, 8, LITM, 4); set(rx, 9, METAL, -2); set(rx + 1, 9, DARKM, -8); } // the rivets
  // Snap to tone steps with the ordered dither (whole tones for the thin metal); round off the corners a little.
  const px = createPx(W, H);
  for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) {
    const ex = Math.min(x, W - 1 - x), ey = Math.min(yy, H - 1 - yy);
    if (ex < 3 && ey < 3 && Math.hypot(3 - ex, 3 - ey) > 3.2) continue;
    const i = yy * W + x, k = 1 + (A[i] === 2 ? Math.round(T[i] / 6) : Math.floor(T[i] / 6 + bayer(x, yy))) * 0.05;
    plot(px, x, yy, [Math.round(C[i * 3] * k), Math.round(C[i * 3 + 1] * k), Math.round(C[i * 3 + 2] * k), 255]);
  }
  return px;
}

/**
 * The sector chart, a big, faded sheet folded in four, drawn in the desk's pixel style (story/barn-art.ts):
 * brightness snapped to a few tone steps and ordered-dithered, large soft patches of age, no per-pixel
 * speckle. Its squares, roads, woods and lines are faint ink soaked into the paper and worn away in places;
 * the folds make four panels lit a little differently; the edges are grimy and torn (transparent notches,
 * so the shadow follows them); foxing and tea rings stain it.
 */
export function chartArt(w = 250, h = 176, sheetNo = 0, mug = 1): Px { // mug: the size the mug is drawn at (its rings shrink with it)
  const W = w, H = h;
  const X = (v: number) => Math.round((v * W) / 250), Y = (v: number) => Math.round((v * H) / 176); // laid out for 250 × 176
  const S = sheetNo * 1000; // a different sheet: its own noise, and its own roads, villages, lines and marks
  const L = (k: number, base: number, span: number) => (sheetNo ? Math.round(10 + hash(77 + sheetNo, k, 1) * (span - 20)) : base);
  const C = new Float32Array(W * H * 3); // colour before toning
  const T = new Float32Array(W * H); // brightness offset, snapped to tone steps at the end
  const BASE = [176, 166, 138]; // muted, greyed paper: a background, not a highlight
  for (let i = 0; i < W * H; i++) C.set(BASE, i * 3);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const ink = (x: number, y: number, c: readonly number[], a: number) => {
    if (!inside(x, y) || a <= 0) return;
    const i = (y * W + x) * 3;
    for (let n = 0; n < 3; n++) C[i + n] += (c[n] - C[i + n]) * Math.min(1, a);
  };
  const tone = (x: number, y: number, v: number) => { if (inside(x, y)) T[y * W + x] += v; };

  // Woods: soft-edged patches of stipple, thinning out at their edges through the dither.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wv = fbm(22 + S, x / 28, y / 22, 3);
    if (wv > 0.58 && bayer(x, y) < (wv - 0.58) * 4) ink(x, y, [112, 124, 88], 0.45);
  }

  // The line work goes onto a scratch layer first (alpha = how strongly it was inked), then soaks in.
  const lay = createPx(W, H);
  const SQ: RGBA = [118, 108, 88, 90], ROAD: RGBA = [62, 58, 52, 150], RED: RGBA = [140, 58, 44, 160], BLUE: RGBA = [66, 88, 110, 140], PEN: RGBA = [84, 80, 74, 150];
  for (let x = 12; x < W - 2; x += 18) for (let y = 2; y < H - 2; y++) plot(lay, x, y, SQ); // map squares
  for (let y = 12; y < H - 2; y += 18) for (let x = 2; x < W - 2; x++) plot(lay, x, y, SQ);
  for (let i = 0; i < Math.floor(W / 18); i++) for (let j = 0; j < Math.floor(H / 18); j++) text(lay, 5 + i * 18, 5 + j * 18, String.fromCharCode(65 + ((i + j * 13) % 26)), SQ);
  const road = (x0: number, y0: number, x1: number, y1: number) => line(lay, x0, y0, x1, y1, ROAD);
  const jx = X(L(1, 110, 250)), jy = Y(L(2, 92, 176)), cx2 = X(L(3, 150, 250)), cx3 = X(L(4, 166, 250));
  road(4, Y(L(5, 130, 176)), jx, jy); road(jx, jy, W - 6, Y(L(6, 104, 176))); road(cx2, 3, cx3, H - 4); road(cx3, H - 4, X(L(7, 204, 250)), H - 2);
  for (const [vx, vy] of [[jx, jy - 2], [X(L(8, 166, 250)), Y(L(9, 50, 176))], [X(L(10, 50, 250)), Y(L(11, 120, 176))], [X(L(12, 208, 250)), Y(L(13, 136, 176))]]) { rect(lay, vx - 2, vy - 2, 5, 4, ROAD); plot(lay, vx, vy - 3, ROAD); } // villages
  for (let k = 0; k < W - 8; k++) plot(lay, 4 + k, Y(L(14, 52, 176)) + Math.round(8 * Math.sin(k / 16 + sheetNo) + 3 * Math.sin(k / 5)), RED); // the German line
  for (let k = 0; k < W - 8; k += 2) plot(lay, 4 + k, Y(L(14, 52, 176) + 10) + Math.round(8 * Math.sin(k / 16 + sheetNo)), BLUE); // ours
  for (const [mx, my] of [[X(L(15, 58, 250)), Y(L(16, 110, 176))], [X(L(17, 190, 250)), Y(L(18, 40, 176))]]) disc(lay, mx, my, 9, (d) => (d > 7.8 ? RED : null));
  text(lay, X(L(19, 176, 230)), Y(L(20, 144, 160)), 'BTY', PEN); text(lay, X(L(21, 198, 230)), Y(L(22, 22, 160)), 'TGT', PEN);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = lay.data[i + 3] / 255;
    if (!a) continue;
    const wear = Math.min(1, Math.max(0, valueNoise(38 + S, x / 6, y / 6) * 1.7 - 0.25)); // rubbed away smoothly in places
    ink(x, y, [lay.data[i], lay.data[i + 1], lay.data[i + 2]], a * wear);
  }

  // Shading, all of it later snapped to tone steps.
  const fx = Math.floor(W / 2), fy = Math.floor(H / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = (fbm(40 + S, x / 60, y / 45, 3) - 0.5) * 7; // big, faint patches of age
    v += (valueNoise(29 + S, x / 9, y / 1.5) - 0.5) * 5; // fibres, along the sheet
    v += (x < fx ? 3 : -3) + (y < fy ? 2 : -2); // the four folded panels catch the light a little differently
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    v -= Math.max(0, 9 - e) * 1.6; // grimy, handled edges
    if (x === 0 || y === 0) v += 10; else if (x === W - 1 || y === H - 1) v -= 10; // lit top-left, shaded bottom-right
    T[y * W + x] = v;
  }
  for (let y = 1; y < H - 1; y++) { tone(fx, y, -16 * (0.5 + valueNoise(35 + S, y / 7, 0))); tone(fx + 1, y, 7); } // the folds, worn unevenly
  for (let x = 1; x < W - 1; x++) { tone(x, fy, -16 * (0.5 + valueNoise(36 + S, x / 7, 0))); tone(x, fy + 1, 7); }
  for (let k = 0; k < Math.round((W * H) / 70000); k++) { // foxing: a few soft brown spots
    const cx = hash(31 + S, k, 1) * W, cy = hash(31 + S, k, 2) * H, r = 3 + hash(31 + S, k, 3) * 7;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r + (valueNoise(32 + S + k, x / 2, y / 2) - 0.5) * 0.5;
      if (d < 1) { ink(x, y, [150, 122, 84], (1 - d) * 0.35); tone(x, y, -(1 - d) * 8); }
    }
  }
  // Mug rings, the same size as the desk's (30–33 px, a little bigger than the pocket watch), sharp at the rim and fading inward; only on the top sheet.
  for (const [tx, ty, tr] of sheetNo ? [] : [[X(186), Y(122), Math.round(32 * mug)], [X(56), Y(46), Math.round(30 * mug)]]) { // the mug's size, as on the desk
    for (let y = ty - tr - 2; y <= ty + tr + 2; y++) for (let x = tx - tr - 2; x <= tx + tr + 2; x++) {
      const t = tr - Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
      if (t < -1 || t > 5) continue;
      const s = (t < 0 ? 1 + t : Math.exp(-t / 1.6)) * (0.6 + valueNoise(33 + S, Math.atan2(y - ty, x - tx) * 3, tx) * 0.5);
      ink(x, y, [140, 106, 70], s * 0.5); tone(x, y, -s * 10);
    }
  }

  // Snap to tone steps with the ordered dither; tear the edges.
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < Math.floor(valueNoise(37 + S, (x + y * 1.3) / 3, 0) * 3.2 - 0.6)) continue; // torn notches: left transparent
    const i = y * W + x, k = (1 + Math.floor(T[i] / 6 + bayer(x, y)) * 0.04) * (sheetNo ? 0.8 : 1); // the sheet underneath sits in the top one's shade
    const r = C[i * 3] * k, g = C[i * 3 + 1] * k, b = C[i * 3 + 2] * k;
    const grey = (r + g + b) / 3, wash = sheetNo ? 0.4 : 0; // and is more washed out: its colours pulled towards a warm grey
    plot(px, x, y, [Math.round(r + (grey * 1.04 - r) * wash), Math.round(g + (grey - g) * wash), Math.round(b + (grey * 0.93 - b) * wash), 255]);
  }
  return px;
}

/**
 * The pilot's flying log book, after the real 1915 pattern: a buff card cover gone pinkish-grey with
 * handling, a linen-taped spine, the printed form number, the service, PILOT'S FLYING LOG BOOK between two
 * short rules, the Rank written in by hand, the printer's line at the foot. Lightly worn: gently mottled, a little foxed and scuffed,
 * grimy at the edges, corners rounded off.
 * Drawn in the desk's pixel style: tone steps, ordered dither.
 *
 * What the story changes, as it goes (`LogbookCover`): the rank written on it (struck through and rewritten
 * when he's promoted), the book's number, and how worn it is (it gets more handled, foxed and grubby).
 */
export type LogbookCover = {
  rank: string; // in his own hand on the RANK line
  formerRank?: string; // struck through above it, after a promotion
  number: string; // pencilled in by the clerk, top left
  wear: number; // 0 (new) … 1 (a long war)
};
/** As he arrives: a new pilot was commissioned a Second Lieutenant [VERIFY: "on probation" in 1915]. */
export const LOGBOOK_START: Readonly<LogbookCover> = Object.freeze({ rank: '2ND LIEUT.', number: '159', wear: 0.3 });

export function logbookArt(cover: Readonly<LogbookCover> = LOGBOOK_START): Px {
  const wear = Math.min(1, Math.max(0, cover.wear));
  const W = 136, H = 206, SP = 15; // SP: the spine tape's width
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H);
  const COVER = [152, 140, 128], TAPE = [162, 156, 144];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    C.set(x < SP ? TAPE : COVER, i * 3);
    let v = (fbm(110, x / 50, y / 60, 3) - 0.5) * 7; // gently mottled with age
    if (x < SP) v += (x % 2 ? 2 : -2) + (valueNoise(111, x, y / 3) - 0.5) * 6 + (x === SP - 1 ? -14 : x === SP - 2 ? -6 : x === 0 ? 8 : 0); // the tape's weave, its edge
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    v -= Math.max(0, 4 + wear * 8 - e) * (1 + wear * 1.6); // grimy, handled edges: wider and darker with wear
    if (x === 0 || y === 0) v += 8; else if (x === W - 1 || y === H - 1) v -= 10;
    const scuff = fbm(112, x / 30, y / 26, 3);
    if (scuff > 0.78 - wear * 0.16 && x >= SP) v += 4; // scuffed pale
    T[i] = v;
  }
  const ink = (x: number, y: number, c: readonly number[], a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3;
    for (let n = 0; n < 3; n++) C[i + n] += (c[n] - C[i + n]) * Math.min(1, a);
  };
  for (let y = 0; y < H; y++) for (let x = SP; x < W; x++) { // foxing: soft brown blotches
    const f = fbm(114, x / 9, y / 9, 3);
    const from = 0.82 - wear * 0.12;
    if (f > from) ink(x, y, [130, 110, 94], (f - from) * 1.5);
  }

  // The printing, in faded black, rubbed thin in places; the handwriting in blue-black ink.
  const lay = createPx(W, H), PRINT: RGBA = [40, 36, 34, 255], PEN: RGBA = [46, 46, 60, 255];
  const mid = SP + (W - SP) / 2;
  const at = (y: number, s: string, k = 1, bold = false) => {
    const w = textWidth(s) * k, x0 = Math.round(mid - w / 2);
    if (k === 1) { text(lay, x0, y, s, PRINT); if (bold) text(lay, x0 + 1, y, s, PRINT); return; }
    const t = createPx(textWidth(s), 5);
    text(t, 0, 0, s, PRINT);
    for (let j = 0; j < 5; j++) for (let i = 0; i < t.w; i++) if (t.data[(j * t.w + i) * 4 + 3]) rect(lay, x0 + i * k, y + j * k, k, k, PRINT);
  };
  at(9, 'S. 1516.   EST. FEB. 1915.');
  at(34, 'ROYAL FLYING CORPS.');
  for (let x = Math.round(mid - 14); x < mid + 14; x++) plot(lay, x, 48, PRINT);
  at(72, "PILOT'S FLYING", 2);
  at(92, 'LOG BOOK.', 2);
  for (let x = Math.round(mid - 14); x < mid + 14; x++) plot(lay, x, 116, PRINT);
  text(lay, SP + 8, 174, 'RANK', PRINT);
  for (let x = SP + 28; x < W - 8; x += 2) plot(lay, x, 180, PRINT); // a dotted line to write on
  at(196, '2,500 BKS. 4/17 J.D. & CO.');
  // The rank, written in by hand on the dotted line: the game's letters, each nudged off the line a little,
  // as a pen would. A promotion strikes the old one through and writes the new one after.
  const hand = (s: string, x0: number, y0: number, salt: number) => {
    let x = x0;
    for (const [i, ch] of [...s].entries()) {
      text(lay, x, y0 + (hash(117 + salt, i, 1) < 0.25 ? -1 : 0), ch, PEN);
      x += textWidth(ch) + 1 + (hash(117 + salt, i, 2) < 0.2 ? 1 : 0);
    }
    return x;
  };
  if (cover.formerRank) {
    const end = hand(cover.formerRank, SP + 30, 166, 0);
    for (let x = SP + 29; x < end; x++) plot(lay, x, 168 + (x % 7 === 0 ? 1 : 0), PEN); // struck through
  }
  hand(cover.rank, SP + 30, 174, 1);
  text(lay, SP + 7, 17, cover.number, PEN); // the book's number, pencilled in by the clerk
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!lay.data[i + 3]) continue;
    const rub = Math.min(1, Math.max(0.35, valueNoise(118, x / 5, y / 5) * 1.6)); // rubbed thin in places
    ink(x, y, [lay.data[i], lay.data[i + 1], lay.data[i + 2]], 0.85 * rub);
  }

  // Snap to tone steps with the ordered dither; round off the worn corners.
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
    if (cx < 4 && cy < 4 && Math.hypot(4 - cx, 4 - cy) > 4.2) continue;
    const i = y * W + x, k = 1 + Math.floor(T[i] / 6 + bayer(x, y)) * 0.04;
    plot(px, x, y, [Math.round(C[i * 3] * k), Math.round(C[i * 3 + 1] * k), Math.round(C[i * 3 + 2] * k), 255]);
  }
  return px;
}

/**
 * The clock-code card, as issued to observers for ranging the guns, in the desk's style (tone steps, ordered
 * dither, no outlines): buff card printed in black, worn at the edges. The target at the centre, true north
 * at twelve, the lettered rings A to F (50 to 500 yards; only C = 200 yards is confirmed by a source, the
 * Y and Z rings inside A are left off) and the hours round them; in pencil, today's fall of
 * shot ringed at B4 (100 yards, a little south of east) and noted by it.
 */
export function clockcodeArt(): Px {
  const L = 1; // lettering at the font's own size
  const W = 200, H = 228, cx = 100, cy = 108, R0 = 14, DR = 10; // ring i at R0 + i·DR: F (the 6th) at 64
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H);
  const CARD = [192, 180, 146];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    C.set(CARD, i * 3);
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    T[i] = (fbm(130, x / 40, y / 46, 3) - 0.5) * 8 - Math.max(0, 5 - e) * 2.2 + (Math.abs(y - 160 - (x - 100) * 0.06) < 0.6 ? -6 : 0); // mottled, grubby edges, an old crease
  }
  const ink = (x: number, y: number, c: readonly number[], a: number) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3;
    for (let n = 0; n < 3; n++) C[i + n] += (c[n] - C[i + n]) * Math.min(1, a);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { // foxing
    const f = fbm(131, x / 9, y / 9, 3);
    if (f > 0.78) ink(x, y, [140, 120, 90], (f - 0.78) * 1.6);
  }
  // The printing, onto a layer first so it can be rubbed thin in places.
  const lay = createPx(W, H), PRINT: RGBA = [42, 36, 32, 255], FAINTP: RGBA = [120, 110, 86, 255], RED: RGBA = [124, 50, 38, 255];
  const big = (target: Px, x: number, y: number, s: string, c: RGBA) => { // the font at L×
    const t = createPx(textWidth(s), 5);
    text(t, 0, 0, s, c);
    for (let j = 0; j < 5; j++) for (let i = 0; i < t.w; i++) if (t.data[(j * t.w + i) * 4 + 3]) rect(target, x + i * L, y + j * L, L, L, c);
  };
  const BW = (s: string) => textWidth(s) * L;
  const centred2 = (y: number, s: string, c: RGBA) => big(lay, Math.round(cx - BW(s) / 2), y, s, c);
  centred2(9, 'CLOCK CODE.', PRINT);
  for (let x = cx - 24; x < cx + 24; x++) plot(lay, x, 17, PRINT);
  const RINGS = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (let h = 0; h < 12; h++) { // the hour lines, dotted, from the inner ring out
    const a = (h / 12) * Math.PI * 2;
    for (let r = R0; r <= R0 + 5 * DR; r += 2) plot(lay, Math.round(cx + Math.sin(a) * r), Math.round(cy - Math.cos(a) * r), FAINTP);
  }
  RINGS.forEach((_l, i) => {
    const r = R0 + i * DR;
    for (let a = 0; a < 6.283; a += 0.35 / r) plot(lay, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), i % 2 ? FAINTP : PRINT);
  });
  // Each ring's letter, normal size, on paper knocked clear of the lines, in a column up the gap between eleven and twelve.
  RINGS.forEach((l, i) => {
    const r = R0 + i * DR + DR / 2, lx = Math.round(cx - Math.sin(0.2) * r - 1), ly = Math.round(cy - Math.cos(0.2) * r - 2);
    for (let y = ly - 1; y < ly + 6; y++) for (let x = lx - 1; x < lx + 4; x++) plot(lay, x, y, [0, 0, 0, 0]);
    text(lay, lx, ly, l, PRINT);
  });
  for (let h = 1; h <= 12; h++) { const a = (h / 12) * Math.PI * 2, s = String(h); big(lay, Math.round(cx + Math.sin(a) * 78 - BW(s) / 2 + 0.5), Math.round(cy - Math.cos(a) * 78 - 2.5 * L), s, h === 12 ? RED : PRINT); }
  for (let d = -3; d <= 3; d++) for (let w = 0; w < 2; w++) { plot(lay, cx + d, cy + w, RED); plot(lay, cx + w, cy + d, RED); } // the target
  // True north, printed in the corner, and the yards for each ring underneath.
  big(lay, 8, 8, 'N', RED);
  for (let y = 18; y < 31; y++) plot(lay, 9, y, RED);
  for (let d = 1; d <= 3; d++) { plot(lay, 9 - d, 18 + d, RED); plot(lay, 9 + d, 18 + d, RED); }
  centred2(H - 22, 'A 50   B 100   C 200', PRINT);
  centred2(H - 13, 'D 300   E 400   F 500', PRINT);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!lay.data[i + 3]) continue;
    ink(x, y, [lay.data[i], lay.data[i + 1], lay.data[i + 2]], 0.86 * Math.min(1, Math.max(0.45, valueNoise(132, x / 6, y / 6) * 1.6)));
  }
  // In pencil: the fall of shot at B4, ringed, and noted beside it.
  const PENCIL = [62, 60, 66];
  const a4 = (4 / 12) * Math.PI * 2, rB = R0 + 1 * DR + DR / 2, fx = cx + Math.sin(a4) * rB, fy = cy - Math.cos(a4) * rB;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dy) < 1.8) ink(fx + dx, fy + dy, PENCIL, 0.85);
  for (let t = 0; t < 6.7; t += 0.05) for (const w of [0, 0.7]) ink(fx + Math.cos(t) * (6 + w + t * 0.15), fy + Math.sin(t) * (5.6 + w + t * 0.12), PENCIL, 0.55); // ringed, the loop not quite closing
  const note = createPx(16 * L, 5 * L);
  big(note, 0, 0, 'B4', [0, 0, 0, 255]);
  for (let y = 0; y < note.h; y++) for (let x = 0; x < note.w; x++) if (note.data[(y * note.w + x) * 4 + 3]) ink(fx + 11 + x, fy + 5 + y + (x > 7 ? 1 : 0), PENCIL, 0.7);
  // Snap to tone steps with the ordered dither; round off the worn corners.
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = Math.min(x, W - 1 - x), ey = Math.min(y, H - 1 - y);
    if (ex < 2 && ey < 2 && Math.hypot(2 - ex, 2 - ey) > 2.2) continue; // barely rounded
    const i = y * W + x, k = 1 + Math.floor(T[i] / 6 + bayer(x, y)) * 0.04;
    plot(px, x, y, [Math.round(C[i * 3] * k), Math.round(C[i * 3 + 1] * k), Math.round(C[i * 3 + 2] * k), 255]);
  }
  return px;
}

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/** A calendar page's layout for a month: where each date's square is. `big`: the large page (lettering doubled). */
function calendarGrid(d: DateInfo, big: boolean) {
  const m = Math.max(0, MONTH_NAMES.findIndex((n) => n.startsWith(d.month.slice(0, 3).toUpperCase())));
  const first = new Date(Date.UTC(d.year, m, 1)).getUTCDay(); // 0 = Sunday
  const days = new Date(Date.UTC(d.year, m + 1, 0)).getUTCDate();
  const k = big ? 2 : 1;
  const before = new Date(Date.UTC(d.year, m, 0)).getUTCDate(); // days in the month before
  const TOP = big ? 9 : 5; // the stubs of the months torn off above it
  const CW = big ? 40 : 15, RH = big ? 26 : 11, X0 = big ? 8 : 4, HEAD = TOP + (big ? 34 : 16), GRID = TOP + (big ? 70 : 30), FOOT = big ? 20 : 10;
  const rows = Math.ceil((first + days) / 7);
  /** Square `day` of the month (0 and below: the month before; past the end: the month after). */
  const cell = (day: number) => { const i = first + day - 1; return { col: ((i % 7) + 7) % 7, x: X0 + (((i % 7) + 7) % 7) * CW, y: GRID + Math.floor(i / 7) * RH, w: CW, h: RH }; };
  return { m, days, before, first, k, TOP, CW, RH, X0, HEAD, GRID, FOOT, rows, cell, W: X0 * 2 + CW * 7, H: GRID + rows * RH + FOOT };
}

/** The squares (in the page's pixels) of today and the days either side of it that are on this month's page:
 * what must stay in view on the desk, so you can tell the date. */
export function calendarDays(d: DateInfo, big = false): { x: number; y: number; w: number; h: number }[] {
  const g = calendarGrid(d, big);
  return [d.day - 1, d.day, d.day + 1].filter((n) => n >= 1 && n <= g.days).map((n) => { const { x, y, w, h } = g.cell(n); return { x, y, w, h }; });
}

/** What of the page must stay in view on the desk (in its pixels): the month and year, and the days round today. */
export function calendarKeep(d: DateInfo, big = false): { x: number; y: number; w: number; h: number }[] {
  const g = calendarGrid(d, big), w = textWidth(`${MONTH_NAMES[g.m]} ${d.year}`) * g.k + 4 * g.k;
  return [{ x: Math.floor((g.W - w) / 2), y: g.TOP, w, h: g.HEAD - g.TOP }, ...calendarDays(d, big)];
}

/**
 * A calendar page for this month lying on the desk, in the desk's style (tone steps, ordered dither, no
 * outlines): ragged red stubs above it where the months before were torn off the pad, the red-printed head, the real weekdays and dates (proleptic
 * Gregorian, as 1915 was) in a ruled grid, the days of the months either side faint in its spare squares,
 * the printer's line, a pin hole; every day gone by crossed off in pencil, so today is the first one left. `big`: the large page; otherwise a
 * compact one for small screens.
 * ponytail: on the 1st nothing is crossed off yet, so the page alone doesn't say which day it is.
 */
export function calendarArt(d: DateInfo, big = false): Px {
  const g = calendarGrid(d, big), { W, H, k, TOP, CW, RH, X0, HEAD, GRID, FOOT } = g;
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H);
  const PAPER = [200, 190, 164], HEADC = [128, 60, 46];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    C.set(y < HEAD ? HEADC : PAPER, i * 3); // (the rows above TOP are the stubs, below)
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    T[i] = (fbm(120, x / 40, y / 50, 3) - 0.5) * 8 - Math.max(0, 4 - e) * 2.5; // mottled, grubby at the edges
    if (y < HEAD && y >= HEAD - k) T[i] -= 10; // the head's printed edge, a shade deeper
  }
  // Above the page: what's left of the months torn off before it, stubs of their red heads still caught in the
  // pad, ripped jaggedly (tall tongues in places, torn right back to the perforations in others), the torn
  // edge showing the paper's pale core. Then the perforations along this page's own top.
  const stub = (x: number) => Math.round(Math.max(0, Math.min(1, valueNoise(124, x / (7 * k), 0) * 1.5 - 0.15)) * (TOP - 1) + (hash(124, x, 1) - 0.5) * 1.6);
  for (let y = 0; y < TOP; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, top = TOP - stub(x);
    if (y < top) continue;
    C.set(y === top ? [206, 188, 164] : HEADC, i * 3); // the torn edge, pale
    T[i] = (y === TOP - 1 ? -10 : 2) + (fbm(125, x / 12, y / 4, 2) - 0.5) * 8; // shaded where it tucks under the pad
  }
  const ink = (x: number, y: number, c: readonly number[], a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3;
    for (let n = 0; n < 3; n++) C[i + n] += (c[n] - C[i + n]) * Math.min(1, a);
  };
  for (let y = HEAD; y < H; y++) for (let x = 0; x < W; x++) { // foxing
    const f = fbm(121, x / 9, y / 9, 3);
    if (f > 0.76) ink(x, y, [150, 128, 100], (f - 0.76) * 1.6);
  }
  // The printing (rubbed thin in places), then the pencil crosses.
  const lay = createPx(W, H), PRINT: RGBA = [44, 38, 34, 255], RED: RGBA = [128, 52, 40, 255], LIGHT: RGBA = [214, 204, 178, 255], RULE: RGBA = [160, 150, 126, 255];
  const T2 = (x: number, y: number, s: string, c: RGBA) => {
    if (k === 1) return text(lay, x, y, s, c);
    const t = createPx(textWidth(s), 5);
    text(t, 0, 0, s, c);
    for (let j = 0; j < 5; j++) for (let i = 0; i < t.w; i++) if (t.data[(j * t.w + i) * 4 + 3]) rect(lay, x + i * k, y + j * k, k, k, c);
  };
  const TW = (s: string) => textWidth(s) * k;
  const title = `${MONTH_NAMES[g.m]} ${d.year}`;
  T2(Math.floor((W - TW(title)) / 2), TOP + Math.floor((HEAD - TOP - 5 * k) / 2), title, LIGHT);
  for (let x = 2 * k; x < W - 2 * k; x += 4 * k) rect(lay, x, TOP + k, k, k, [96, 40, 30, 255]); // the perforations it'll be torn along
  const names = k > 1 ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] : ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  names.forEach((n, i) => T2(X0 + i * CW + Math.floor((CW - TW(n)) / 2), HEAD + 3 * k, n, i ? PRINT : RED));
  const LIGHT2: RGBA = [176, 112, 96, 255];
  for (let x = 3 * k; x < W - 3 * k; x++) plot(lay, x, HEAD - 3 * k, LIGHT2); // a fine rule under the title
  for (let x = X0; x < W - X0; x++) { plot(lay, x, GRID - 1, PRINT); plot(lay, x, GRID + g.rows * RH, RULE); }
  for (let r = 1; r < g.rows; r++) for (let x = X0; x < W - X0; x++) if (x % 2) plot(lay, x, GRID + r * RH - 1, RULE); // dotted rules between weeks …
  for (let c = 1; c < 7; c++) for (let y = GRID; y < GRID + g.rows * RH; y++) if (y % 2) plot(lay, X0 + c * CW, y, RULE); // … and between days
  const foot = k > 1 ? "WT. 2000. 4/15. H.M.S.O.   FORM W. 3121" : 'H.M.S.O.  W.3121';
  text(lay, Math.floor((W - textWidth(foot)) / 2), GRID + g.rows * RH + Math.floor((FOOT - 5) / 2), foot, PRINT); // the printer's line, small
  for (let n = 1; n <= g.days; n++) {
    const { x, y, col } = g.cell(n), s = String(n);
    T2(x + Math.floor((CW - TW(s)) / 2), y + Math.floor((RH - 2 - 5 * k) / 2), s, col ? PRINT : RED);
  }
  // The spare squares: the last days of the month before and the first of the next, printed very faint.
  const FAINT: RGBA = [182, 172, 146, 255];
  for (let n = 1 - g.first; n <= g.rows * 7 - g.first; n++) {
    if (n >= 1 && n <= g.days) continue;
    const { x, y } = g.cell(n), s = String(n < 1 ? g.before + n : n - g.days);
    T2(x + Math.floor((CW - TW(s)) / 2), y + Math.floor((RH - 2 - 5 * k) / 2), s, FAINT);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!lay.data[i + 3]) continue;
    ink(x, y, [lay.data[i], lay.data[i + 1], lay.data[i + 2]], 0.88 * Math.min(1, Math.max(0.4, valueNoise(122, x / 5, y / 5) * 1.6)));
  }
  // Each day gone by struck through in pencil: two smooth strokes, each bowed a little and set a little off
  // true, firm where the pencil lands and lighter as it lifts. A k-wide pencil, every pixel marked once a stroke,
  // so the line stays solid rather than scratchy.
  const PENCIL = [62, 60, 66];
  const stroke = (x0: number, y0: number, x1: number, y1: number, salt: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const bow = (hash(125, salt, 1) - 0.5) * 2.2 * k, done = new Set<number>();
    for (let t = 0; t <= len; t += 0.25) {
      const u = t / len, wob = Math.sin(u * Math.PI) * bow;
      const lx = Math.round(x0 + (x1 - x0) * u + nx * wob - (k - 1) / 2), ly = Math.round(y0 + (y1 - y0) * u + ny * wob - (k - 1) / 2);
      for (let b = 0; b < k * k; b++) {
        const qx = lx + (b % k), qy = ly + Math.floor(b / k), key = qy * W + qx;
        if (done.has(key)) continue;
        done.add(key);
        ink(qx, qy, PENCIL, u < 0.75 ? 0.7 : 0.7 - (u - 0.75) * 1.1); // lighter as it lifts
      }
    }
  };
  for (let n = 1; n < d.day && n <= g.days; n++) {
    const { x, y } = g.cell(n), cx = x + CW / 2, cy = y + RH / 2 - k, hw = CW * 0.28, hh = RH * 0.34;
    const j = (s: number) => (hash(123, n, s) - 0.5) * 2 * k, over = k * hash(123, n, 9) * 1.5; // the first stroke sometimes runs on
    stroke(cx - hw + j(1), cy - hh + j(2), cx + hw + over + j(3), cy + hh + over * 0.5 + j(4), n * 2);
    stroke(cx + hw + j(5), cy - hh + j(6), cx - hw + j(7), cy + hh + j(8), n * 2 + 1);
  }
  // A pin hole near the top, where it hung on the hut wall.
  const ph = [Math.round(W / 2), HEAD + Math.round(2.2 * k)];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const r = Math.hypot(dx, dy); if (r < 1) ink(ph[0] + dx, ph[1] + dy, [40, 32, 26], 0.9); else if (r < 2.2 && dx + dy > 0) ink(ph[0] + dx, ph[1] + dy, [120, 108, 86], 0.5); }
  // Snap to tone steps with the ordered dither; round off the worn corners.
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
    if (cx < 3 && cy < 3 && Math.hypot(3 - cx, 3 - cy) > 3.2) continue;
    if (y < TOP && y < TOP - stub(x)) continue; // torn away
    const i = y * W + x, f = 1 + Math.floor(T[i] / 6 + bayer(x, y)) * 0.04;
    plot(px, x, y, [Math.round(C[i * 3] * f), Math.round(C[i * 3 + 1] * f), Math.round(C[i * 3 + 2] * f), 255]);
  }
  return px;
}

/** The cockpit watch, laid on the desk showing the time of day (the same drawing, ui/clock.ts). */
export const watchArt = (hours: number, sunset: number): Px => watchPx(27, hours, sunset);

/** The lucky sixpence, as hangs under the altimeter (the same drawing, ui/luck.ts), still on its cord: the cord
 * runs from the drilled hole in a loose curve across the desk to the knot it's tied off with (the cockpit's own
 * knot and cut ends). The cord in the charm's two twisted tones, whole, with its shaded side away from the light.
 * `turn`: how it will lie, so the coin's rim and the cord are lit from the top-left of the screen. */
export function coinArt(turn = 0): Px {
  const from = luckPx(turn), c = LUCK.pivot, TOP = 16, KNOT = 7; // the coin is from row 16; the knot, rows 0 … 6
  const W = 46, H = 56, ox = 2, oy = H - (from.h - TOP); // the coin at the bottom left; the knot top right
  const px = createPx(W, H);
  const copy = (sy0: number, sy1: number, dx: number, dy: number) => {
    for (let y = sy0; y < sy1; y++) for (let x = 0; x < from.w; x++) {
      const i = (y * from.w + x) * 4;
      if (from.data[i + 3]) plot(px, x + dx, y + dy, [from.data[i], from.data[i + 1], from.data[i + 2], 255]);
    }
  };
  // The cord: from the hole, out to the right and round, up to the knot.
  const kx = W - from.w + 1, ky = 1; // where the knot's drawing goes
  const p = [[ox + c + 0.5, oy + 1.5], [ox + c + 34, oy - 4], [kx + c - 30, ky + 22], [kx + c + 0.5, ky + KNOT - 1]];
  const at = (t: number) => { const m = 1 - t; return [0, 1].map((k) => m * m * m * p[0][k] + 3 * m * m * t * p[1][k] + 3 * m * t * t * p[2][k] + t * t * t * p[3][k]); };
  const sx = Math.round((Math.cos(turn) + Math.sin(turn)) / Math.SQRT2), sy = Math.round((Math.cos(turn) - Math.sin(turn)) / Math.SQRT2); // the screen's down-right, in the drawing
  let len = 0, [lx, ly] = at(0);
  for (let t = 0; t <= 1; t += 0.004) {
    const [x, y] = at(t);
    len += Math.hypot(x - lx, y - ly); [lx, ly] = [x, y];
    plot(px, Math.floor(x) + sx, Math.floor(y) + sy, LUCK.cordB); // its shaded side
    plot(px, Math.floor(x), Math.floor(y), Math.floor(len / 1.5) % 2 ? LUCK.cordA : LUCK.cordB); // the twist
  }
  copy(0, KNOT, kx, ky); // the knot and its cut ends
  copy(TOP, from.h, ox, oy - TOP); // the coin over the cord's end, the cord through its hole
  return px;
}

/**
 * A tin enamel mug of mess coffee from straight above, in the desk's style, with no outlines: the lip and the
 * inside wall are the same enamel, told apart only by the light (the lip lit on its top-left, the wall
 * inside on its far side), the coffee near black with a broad glossy sheen and the window's glint
 * in it, and a smooth crescent of tan crema against the wall, a few bubbles along its edge and just off it; the handle out to the right, solid from above.
 * The coffee's wide shading is in tone steps with the ordered dither; the thin parts take whole tones, so
 * they stay clean. The rim's radius (37) is a little more than the old rings' on the desk (30 … 33, left by its narrower
 * bottom), and more than the watch's (27).
 */
export function coffeeArt(): Px {
  const R = 37, c = R, HL = 17, HT = 7, IN = R - 2.5, TEA = R - 6, W = 2 * R + HL, H = 2 * R; // HL, HT: the handle's length and half-thickness
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H), A = new Uint8Array(W * H); // A: 1 dithered, 2 whole tones
  const ENAMEL = [184, 180, 166], COFFEE = [40, 27, 19], FROTH = [146, 112, 80];
  const set = (x: number, y: number, col: readonly number[], v: number, flat = false) => { const i = y * W + x; C.set(col, i * 3); T[i] = v; A[i] = flat ? 2 : 1; };
  // The handle: a broad enamelled strip seen from above, lit along its top, shaded along its bottom, a rounded end.
  for (let y = c - HT; y < c + HT; y++) for (let x = 2 * R - 3; x < W; x++) {
    const ix = x + 0.5 - 2 * R, iy = y + 0.5 - c;
    if (Math.hypot(Math.max(0, ix - (HL - HT)), iy) > HT) continue; // rounded end
    set(x, y, ENAMEL, iy < -HT + 2 ? 8 : iy > HT - 2 ? -12 : 0, true);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < 2 * R; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d > R) continue;
    const lit = -(dx + dy) / Math.max(1, d) / Math.SQRT2; // 1 facing the top-left light, -1 away
    if (d > IN) set(x, y, ENAMEL, lit > 0.4 ? 10 : lit < -0.4 ? -8 : 2, true); // the lip
    else if (d > TEA) set(x, y, ENAMEL, -lit > 0.5 ? 6 : -lit > 0 ? 0 : -lit > -0.5 ? -8 : -14, true); // the wall: lit on the far side
    else {
      // Crema: a smooth crescent of tan foam against the wall on the bottom-left, thick there and thinning to
      // nothing round the other side, palest by the wall, its inner edge gently wavy and a step darker.
      const th = 10 * Math.max(0, Math.cos(a - 2.3)) ** 1.6 + (valueNoise(155, (a + Math.PI) * 5, 0) - 0.5) * 3;
      const into = TEA - d;
      if (into < th) {
        const deep = into / Math.max(1, th); // 0 at the wall … 1 at the inner edge
        set(x, y, FROTH, 12 - deep * 12 + (th - into < 1.2 ? -8 : 0) + (fbm(158, x / 6, y / 6, 2) - 0.5) * 5);
        continue;
      }
      // The coffee: near black, with a broad glossy sheen of the sky across its upper middle, brightest at
      // a soft window glint.
      const sheen = Math.max(0, 1 - Math.hypot((dx + 2) / 19, (dy + 8) / 13));
      const g = Math.hypot((dx + 5) / 1.5, dy + 11);
      if (g < 3) set(x, y, g < 1.8 ? [176, 152, 122] : [120, 92, 68], 0, true);
      else set(x, y, COFFEE, sheen ** 1.5 * 96 + (g < 7 ? 14 : 0) - (dx + dy + TEA) * 0.3 + (fbm(153, x / 10, y / 10, 2) - 0.5) * 6);
    }
  }
  // A few bubbles: small ones sitting along the crema's edge, two or three larger drifting just off it onto the
  // coffee. Each a pale ring, brightest on its top-left, the coffee dark through its middle.
  for (let k = 0; k < 14; k++) {
    const a = 2.3 + (hash(154, k, 1) - 0.5) * 2.4, th = 10 * Math.max(0, Math.cos(a - 2.3)) ** 1.6;
    if (th < 2) continue;
    const loose = k % 5 === 0, br = loose ? 1.6 : 1, r0 = TEA - th - (loose ? 3 + hash(154, k, 2) * 3 : 0.4);
    const bx = c + Math.cos(a) * r0, by = c + Math.sin(a) * r0;
    for (let y = Math.floor(by - 3); y <= by + 3; y++) for (let x = Math.floor(bx - 3); x <= bx + 3; x++) {
      const ox = x + 0.5 - bx, oy = y + 0.5 - by, e = Math.hypot(ox, oy);
      if (e > br + 0.4) continue;
      if (br < 1.2) { set(x, y, FROTH, e < 0.5 ? 10 : 0, true); continue; } // a small one: a pale bead
      set(x, y, FROTH, e < br - 0.8 ? -30 : ox + oy < 0 ? 10 : -6, true); // a larger one: a ring, lit on its top-left
    }
  }
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!A[i]) continue;
    const k = 1 + (A[i] === 2 ? Math.round(T[i] / 6) : Math.floor(T[i] / 6 + bayer(x, y))) * 0.06;
    plot(px, x, y, [Math.round(C[i * 3] * k), Math.round(C[i * 3 + 1] * k), Math.round(C[i * 3 + 2] * k), 255]);
  }
  return px;
}



/**
 * Flying goggles lying flat, in the desk's style (tone steps, ordered dither, no outlines): a soft tan leather
 * mask bowed a little at its ends, worn at its edges, creased and folded with a fine grain, stitched round its
 * edge, that narrows at each end into the brown woven strap; two rounded-oblong lenses in nickel rims set in
 * it, hinged over the nose; the strap looped untidily round with a slide buckle on it, each buckle turned to lie
 * square to the strap. The glass is clear and translucent (the desk shows through), with glossy diagonal streaks
 * and the rim's bright reflection on it, a little dust, and casts no shadow of its own.
 */
export function gogglesArt(): Px {
  const W = 212, H = 132, LY = 40, RX = 34, RY = 24, TILT = 0.15; // lens half-width / half-height; each leans outward-down
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H), A = new Uint8Array(W * H), S = new Uint8Array(W * H), AL = new Uint8Array(W * H); // A: 2 = whole tones; S: 1 = painted; AL: opacity
  const put = (x: number, y: number, col: readonly number[], v: number, flat = false, alpha = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    C.set(col, i * 3); T[i] = v; A[i] = flat ? 2 : 1; S[i] = 1; AL[i] = alpha;
  };
  const METAL = [0x9c, 0x98, 0x82], DARKM = [0x56, 0x54, 0x49], LITM = [0xe2, 0xe0, 0xd6], GLINT = [0xf2, 0xee, 0xe2];
  const STRAP = [116, 90, 58];
  const ss = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const MID = 104, lenses = [{ cx: 74, dir: -1 }, { cx: 134, dir: 1 }]; // dir: which way is outward; their nose-side rims meet at MID
  // A point's place in a lens's own frame: s = how far out from its centre (1 = the rim's outer edge).
  const inLens = (L: { cx: number; dir: number }, x: number, y: number) => {
    const th = L.dir * TILT, dx = x + 0.5 - L.cx, dy = y + 0.5 - LY, c = Math.cos(th), n = Math.sin(th);
    const lx = dx * c + dy * n, ly = -dx * n + dy * c;
    const sx = L.dir < 0 ? -lx : lx; // positive = outward, negative = towards the nose
    const u = sx / (sx > 0 ? RX : RX - 4), v = ly / RY; // the nose side is cut straighter and shorter
    return { s: (Math.abs(u) ** 2.6 + Math.abs(v) ** 2.6) ** (1 / 2.6), lx, ly, dx, dy };
  };
  // ── The strap first, so the rest lie over it: a woven band along four uneven curves, ribbed across.
  const bez = (p: number[][], t: number) => { const m = 1 - t; return [m * m * m * p[0][0] + 3 * m * m * t * p[1][0] + 3 * m * t * t * p[2][0] + t * t * t * p[3][0], m * m * m * p[0][1] + 3 * m * m * t * p[1][1] + 3 * m * t * t * p[2][1] + t * t * t * p[3][1]]; };
  const ribbon = (p: number[][], half: number, salt: number) => {
    let len = 0, last = bez(p, 0);
    for (let t = 0; t <= 1; t += 0.0015) {
      const q = bez(p, t), a = bez(p, Math.min(1, t + 0.004)), b = bez(p, Math.max(0, t - 0.004));
      len += Math.hypot(q[0] - last[0], q[1] - last[1]); last = q;
      const tx = a[0] - b[0], ty = a[1] - b[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const weave = Math.floor(len / 1.8) % 2 ? 3 : -2; // the cross ribs of the weave
      for (let w = -half; w <= half; w += 0.5) {
        const edge = Math.abs(w) > half - 0.9 ? -6 : 0, side = (nx + ny) * Math.sign(w) * -0.9;
        put(q[0] + nx * w, q[1] + ny * w, STRAP, weave + edge + side + (valueNoise(150 + salt, len / 3, w / 2) - 0.5) * 5);
      }
    }
  };
  const PATHS = [
    [[25, 47], [-6, 56], [0, 98], [44, 111]], // from the left end, out and down …
    [[44, 111], [76, 128], [96, 102], [124, 110]], // … a dip along the bottom, a rise where it's been pushed …
    [[124, 110], [158, 120], [176, 104], [187, 78]], // … and up the right …
    [[187, 78], [196, 65], [197, 55], [188, 47]], // … to the right end.
  ];
  PATHS.forEach((p, i) => ribbon(p, 3.5, i + 1));
  // ── The leather mask: bowed like a smile, tapering at each end into the strap, creased, folded, worn, stitched.
  const yc = (x: number) => LY + ((x - MID) / 84) ** 2 * 7;
  const hhAt = (x: number) => 5 + 30 * (x < MID ? 1.08 : 1) * Math.min(ss((x - 22) / 30), ss((190 - x) / 38)); // wider and quicker to open out on the left, so the edge keeps off the metal
  // The leather's lower edge: a steady band under the lenses that follows their curves in towards the nose, so the V between them is the
  // lenses' own, with a rounded point (never narrower than 18 px under the bridge, so the lenses stay joined).
  const lensBottom = (x: number) => { const left = x < MID, cx = left ? 74 : 134, sx = left ? -(x + 0.5 - cx) : x + 0.5 - cx, u = Math.min(1, Math.abs(sx) / (sx > 0 ? RX : RX - 4)); return LY + RY * (1 - u ** 2.6) ** (1 / 2.6); };
  const smax = (a: number, b: number, k: number) => (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2;
  const botAt = (x: number) => { const base = yc(x) + hhAt(x), w = ss((32 - Math.abs(x - MID)) / 16); return base * (1 - w) + Math.min(base, smax(lensBottom(x) + 9, LY + 19, 4)) * w; };
  const FOLDS = [[86, 64, 104, 82], [122, 64, 104, 82], [46, 62, 64, 72], [168, 62, 150, 72]]; // a few deliberate folds
  const fold = (x: number, y: number) => { // the height of the leather: sharp creases (valleys) from ridged noise, and a V of folds under the nose
    const f = fbm(160, x / 20, (y + (x - MID) * 0.3) / 8, 3), r = 1 - Math.abs(2 * f - 1);
    const f2 = fbm(163, x / 5, (y + (x - MID) * 0.2) / 2.5, 2), r2 = 1 - Math.abs(2 * f2 - 1); // fine wrinkles between the big creases
    let h = -(r ** 3 * 11) - r2 ** 4 * 2.2;
    for (const [ax, ay, bx, by] of FOLDS) {
      const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      const dd = Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) / 1.5;
      h -= 6 * Math.exp(-(dd * dd));
    }
    return h;
  };
  const inMask = (x: number, y: number) => x >= 22 && x <= 190 && y >= yc(x) - hhAt(x) * 0.95 && y <= botAt(x);
  for (let y = 0; y < H; y++) for (let x = 22; x <= 190; x++) {
    const top = yc(x) - hhAt(x) * 0.95, bot = botAt(x);
    if (y < top || y > bot) continue;
    const d = Math.min(y - top, bot - y, x - 22, 190 - x); // px in from the mask's edge
    if (d >= 2.5 && d < 3.5 && x % 4 < 2) { put(x, y, [204, 168, 116], -2, true); continue; } // the stitching: dark-ish thread dashes
    const slope = fold(x + 1, y + 1) - fold(x - 1, y - 1); // lit where it faces the top-left
    const crease = 1 - Math.abs(2 * fbm(160, x / 20, (y + (x - MID) * 0.3) / 8, 3) - 1);
    const patina = fbm(165, x / 26, y / 18, 2); // the leather's colour wanders: redder, browner
    const col = [156 - patina * 30, 108 - patina * 24, 68 - patina * 16];
    const worn = fbm(166, x / 12, y / 9, 2) > 0.64 ? 4 : 0; // paler where it's been handled
    const rim = y - top < 1.3 ? 5 : bot - y < 1.3 ? -8 : d < 1.3 ? -3 : 0; // the edge burnished: lit along the top, dark under
    put(x, y, col, slope * 1.9 - crease ** 4 * 8 + worn + rim + (hash(161, x, y) - 0.5) * 3 + (valueNoise(164, x / 1.6, y / 1.6) - 0.5) * 2.5);
  }
  for (let k = 0; k < 7; k++) { // a few scuffs: short pale scratches
    let sx = 40 + hash(167, k, 1) * 130, sy = 20 + hash(167, k, 2) * 60;
    const a = hash(167, k, 3) * 3.14, len = 5 + hash(167, k, 4) * 8;
    for (let t = 0; t < len; t += 0.5) { const px = sx + Math.cos(a) * t, py = sy + Math.sin(a) * t; if (inMask(px, py) && S[Math.round(py) * W + Math.round(px)] && A[Math.round(py) * W + Math.round(px)] === 1) T[Math.round(py) * W + Math.round(px)] += 7; }
  }
  for (const rx of [28, 184]) { put(rx, yc(rx), GLINT, 8, true); put(rx + 1, yc(rx), METAL, 0, true); put(rx, yc(rx) + 1, METAL, -4, true); put(rx + 1, yc(rx) + 1, DARKM, -10, true); } // rivets where the strap goes under
  // ── The lenses: nickel rims, lit on their top-left and shaded on the bottom-right, with clear glass inside.
  for (const L of lenses) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const { s, dx, dy } = inLens(L, x, y);
    if (s > 1) continue;
    const lit = -(dx + dy);
    if (s > 0.9) { // the rim: nickel in whole tones, a bright reflection along its lit side
      put(x, y, lit > 18 && s > 0.96 ? LITM : METAL, lit > 18 && s > 0.96 ? 8 : lit > 6 ? 14 : lit < -6 ? -16 : lit > -2 ? 4 : -6, true); // (only the very outer edge catches the light)
      continue;
    }
    const e = (fbm(157, x / 7, y / 7, 2) - 0.5) * 6;
    if (s > 0.82) { put(x, y, [58, 62, 60], -(dx + dy) * 0.1 + e, false, Math.round(40 + (s - 0.82) * 900)); continue; } // the rim's inner face, seen through the glass
    // Glass: mostly clear, so the desk shows through, with a broad pale sheen, the rim reflected in an arc just
    // inside it on the lit side, and glossy diagonal streaks (the same on both lenses, in parallel).
    const sheen = Math.max(0, 1 - Math.hypot((dx + 14) / (RX * 1.1), (dy + 8) / (RY * 0.8)));
    let col: readonly number[] = [218, 224, 218], alpha = 40 + sheen * sheen * 96, v = e;
    if (s > 0.74 && lit > 4) { col = [236, 240, 234]; alpha += (s - 0.74) * 480 * Math.min(1, lit / 18); } // the rim reflected on the glass
    const tt = dy - 0.58 * dx, across = Math.abs(dx) < RX * 0.74 ? 1 - Math.abs(dx) / (RX * 0.74) : 0; // across: the streaks fade out towards the lens's ends
    const streak = (c: number, w: number) => Math.max(0, 1 - Math.abs(tt - c) / w);
    const gloss = (streak(-6, 3.2) * 150 + streak(5, 1.4) * 120 + streak(11, 0.8) * 70) * ss(across * 1.6) + (Math.abs(tt - 0) < 9 ? 22 * ss(across * 1.4) : 0);
    if (gloss > 0) { col = [244, 247, 242]; alpha += gloss; }
    if (hash(156 + (L.dir < 0 ? 0 : 5), x, y) < 0.022) { col = [150, 148, 138]; alpha = 120; } // dust
    put(x, y, col, v, false, Math.min(235, Math.round(alpha)));
  }
  // ── The hinge over the nose: a narrow nickel strap between the rims, and the pins where the rims meet the mask.
  for (let y = LY - 8; y < LY + 5; y++) for (let x = MID - 2; x < MID + 1; x++) put(x, y, x < MID - 1 ? LITM : x > MID - 1 ? DARKM : METAL, x < MID - 1 ? 4 : x > MID - 1 ? -6 : 0, true);
  for (const x0 of [40, 166]) for (let y = LY - 3; y <= LY + 3; y++) for (let k = 0; k < 3; k++) put(x0 + k, y, k === 0 ? LITM : k === 2 ? DARKM : METAL, 0, true);
  // ── Slide buckles: a nickel frame round the strap, turned to lie square to it where it sits.
  const buckleOn = (p: number[][], t: number, across: number, along: number) => {
    const [px, py] = bez(p, t), a = bez(p, Math.min(1, t + 0.01)), b = bez(p, Math.max(0, t - 0.01));
    const tl = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, tx = (a[0] - b[0]) / tl, ty = (a[1] - b[1]) / tl, nx = -ty, ny = tx;
    for (let y = Math.floor(py - across); y <= py + across; y++) for (let x = Math.floor(px - across); x <= px + across; x++) {
      const u = (x + 0.5 - px) * tx + (y + 0.5 - py) * ty, v = (x + 0.5 - px) * nx + (y + 0.5 - py) * ny; // along / across the strap
      if (Math.abs(u) > along / 2 || Math.abs(v) > across / 2) continue;
      if (Math.abs(u) < along / 2 - 2 && Math.abs(v) < across / 2 - 2) continue; // the opening, the strap showing through
      const lit = -((x + 0.5 - px) + (y + 0.5 - py));
      put(x, y, lit > 2 ? LITM : METAL, lit > 2 ? 4 : -8, true);
    }
  };
  buckleOn(PATHS[1], 0.38, 15, 8);
  buckleOn(PATHS[2], 0.62, 15, 8);
  // ── Snap to tone steps with the ordered dither (whole tones for the thin metal).
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!S[i]) continue;
    const k = 1 + (A[i] === 2 ? Math.round(T[i] / 6) : Math.floor(T[i] / 6 + bayer(x, y))) * 0.06;
    plot(px, x, y, [Math.min(255, Math.round(C[i * 3] * k)), Math.min(255, Math.round(C[i * 3 + 1] * k)), Math.min(255, Math.round(C[i * 3 + 2] * k)), AL[i]]);
  }
  return px;
}





