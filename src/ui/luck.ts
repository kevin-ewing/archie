// The lucky sixpence on its cord, as a plain raster: the cockpit's charm (ui/hud.ts) hangs it under the
// altimeter and the desk in the barn (story/barn-art.ts) leaves the same coin lying. Pure.

import { createPx, plot, type Px, type RGBA } from '../core/pixels.ts';

export const LUCK = { W: 23, H: 34, pivot: 11, cordA: [0xc4, 0xb0, 0x80, 255], cordB: [0x7a, 0x68, 0x45, 255] } as const satisfies Record<string, number | RGBA>;

/** The knot (top 7 rows) and the coin (from row 16) of the charm, on one raster. */
export function luckPx(): Px {
  const { W, H, cordA, cordB } = LUCK;
  const px = createPx(W, H);
  const c = LUCK.pivot;
  const cordDark: RGBA = [0x4f, 0x43, 0x2c, 255];
  const silver: RGBA = [0xc6, 0xc4, 0xb8, 255];
  const silverLit: RGBA = [0xf0, 0xee, 0xe4, 255];
  const silverDark: RGBA = [0x6c, 0x6a, 0x60, 255];
  const worn: RGBA = [0x9c, 0x9a, 0x8e, 255];
  // The tie: a loop of cord wrapped round the bezel (around the pivot), a fat knot below it with its two
  // cut ends sticking out, then the twisted cord down to the coin.
  for (const [x, y] of [[c - 1, 0], [c, 0], [c + 1, 0], [c + 2, 0], [c - 2, 1], [c + 3, 1], [c - 1, 2], [c + 2, 2]]) plot(px, x, y, y ? cordB : cordA);
  for (let y = 3; y <= 4; y++) for (let x = c - 1; x <= c + 2; x++) plot(px, x, y, (x + y) % 2 ? cordA : cordB); // the knot
  plot(px, c + 2, 4, cordDark);
  for (const [x, y] of [[c - 2, 5], [c + 3, 5], [c + 3, 6]]) plot(px, x, y, cordB); // the cut ends
  // The coin, as a worn George V silver sixpence (1911 on): a flat raised rim lit from
  // the top-left and shadowed bottom-right, a ring of toothed border beads just inside it, the legend
  // (GEORGIVS V DEI GRA: BRITT: OMN: REX …, far too small to read: a broken ring of dots), and the king's
  // bare head in low relief facing left, its edge caught by the light. Rubbed smooth in a pocket.
  const cy = 25;
  const R = 8.5;
  const field: RGBA = [0xb4, 0xb2, 0xa6, 255];
  for (let y = -9; y <= 9; y++) {
    for (let x = -9; x <= 9; x++) {
      const d = Math.hypot(x, y);
      if (d > R) continue;
      const lit = (x + y) / Math.max(1, d); // −1.4 top-left … 1.4 bottom-right
      let col: RGBA;
      if (d > R - 1.4) col = lit < -0.5 ? silverLit : lit > 0.6 ? silverDark : silver; // the raised rim
      else if (d > R - 2.9) col = Math.round((Math.atan2(y, x) / (2 * Math.PI)) * 30) & 1 ? worn : silverDark; // border teeth
      else col = lit < -0.9 && d > 4 ? silver : field; // the field, a touch brighter toward the light
      plot(px, c + x, cy + y, col);
    }
  }
  // The legend: a broken ring of dots inside the teeth, gapped at the bottom (under the bust).
  for (let k = 0; k < 24; k++) {
    if (k === 5 || k === 6 || k === 7) continue; // (bottom: the truncation of the neck)
    const a = (k / 24) * 2 * Math.PI;
    if (k % 2) plot(px, c + Math.round(Math.cos(a) * 4.9), cy + Math.round(Math.sin(a) * 4.9), silverDark);
  }
  // The head, facing left, in low relief: the skull and hair, brow, nose, lips and beard, the neck cut off.
  const head = [
    [-1, 2], // y −4: the crown
    [-2, 3], // y −3
    [-2, 3], // y −2: brow
    [-3, 3], // y −1: nose
    [-2, 3], // y 0: lips
    [-2, 2], // y 1: beard
    [-1, 2], // y 2: neck
    [-1, 2], // y 3
  ];
  head.forEach(([from, to], i) => {
    const y = i - 4;
    for (let x = from; x <= to; x++) {
      const rim = x === from || y === -4; // the face's profile and the top of the head catch the light …
      const shade = x === to || i === head.length - 1; // … the back of the head and the neck are in shadow
      plot(px, c + x, cy + y, rim ? silverLit : shade ? silverDark : worn);
    }
  });
  plot(px, c - 1, cy - 2, silverDark); // the eye
  plot(px, c + 1, cy - 1, silverDark); // the ear
  // Years in a pocket: a fine scratch across the field and a little dark toning by the rim.
  for (const [x, y] of [[-4, 3], [-3, 4]]) plot(px, c + x, cy + y, worn);
  for (const [x, y] of [[4, 4], [5, 2]]) plot(px, c + x, cy + y, [0x8a, 0x80, 0x6a, 255]);
  // The drilled hole, with the cord through it.
  for (const x of [c, c + 1]) {
    plot(px, x, cy - R + 2, silverDark);
    plot(px, x, cy - R + 1, x === c ? cordA : cordB);
  }
  return px;
}
