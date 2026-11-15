// A tiny pixel raster for pixel art made in code (instruments, smoke): plot pixels, discs, lines and a 3×5 pixel font into RGBA buffers.
// Everything lands on whole pixels, so it stays as crisp as the rest of the game. No DOM.

export type RGBA = readonly [number, number, number, number];
export type Px = { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> };

/** At least 1×1: a 0-size raster can't become an ImageData (it throws), e.g. for an empty label. */
export const createPx = (w: number, h: number): Px => {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
};

export function plot(px: Px, x: number, y: number, c: RGBA): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < px.w && y < px.h) px.data.set(c, (y * px.w + x) * 4);
}

/** Fill a disc centred on pixel (cx, cy); `shade` picks each pixel's colour (or null to skip). */
export function disc(px: Px, cx: number, cy: number, r: number, shade: (dx: number, dy: number, d: number) => RGBA | null): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const c = shade(x - cx, y - cy, d);
      if (c) plot(px, x, y, c);
    }
  }
}

/** Bresenham line between pixel centres. */
export function line(px: Px, x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(px, x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Point at `radius` from (cx, cy), `angle` radians clockwise from straight up (like a dial). */
export const polar = (cx: number, cy: number, radius: number, angle: number) => ({ x: cx + Math.sin(angle) * radius, y: cy - Math.cos(angle) * radius });

// 5-px-tall glyphs ('#' = ink), mostly 3 wide; N, M and W need more to read as themselves.
// Only the characters the HUD uses (instrument labels, the date).
const FONT: Record<string, string> = {
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', L: '#.. #.. #.. #.. ###', O: '### #.# #.# #.# ###',
  P: '### #.# ### #.. #..', R: '##. #.# ##. #.# #.#', S: '### #.. ### ..# ###', T: '### .#. .#. .#. .#.',
  N: '#..# ##.# #.## #..# #..#', M: '#...# ##.## #.#.# #...# #...#', W: '#...# #...# #.#.# ##.## #...#',
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  G: '.## #.. #.# #.# .##', J: '..# ..# ..# #.# .#.', U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.',
  Y: '#.# #.# .#. .#. .#.',
  I: '### .#. .#. .#. ###', H: '#.# #.# ### #.# #.#',
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.', ':': '. # . # .',
};
export const GLYPH_H = 5;
const glyphWidth = (ch: string) => FONT[ch]?.indexOf(' ') ?? 3;
export const textWidth = (s: string) => Math.max(0, [...s].reduce((w, ch) => w + glyphWidth(ch) + 1, -1));

/** Draw text with its top-left at (x, y). Unknown characters render as a 3-px gap. */
// A smaller face for figures on small dials: 3×4 digits.
const TINY: Record<string, string> = {
  '0': '### #.# #.# ###', '1': '.#. ##. .#. ###', '2': '##. ..# .#. ###', '3': '### .## ..# ###', '4': '#.# #.# ### ..#',
  '5': '### ##. ..# ##.', '6': '#.. ### #.# ###', '7': '### ..# .#. .#.', '8': '### ### #.# ###', '9': '### #.# ### ..#',
};
export const tinyWidth = (s: string) => Math.max(0, s.length * 4 - 1);
/** Draw `s` (digits only) in the tiny 3×4 face. */
export function tinyText(px: Px, x: number, y: number, s: string, c: RGBA): void {
  for (const ch of s) {
    TINY[ch]?.split(' ').forEach((row, ry) => [...row].forEach((v, rx) => v === '#' && plot(px, x + rx, y + ry, c)));
    x += 4;
  }
}

export function text(px: Px, x: number, y: number, s: string, c: RGBA): void {
  for (const ch of s) {
    FONT[ch]?.split(' ').forEach((row, ry) => [...row].forEach((v, rx) => v === '#' && plot(px, x + rx, y + ry, c)));
    x += glyphWidth(ch) + 1;
  }
}
