import { bayer, hash } from '../core/noise.ts';
import { createPx, disc, line, plot, text, type Px, type RGBA } from '../core/pixels.ts';

const dark: RGBA = [31, 26, 21, 255];
const ink: RGBA = [78, 65, 48, 255];
const paper: RGBA = [202, 182, 132, 255];
const cream: RGBA = [230, 212, 163, 255];
const red: RGBA = [127, 55, 42, 255];
const olive: RGBA = [112, 114, 82, 255];

function rect(px: Px, x: number, y: number, w: number, h: number, colour: RGBA) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) plot(px, x + dx, y + dy, colour);
  }
}

export function homePhoto() {
  const px = createPx(53, 40);
  rect(px, 0, 0, px.w, px.h, cream);
  for (let y = 3; y < 35; y++) {
    for (let x = 3; x < 50; x++) {
      const v = (y < 22 ? 166 : y < 28 ? 103 : 124) + Math.floor(hash(3, x, y) * 4) * 7;
      plot(px, x, y, [v + 12, v + 5, v - 7, 255]);
    }
  }
  line(px, 24, 32, 25, 13, ink);
  line(px, 25, 22, 14, 12, ink);
  line(px, 25, 22, 36, 12, ink);
  for (const [x, y, r] of [[13, 11, 7], [22, 10, 6], [31, 10, 7], [38, 14, 6]]) {
    disc(px, x, y, r, (dx, dy, d) => hash(8, x + dx, y + dy) < 1 - d / (r + 2)
      ? (bayer(x + dx, y + dy) < 0.5 ? cream : paper) : null);
  }
  return px;
}

export function barnDesk() {
  const px = createPx(256, 160);
  // The crate is brighter than the barn floor. Keep grain in narrow, hard-edged clusters.
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const onDesk = x >= 11 && x < 245 && y >= 13 && y < 146;
      const across = onDesk ? y - 13 : x;
      const along = onDesk ? x : y;
      const width = onDesk ? 26 : 18;
      const board = Math.floor(across / width);
      const grain = hash(1915, Math.floor(along / 9), across);
      const light = Math.max(0, 1 - Math.hypot(x - 213, (y - 27) * 1.18) / 188);
      const v = (onDesk ? 49 : 25) + Math.floor(light * (onDesk ? 28 : 15) / 4 + bayer(x, y)) * 4
        + Math.floor(grain * 4) * 3 + Math.floor(hash(17, board, 0) * 5) * 3;
      plot(px, x, y, across % width === 0 ? dark : [v + 12, v, v - 14, 255]);
    }
  }
  rect(px, 11, 12, 234, 2, [130, 100, 63, 255]);
  rect(px, 11, 146, 234, 4, dark);
  for (const x of [16, 239]) {
    for (const y of [19, 43, 69, 95, 121, 141]) {
      rect(px, x, y, 2, 2, dark);
      plot(px, x, y, ink);
    }
  }

  // Folded gridded chart with a canal, a road and a pair of pencil marks.
  rect(px, 32, 34, 103, 89, dark);
  rect(px, 29, 29, 103, 90, paper);
  rect(px, 30, 30, 101, 1, cream);
  for (let x = 36; x < 131; x += 12) line(px, x, 35, x, 112, [167, 151, 112, 255]);
  for (let y = 40; y < 117; y += 12) line(px, 34, y, 127, y, [167, 151, 112, 255]);
  for (let y = 34; y < 114; y++) {
    const x = 62 + Math.round(9 * Math.sin(y / 12) - (y - 50) / 4);
    line(px, x, y, x + 1, y, [110, 126, 118, 255]);
  }
  line(px, 37, 89, 76, 72, olive);
  line(px, 76, 72, 122, 83, olive);
  line(px, 81, 32, 81, 117, cream);
  line(px, 30, 74, 130, 74, cream);
  for (const [x, y] of [[48, 55], [107, 63]]) {
    line(px, x - 3, y - 3, x + 3, y + 3, red);
    line(px, x - 3, y + 3, x + 3, y - 3, red);
  }

  // A dispatch and a short stack of post, held down by a steel clip.
  rect(px, 151, 36, 51, 57, dark);
  rect(px, 147, 32, 51, 57, cream);
  text(px, 154, 39, 'ORDERS', ink);
  for (const [y, w] of [[49, 35], [54, 32], [59, 24], [70, 35], [75, 29]]) line(px, 154, y, 154 + w, y, olive);
  rect(px, 186, 31, 7, 3, ink);
  rect(px, 188, 30, 5, 1, paper);
  rect(px, 198, 62, 40, 29, dark);
  rect(px, 195, 59, 40, 29, paper);
  line(px, 196, 60, 215, 73, ink);
  line(px, 233, 60, 215, 73, ink);
  rect(px, 213, 71, 5, 4, red);

  // Oilcloth logbook, with its exposed page edges and an inset title slip.
  rect(px, 61, 125, 68, 20, dark);
  rect(px, 59, 122, 68, 20, olive);
  rect(px, 64, 139, 61, 2, paper);
  line(px, 62, 124, 62, 139, ink);
  rect(px, 84, 124, 20, 5, paper);

  const photo = homePhoto();
  rect(px, 177, 101, photo.w, photo.h, dark);
  for (let y = 0; y < photo.h; y++) {
    for (let x = 0; x < photo.w; x++) {
      const i = (y * photo.w + x) * 4;
      const [r, g, b, a] = photo.data.subarray(i, i + 4);
      plot(px, 173 + x, 98 + y, [r, g, b, a]);
    }
  }

  // Lamp base seen from above, pencil and the side of a second crate.
  disc(px, 217, 31, 13, (x, y, d) => d > 11 ? dark : d < 5 ? cream : x + y < 0 ? paper : ink);
  disc(px, 216, 30, 2, () => [255, 229, 153, 255]);
  line(px, 139, 97, 152, 122, dark);
  line(px, 138, 96, 150, 120, [164, 120, 65, 255]);
  line(px, 150, 120, 152, 123, ink);
  rect(px, 35, 153, 112, 7, dark);
  rect(px, 37, 153, 108, 2, ink);
  return px;
}
