// The things on the pilot's desk, each drawn from straight above in the game's pixels, in detail: real
// lettering where it would be legible, shading lit from the top-left, wear and stains. The desk
// (story/barn-art.ts) scatters them; picking one up shows the same drawing close up.

import { bayer, hash } from '../core/noise.ts';
import { createPx, line, plot, text, textWidth, type Px, type RGBA } from '../core/pixels.ts';

export const P = {
  dark: [24, 19, 15, 255], shadow: [36, 24, 15, 255], ink: [40, 34, 30, 255], typed: [52, 46, 42, 255], pencil: [96, 92, 88, 255],
  paper: [214, 198, 154, 255], paperShade: [188, 170, 126, 255], paperDark: [160, 142, 102, 255],
  cream: [236, 224, 186, 255], creamShade: [214, 200, 160, 255], white: [244, 240, 226, 255],
  red: [138, 50, 38, 255], redLit: [180, 74, 54, 255], redDark: [100, 34, 26, 255], blue: [70, 98, 122, 255], blueLit: [104, 134, 156, 255],
  olive: [92, 96, 62, 255], oliveLit: [118, 122, 80, 255], oliveDark: [66, 70, 44, 255],
  cloth: [58, 66, 50, 255], clothLit: [80, 90, 66, 255], clothDark: [42, 48, 36, 255],
  leather: [96, 62, 36, 255], leatherLit: [132, 90, 54, 255], leatherDark: [64, 40, 24, 255], fleece: [220, 206, 174, 255],
  steel: [0x9c, 0x98, 0x82, 255], steelLit: [0xe2, 0xe0, 0xd6, 255], steelDark: [0x56, 0x54, 0x49, 255],
  brass: [0xc9, 0x9a, 0x3c, 255], brassLit: [0xf0, 0xcc, 0x6e, 255], brassDark: [0x8a, 0x66, 0x24, 255],
  glass: [132, 148, 146, 255], glassLit: [196, 210, 206, 255], flameRing: [255, 222, 150, 255], tea: [120, 72, 30, 255], teaLit: [158, 102, 44, 255], wood: [176, 128, 64, 255],
} satisfies Record<string, RGBA>;

export type ItemId = 'orders' | 'chart' | 'letters' | 'photo' | 'logbook' | 'clockcode' | 'helmet' | 'calendar';
export type DateInfo = { day: number; month: string; year: number };

const rect = (px: Px, x: number, y: number, w: number, h: number, c: RGBA) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) plot(px, x + i, y + j, c); };
const disc = (px: Px, cx: number, cy: number, r: number, c: (d: number, dx: number, dy: number) => RGBA | null) => {
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) { const d = Math.hypot(dx, dy); if (d <= r) { const k = c(d, dx, dy); if (k) plot(px, cx + dx, cy + dy, k); } }
};
const centred = (px: Px, y: number, s: string, c: RGBA, x0 = 0, w = px.w) => text(px, x0 + Math.floor((w - textWidth(s)) / 2), y, s, c);
/** A sheet of paper: lit top and left edges, shaded bottom and right, foxing, a dog-eared corner. */
function sheet(px: Px, x: number, y: number, w: number, h: number, face: RGBA, shade: RGBA, seed: number, dogEar = false) {
  rect(px, x, y, w, h, face);
  rect(px, x, y, w, 1, P.white); rect(px, x, y, 1, h, P.white);
  rect(px, x, y + h - 1, w, 1, shade); rect(px, x + w - 1, y, 1, h, shade);
  for (let k = 0; k < (w * h) / 220; k++) plot(px, x + 2 + Math.floor(hash(seed, k, 1) * (w - 4)), y + 2 + Math.floor(hash(seed, k, 2) * (h - 4)), shade);
  if (dogEar) for (let k = 0; k < 6; k++) for (let j = 0; j <= k; j++) plot(px, x + w - 6 + k, y + h - 1 - j, k + j > 5 ? P.shadow : shade);
}
/** Words too small to read at the desk: inked dashes of word-like lengths. */
function scrawl(px: Px, x: number, y: number, w: number, rows: number, c: RGBA, seed: number, gap = 4) {
  for (let r = 0; r < rows; r++) {
    let cx = x + (r === 0 ? 5 : 0);
    const end = x + w - Math.floor(hash(seed, r, 9) * (r === rows - 1 ? w * 0.5 : 5));
    while (cx < end) {
      const len = 2 + Math.floor(hash(seed, r * 31 + cx, 3) * 7);
      for (let i = 0; i < len && cx + i < end; i++) plot(px, cx + i, y + r * gap + (hash(seed, cx + i, r) < 0.15 ? -1 : 0), c);
      cx += len + 2;
    }
  }
}

/** Squadron orders, typed, on a clipboard: letterhead, the sortie, typed lines, a rubber stamp, signed. */
export function ordersArt(sortie = 1, date = '10 MAY 1915'): Px {
  const W = 92, H = 120;
  const px = createPx(W, H);
  rect(px, 0, 0, W, H, P.leather); // the clipboard's board
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hash(81, x >> 1, y) < 0.08) plot(px, x, y, P.leatherDark);
  rect(px, 0, 0, W, 1, P.leatherLit); rect(px, 0, 0, 1, H, P.leatherLit); rect(px, 0, H - 1, W, 1, P.leatherDark); rect(px, W - 1, 0, 1, H, P.leatherDark);
  sheet(px, 5, 10, W - 10, H - 14, P.cream, P.creamShade, 11);
  centred(px, 16, 'ROYAL FLYING CORPS', P.typed);
  centred(px, 23, `SQUADRON ORDERS`, P.typed);
  line(px, 12, 30, W - 13, 30, P.paperShade);
  text(px, 11, 34, `SORTIE ${sortie}`, P.typed);
  text(px, 11, 41, date, P.typed);
  text(px, 11, 48, 'DUTY: ARTY OBS', P.typed);
  scrawl(px, 11, 57, W - 24, 6, P.typed, 12, 5);
  for (let a = 0; a < 70; a++) { const r = 9 + (a % 2) * 0.8; plot(px, 66 + Math.round(Math.cos(a / 11) * r), 95 + Math.round(Math.sin(a / 11) * r * 0.75), P.red); } // the stamp
  centred(px, 93, 'NO 6', P.red, 54, 24);
  for (let k = 0; k < 26; k++) plot(px, 12 + k, 98 + Math.round(Math.sin(k / 2.2) * 2 + Math.sin(k / 5) * 1.5), P.blue); // the Major's signature
  line(px, 12, 102, 42, 102, P.paperShade);
  // The spring clip, nickel, with its rivets.
  rect(px, 26, 1, 40, 12, P.steelDark); rect(px, 27, 1, 38, 10, P.steel); rect(px, 27, 1, 38, 2, P.steelLit); rect(px, 27, 10, 38, 1, P.steelDark);
  for (const rx of [30, 61]) { plot(px, rx, 5, P.steelLit); plot(px, rx + 1, 6, P.steelDark); }
  rect(px, 40, 11, 12, 3, P.steelDark); rect(px, 41, 11, 10, 1, P.steel);
  return px;
}

/** The sector chart, folded in four: squares, the canal, roads, woods, villages, the lines in crayon, notes. */
export function chartArt(): Px {
  const W = 150, H = 104;
  const px = createPx(W, H);
  sheet(px, 0, 0, W, H, P.paper, P.paperShade, 21);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (hash(22, x >> 3, y >> 3) < 0.13 && (bayer(x, y) < 0.4)) plot(px, x, y, [162, 172, 116, 255]); // woods
  for (let x = 10; x < W - 2; x += 14) line(px, x, 2, x, H - 3, P.paperShade);
  for (let y = 10; y < H - 2; y += 14) line(px, 2, y, W - 3, y, P.paperShade);
  for (let i = 0; i < 10; i++) for (let j = 0; j < 7; j++) text(px, 4 + i * 14, 4 + j * 14, String.fromCharCode(65 + ((i + j * 10) % 26)), P.paperDark); // square letters, faint
  for (let k = 0; k < H - 4; k++) { const cx = 54 + Math.round(10 * Math.sin(k / 11) - k / 6); for (let w = 0; w < 3; w++) plot(px, cx + w, 2 + k, w === 1 ? P.blueLit : P.blue); } // the canal
  line(px, 4, 76, 66, 54, P.dark); line(px, 66, 54, 146, 62, P.dark); line(px, 88, 3, 98, 100, P.ink); line(px, 98, 100, 120, 102, P.ink); // roads
  for (const [vx, vy] of [[66, 52], [98, 30], [30, 70], [124, 80]]) { rect(px, vx - 2, vy - 2, 5, 4, P.ink); plot(px, vx, vy - 3, P.ink); } // villages and their churches
  for (let k = 0; k < W - 8; k++) plot(px, 4 + k, 30 + Math.round(5 * Math.sin(k / 10) + 2 * Math.sin(k / 3.4)), (k >> 1) % 2 ? P.red : P.redLit); // the German line, red crayon
  for (let k = 0; k < W - 8; k += 2) plot(px, 4 + k, 36 + Math.round(5 * Math.sin(k / 10)), P.blue); // ours, blue pencil
  for (const [mx, my] of [[34, 64], [112, 22]]) { line(px, mx - 4, my - 4, mx + 4, my + 4, P.red); line(px, mx - 4, my + 4, mx + 4, my - 4, P.red); disc(px, mx, my, 7, (d) => (d > 6 ? P.red : null)); }
  text(px, 104, 84, 'BTY', P.pencil); text(px, 118, 12, 'TGT', P.pencil);
  for (let y = 1; y < H - 1; y++) plot(px, W / 2, y, P.creamShade); for (let x = 1; x < W - 1; x++) plot(px, x, H / 2, P.creamShade); // folds
  for (let y = 1; y < H - 1; y++) plot(px, W / 2 + 1, y, P.paperShade); for (let x = 1; x < W - 1; x++) plot(px, x, H / 2 + 1, P.paperShade);
  disc(px, 128, 70, 9, (d) => (d > 7.5 && d < 9 && hash(25, d * 10, 0) < 0.8 ? [168, 140, 96, 255] : null)); // a tea ring
  return px;
}

/** A bundle of letters tied with string: the top one addressed, stamped and postmarked. */
export function lettersArt(): Px {
  const px = createPx(110, 76);
  sheet(px, 12, 0, 94, 58, P.paperShade, P.paperDark, 31);
  sheet(px, 6, 6, 96, 60, P.paper, P.paperShade, 32);
  sheet(px, 0, 14, 100, 60, P.cream, P.creamShade, 33);
  text(px, 26, 38, '2ND LT', P.ink); text(px, 26, 45, 'NO 6 SQUADRON', P.ink); text(px, 26, 52, 'R.F.C. B.E.F.', P.ink); scrawl(px, 26, 60, 46, 1, P.ink, 34);
  rect(px, 82, 18, 14, 17, P.red); rect(px, 83, 19, 12, 15, P.redLit); rect(px, 85, 21, 8, 11, P.red); centred(px, 24, '1D', P.cream, 82, 14); // a penny stamp
  for (let a = 0; a < 60; a++) plot(px, 76 + Math.round(Math.cos(a / 9.5) * 9), 28 + Math.round(Math.sin(a / 9.5) * 9), P.pencil); // postmark
  for (const yy of [24, 27, 30]) line(px, 58, yy, 70, yy, P.pencil);
  const STRING: RGBA = [158, 124, 82, 255];
  for (let x = 0; x < 106; x++) plot(px, x, 47 + (x > 46 && x < 54 ? -1 : 0), STRING);
  for (let y = 0; y < 76; y++) plot(px, 50, y, STRING);
  for (const [bx, by] of [[46, 43], [47, 42], [53, 43], [54, 42], [48, 51], [52, 51]]) plot(px, bx, by, STRING); // the bow
  return px;
}

/** A photograph from home: sepia, deckle-edged, the cottage and the apple tree in blossom, a note on it. */
export function photoArt(): Px {
  const px = createPx(76, 60);
  sheet(px, 0, 0, 76, 60, P.white, P.creamShade, 41);
  for (let x = 0; x < 76; x += 2) { plot(px, x, 0, P.creamShade); plot(px, x, 59, P.creamShade); } // deckle edge
  for (let y = 5; y < 47; y++) for (let x = 5; x < 71; x++) {
    const sky = y < 26;
    const v = (sky ? 176 : 118) + Math.floor((bayer(x, y) * 0.8 + hash(42, x, y) * 0.4) * 2) * 9 - (y > 40 ? 12 : 0);
    plot(px, x, y, [v + 12, v + 2, v - 20, 255]);
  }
  const DK: RGBA = [72, 56, 40, 255], MD: RGBA = [104, 84, 62, 255];
  rect(px, 10, 22, 22, 17, MD); for (let k = 0; k < 12; k++) rect(px, 8 + k, 21 - k, 26 - 2 * k, 1, DK); // the cottage and its thatch
  rect(px, 18, 30, 5, 9, DK); rect(px, 12, 26, 4, 4, [150, 132, 104, 255]); rect(px, 26, 26, 4, 4, [150, 132, 104, 255]);
  line(px, 52, 44, 52, 26, DK); line(px, 52, 32, 44, 24, DK); line(px, 52, 30, 60, 22, DK); line(px, 53, 44, 53, 28, DK);
  for (let k = 0; k < 160; k++) { const a = hash(43, k, 1) * 6.28; const r = Math.sqrt(hash(43, k, 2)) * 13; plot(px, 52 + Math.round(Math.cos(a) * r * 1.3), 19 + Math.round(Math.sin(a) * r * 0.8), hash(43, k, 3) < 0.55 ? [240, 230, 206, 255] : [210, 194, 164, 255]); }
  for (let x = 5; x < 71; x++) plot(px, x, 40 + Math.round(Math.sin(x / 7)), DK); // the garden wall
  text(px, 6, 51, 'HOME. MAY 1915', P.pencil);
  return px;
}

/** The pilot's flying log book: cloth boards, worn corners, the printed label, a ribbon, a pencil in it. */
export function logbookArt(): Px {
  const W = 104, H = 74;
  const px = createPx(W, H);
  rect(px, 3, H - 6, W - 6, 5, P.paper); for (let x = 3; x < W - 3; x += 2) plot(px, x, H - 4, P.paperShade); rect(px, 3, H - 1, W - 6, 1, P.paperDark); // page edges
  rect(px, 0, 0, W - 2, H - 5, P.cloth);
  for (let y = 0; y < H - 5; y++) for (let x = 0; x < W - 2; x++) { if ((x + y) % 3 === 0 && hash(51, x, y) < 0.45) plot(px, x, y, P.clothLit); else if ((x - y) % 4 === 0 && hash(52, x, y) < 0.3) plot(px, x, y, P.clothDark); } // the weave
  rect(px, 0, 0, 10, H - 5, P.clothDark); rect(px, 10, 0, 1, H - 5, P.dark); rect(px, 2, 0, 1, H - 5, P.clothLit); // the spine
  for (const [cx, cy, dx, dy] of [[W - 3, 0, -1, 1], [W - 3, H - 6, -1, -1]]) for (let k = 0; k < 6; k++) for (let j = 0; j < 6 - k; j++) plot(px, cx + dx * k, cy + dy * j, P.leatherLit); // worn corners
  sheet(px, 26, 12, 64, 30, P.cream, P.creamShade, 53);
  rect(px, 28, 14, 60, 1, P.ink); rect(px, 28, 39, 60, 1, P.ink);
  centred(px, 18, "PILOT'S FLYING".replace("'", ''), P.ink, 26, 64); centred(px, 25, 'LOG BOOK', P.ink, 26, 64); centred(px, 32, 'R.F.C.', P.pencil, 26, 64);
  rect(px, 76, H - 6, 4, 6, P.red); plot(px, 77, H - 1, P.redDark); // the ribbon
  line(px, 18, 56, 92, 50, P.wood); line(px, 18, 57, 92, 51, [140, 100, 50, 255]); line(px, 93, 50, 96, 50, P.creamShade); // a pencil on it
  return px;
}

/** The clock-code card: target at the centre, the lettered rings, the hours, north at twelve, a fall marked. */
export function clockcodeArt(): Px {
  const S = 92;
  const px = createPx(S, S);
  sheet(px, 0, 0, S, S, P.cream, P.creamShade, 61, true);
  const c = S / 2;
  const RINGS = ['Y', 'Z', 'A', 'B', 'C', 'D', 'E', 'F'];
  RINGS.forEach((l, i) => {
    const r = 5 + i * 4.7;
    for (let a = 0; a < 6.283; a += 0.4 / r) plot(px, Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), i % 2 ? P.paperShade : P.pencil);
    text(px, Math.round(c + r * 0.72) - 1, Math.round(c + r * 0.72) - 2, l, P.pencil);
  });
  for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; line(px, Math.round(c + Math.sin(a) * 4), Math.round(c - Math.cos(a) * 4), Math.round(c + Math.sin(a) * 38), Math.round(c - Math.cos(a) * 38), P.creamShade); }
  for (let h = 1; h <= 12; h++) { const a = (h / 12) * Math.PI * 2; const s = String(h); text(px, Math.round(c + Math.sin(a) * 42 - textWidth(s) / 2), Math.round(c - Math.cos(a) * 42 - 2), s, P.ink); }
  rect(px, c - 1, c - 1, 3, 3, P.red);
  disc(px, Math.round(c + 19 * Math.sin(2.1)), Math.round(c - 19 * Math.cos(2.1)), 2, () => P.red); // a fall of shot: B4
  text(px, 3, S - 7, 'N', P.red); line(px, 4, S - 9, 4, S - 14, P.red);
  return px;
}

/** The flying helmet, from above, its goggles laid beside it: pick it up to go and fly. */
export function helmetArt(): Px {
  const W = 96, H = 66;
  const px = createPx(W, H);
  // Chin straps trailing from the helmet, a buckle on one.
  for (let k = 0; k < 14; k++) { plot(px, 14 + Math.round(k / 3), 50 + k, P.leatherDark); plot(px, 15 + Math.round(k / 3), 50 + k, P.leather); plot(px, 44 - Math.round(k / 4), 52 + k, P.leatherDark); plot(px, 45 - Math.round(k / 4), 52 + k, P.leather); }
  rect(px, 40, 61, 4, 4, P.brass); plot(px, 41, 62, P.brassLit);
  // The helmet: a leather dome in panels, lit from the top-left, seams stitched.
  for (let y = 0; y < 58; y++) for (let x = 0; x < 62; x++) {
    const dx = (x - 30) / 28, dy = (y - 28) / 26;
    const d = Math.hypot(dx, dy);
    if (d > 1) continue;
    const lit = -dx - dy + (bayer(x, y) - 0.5) * 0.5;
    plot(px, x, y, d > 0.94 ? P.leatherDark : lit > 0.8 ? P.leatherLit : lit < -0.7 ? P.leatherDark : P.leather);
  }
  for (const [x0, x1] of [[30, 30], [16, 12], [44, 48]]) for (let y = 4; y < 53; y++) { const t = (y - 4) / 49; const x = Math.round(x0 + (x1 - x0) * Math.sin(t * Math.PI)); plot(px, x, y, P.leatherDark); if (y % 4 === 0) plot(px, x + 1, y, P.leatherLit); }
  // The goggles beside it, lenses one above the other, the strap looping off.
  for (let y = 4; y < 62; y++) { const x = 84 + Math.round(Math.sin(y / 9) * 3); plot(px, x, y, P.oliveDark); plot(px, x + 1, y, P.olive); }
  for (const gy of [16, 40]) {
    for (let y = -9; y <= 9; y++) for (let x = -8; x <= 8; x++) {
      const d = Math.hypot(x / 8, y / 9);
      if (d > 1) continue;
      plot(px, 72 + x, gy + y, d > 0.86 ? P.dark : d > 0.66 ? (x + y < -2 ? P.brassLit : x + y > 4 ? P.brassDark : P.brass) : x + y < -4 ? P.glassLit : P.glass);
    }
  }
  rect(px, 70, 26, 5, 5, P.leatherDark); rect(px, 71, 26, 3, 5, P.leather); // the bridge
  return px;
}

/** A desk calendar card: the day in red, today's date. */
export function calendarArt(d: DateInfo): Px {
  const px = createPx(44, 52);
  rect(px, 2, 2, 42, 50, P.shadow);
  sheet(px, 0, 0, 42, 50, P.white, P.creamShade, 91);
  rect(px, 0, 0, 42, 12, P.red); rect(px, 0, 0, 42, 1, P.redLit); rect(px, 0, 11, 42, 1, P.redDark);
  centred(px, 4, d.month.toUpperCase(), P.cream, 0, 42);
  const day = String(d.day);
  // The day, big: each glyph pixel drawn 2 × 2.
  const big = createPx(textWidth(day), 5); text(big, 0, 0, day, P.ink);
  const bx = Math.floor((42 - big.w * 3) / 2);
  for (let y = 0; y < 5; y++) for (let x = 0; x < big.w; x++) if (big.data[(y * big.w + x) * 4 + 3]) rect(px, bx + x * 3, 17 + y * 3, 3, 3, P.ink);
  centred(px, 37, String(d.year), P.pencil, 0, 42);
  for (const rx of [8, 33]) { disc(px, rx, 1, 2, () => P.steelDark); plot(px, rx, 1, P.steelLit); } // binding rings
  return px;
}

// ── Things that just lie there ──
/** A mug of tea from above: the tea, its rim, the handle. */
export function mugArt(): Px {
  const px = createPx(46, 40);
  disc(px, 20, 20, 18, (d, dx, dy) => (d > 17 ? P.creamShade : d > 14.5 ? (dx + dy < -6 ? P.white : P.cream) : d > 13.5 ? P.teaLit : dx + dy < -12 ? P.teaLit : P.tea));
  disc(px, 15, 15, 3, (d) => (d < 2 ? [176, 128, 70, 255] : null)); // the window in the tea
  rect(px, 37, 15, 8, 10, P.cream); rect(px, 39, 17, 4, 6, P.shadow); rect(px, 37, 15, 8, 1, P.white);
  for (let a = 0; a < 40; a++) if (hash(95, a, 0) < 0.5) plot(px, 20 + Math.round(Math.cos(a / 6.4) * 16), 20 + Math.round(Math.sin(a / 6.4) * 16), [70, 98, 140, 255]); // a blue band
  return px;
}
export function pencilArt(): Px {
  const px = createPx(92, 6);
  for (let x = 0; x < 78; x++) { plot(px, x, 1, P.wood); plot(px, x, 2, [200, 150, 76, 255]); plot(px, x, 3, P.wood); plot(px, x, 4, [140, 100, 50, 255]); }
  rect(px, 0, 1, 7, 4, P.brass); rect(px, 0, 1, 7, 1, P.brassLit); rect(px, 0, 1, 3, 4, [196, 96, 96, 255]); // ferrule and rubber
  for (let x = 78; x < 88; x++) { const h = Math.round((88 - x) / 4); for (let y = 3 - h; y <= 3 + h - 1; y++) plot(px, x, y, [222, 196, 150, 255]); }
  plot(px, 88, 2, P.pencil); plot(px, 89, 2, P.pencil); plot(px, 88, 3, P.pencil);
  return px;
}
export function penArt(): Px {
  const px = createPx(78, 6);
  rect(px, 0, 1, 56, 4, P.dark); rect(px, 0, 1, 56, 1, [80, 76, 72, 255]); rect(px, 14, 0, 2, 6, P.brass); rect(px, 4, 0, 18, 1, P.brass); // the cap and its clip
  rect(px, 56, 2, 14, 2, P.brass); rect(px, 70, 2, 6, 2, P.brassLit); plot(px, 77, 2, P.ink);
  return px;
}
export function tinArt(): Px {
  const px = createPx(48, 30);
  rect(px, 0, 0, 48, 30, [150, 40, 32, 255]); rect(px, 0, 0, 48, 1, P.redLit); rect(px, 0, 0, 1, 30, P.redLit); rect(px, 0, 29, 48, 1, P.redDark); rect(px, 47, 0, 1, 30, P.redDark);
  rect(px, 4, 4, 40, 22, P.brass); rect(px, 5, 5, 38, 20, [160, 40, 32, 255]);
  centred(px, 8, 'NAVY CUT', P.brassLit); centred(px, 16, 'TOBACCO', P.cream);
  for (let x = 2; x < 46; x += 3) plot(px, x, 28, [120, 70, 60, 255]); // scuffs
  return px;
}
export function matchesArt(): Px {
  const px = createPx(34, 22);
  rect(px, 0, 0, 34, 22, [184, 72, 48, 255]); rect(px, 0, 0, 34, 1, [214, 104, 70, 255]); rect(px, 0, 21, 34, 1, P.redDark);
  rect(px, 3, 3, 28, 12, P.cream); centred(px, 5, 'SWAN', P.red); centred(px, 11, '', P.ink);
  rect(px, 3, 17, 28, 3, [100, 60, 50, 255]); // the striker
  for (let k = 0; k < 6; k++) plot(px, 6 + k * 4, 18, [150, 100, 80, 255]);
  return px;
}
export function spentMatchArt(): Px { const px = createPx(22, 3); line(px, 0, 1, 18, 1, [190, 160, 110, 255]); rect(px, 18, 0, 4, 3, P.dark); return px; }
export function compassArt(): Px {
  const px = createPx(36, 40);
  rect(px, 15, 0, 6, 5, P.brass); disc(px, 18, 2, 2, (d) => (d > 1 ? P.brassDark : null)); // the ring
  disc(px, 18, 22, 17, (d, dx, dy) => (d > 16 ? P.dark : d > 13 ? (dx + dy < -8 ? P.brassLit : dx + dy > 8 ? P.brassDark : P.brass) : P.white));
  for (let h = 0; h < 16; h++) { const a = (h / 16) * Math.PI * 2; plot(px, Math.round(18 + Math.sin(a) * 11), Math.round(22 - Math.cos(a) * 11), h % 4 ? P.pencil : P.ink); }
  text(px, 17, 12, 'N', P.red);
  line(px, 18, 15, 18, 22, P.red); line(px, 18, 22, 18, 30, P.ink); disc(px, 18, 22, 1, () => P.brassDark);
  plot(px, 13, 16, P.glassLit); plot(px, 12, 17, P.glassLit);
  return px;
}
export function padArt(): Px {
  const px = createPx(60, 76);
  sheet(px, 0, 0, 60, 76, P.paper, P.paperShade, 71);
  rect(px, 0, 0, 60, 8, P.olive); rect(px, 0, 0, 60, 1, P.oliveLit); centred(px, 2, 'MESSAGE', P.cream);
  for (let y = 14; y < 74; y += 6) line(px, 4, y, 55, y, P.paperShade);
  scrawl(px, 5, 12, 46, 5, P.pencil, 72, 6);
  text(px, 5, 48, 'B4  C2  Z11', P.pencil);
  return px;
}
export function lampArt(): Px {
  // A hurricane lamp from above: the cap's vent, the glass chimney round it, the brass fount below.
  const px = createPx(52, 52);
  disc(px, 26, 26, 25, (d, dx, dy) => (d > 24 ? P.dark : d > 20 ? (dx + dy < -10 ? P.brassLit : dx + dy > 10 ? P.brassDark : P.brass) : d > 15 ? (dx + dy < -6 ? P.glassLit : P.glass) : d > 11 ? P.flameRing : d > 7 ? (dx + dy < -4 ? P.steelLit : P.steel) : d > 3 ? P.steelDark : P.dark));
  for (let a = 0; a < 8; a++) plot(px, 26 + Math.round(Math.cos(a * 0.785) * 5), 26 + Math.round(Math.sin(a * 0.785) * 5), P.dark); // vent holes
  rect(px, 25, 0, 2, 6, P.steelDark); // the handle wire
  return px;
}
