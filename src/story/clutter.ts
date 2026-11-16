// The clutter on the pilot's desk: what just lies about (none of it does anything; the sixpence lives in
// desk-items.ts, because it does). Drawn from straight above in the same way as the coffee and the log book:
// colour and tone built up per pixel, lit from the top-left with no outlines; broad shading in the desk's
// tone steps under the ordered dither, thin parts in whole tones so they stay clean (see `toned`). Every
// drawing is fixed (seeded) and the same for everyone; barn-art.ts scatters them, turned any way.

import { bayer, fbm, hash, valueNoise } from '../core/noise.ts';
import { createPx, plot, text, textWidth, type Px } from '../core/pixels.ts';

type RGB = readonly [number, number, number];
/** set(x, y, colour, tone, whole): tone in the desk's steps (6 = one step); `whole` = no dither. */
type Set = (x: number, y: number, c: RGB, v: number, whole?: boolean) => void;

/** Paint a W × H drawing with `draw`, then snap it to tone steps (6 per step, 6 % each), dithered where
 * the shading is broad. Pixels never set stay transparent. */
function toned(W: number, H: number, draw: (set: Set, get: (x: number, y: number) => boolean) => void): Px {
  const C = new Float32Array(W * H * 3), T = new Float32Array(W * H), A = new Uint8Array(W * H);
  const set: Set = (x, y, c, v, whole = false) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2]; T[i] = v; A[i] = whole ? 2 : 1;
  };
  draw(set, (x, y) => x >= 0 && y >= 0 && x < W && y < H && A[y * W + x] > 0);
  const px = createPx(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!A[i]) continue;
    const k = 1 + (A[i] === 2 ? Math.round(T[i] / 6) : Math.floor(T[i] / 6 + bayer(x, y))) * 0.06;
    plot(px, x, y, [Math.round(C[i * 3] * k), Math.round(C[i * 3 + 1] * k), Math.round(C[i * 3 + 2] * k), 255]);
  }
  return px;
}

/** How a surface facing (nx, ny) catches the top-left light: 1 full on, −1 away. */
const lit = (nx: number, ny: number) => -(nx + ny) / Math.SQRT2;
/** A round rod from (ax, ay) to (bx, by), radius r, shaded across its width like a cylinder seen from above:
 * `paint(t, across)` gives its colour and tone at t (0 … 1 along it), across −1 … 1. */
function rod(set: Set, ax: number, ay: number, bx: number, by: number, r: number, paint: (t: number, across: number, shade: number) => [RGB, number, boolean?]) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  for (let y = Math.floor(Math.min(ay, by) - r - 1); y <= Math.max(ay, by) + r + 1; y++) for (let x = Math.floor(Math.min(ax, bx) - r - 1); x <= Math.max(ax, bx) + r + 1; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay, t = (px * ux + py * uy) / L, a = (px * nx + py * ny) / r;
    if (t < 0 || t > 1 || Math.abs(a) > 1) continue;
    const [c, v, whole] = paint(t, a, lit(nx * a, ny * a) * Math.sqrt(1 - Math.min(1, a * a)) + lit(nx, ny) * a * 0.6);
    set(x, y, c, v, whole);
  }
}
/** A filled ellipse (rx, ry, turned by `turn`) with `paint(d, nx, ny)`: d 0 at the centre … 1 at the edge. */
function blob(set: Set, cx: number, cy: number, rx: number, ry: number, turn: number, paint: (d: number, nx: number, ny: number, x: number, y: number) => [RGB, number, boolean?] | null) {
  const c = Math.cos(turn), s = Math.sin(turn), R = Math.ceil(Math.max(rx, ry)) + 1;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    const ox = x + 0.5 - cx, oy = y + 0.5 - cy, lx = (ox * c + oy * s) / rx, ly = (-ox * s + oy * c) / ry, d = Math.hypot(lx, ly);
    if (d > 1) continue;
    const nx = (lx * c - ly * s), ny = (lx * s + ly * c);
    const p = paint(d, d ? nx / d : 0, d ? ny / d : 0, x, y);
    if (p) set(x, y, p[0], p[1], p[2]);
  }
}
/** Lettering in the game's face, as whole-tone pixels of `c` (the shared 5-px font). */
function letters(set: Set, x: number, y: number, s: string, c: RGB, v = 0) {
  const t = createPx(Math.max(1, textWidth(s)), 5);
  text(t, 0, 0, s, [255, 255, 255, 255]);
  for (let j = 0; j < 5; j++) for (let i = 0; i < t.w; i++) if (t.data[(j * t.w + i) * 4 + 3]) set(x + i, y + j, c, v, true);
}
const centre = (w: number, s: string) => Math.floor((w - textWidth(s)) / 2);

const BRASS: RGB = [186, 142, 62], NICKEL: RGB = [168, 164, 146], STEEL: RGB = [112, 112, 104], BLACK: RGB = [34, 30, 28];
const CREAM: RGB = [226, 214, 176], PAPER: RGB = [206, 190, 148], LEATHER: RGB = [104, 66, 38], KHAKI: RGB = [120, 110, 74];
const ASH: RGB = [150, 146, 136], CHAR: RGB = [40, 32, 28];

/** A pencil: painted hexagonal barrel (three facets lit differently), a knife-whittled point, a chewed end. */
export function pencil(): Px {
  return toned(96, 9, (set) => {
    const L = 96, mid = 4;
    for (let x = 0; x < L; x++) for (let y = 0; y < 9; y++) {
      const across = (y - mid) / 4.5;
      if (Math.abs(across) > 1) continue;
      const facet = across < -0.33 ? 10 : across > 0.33 ? -14 : 0;
      if (x < 4) { if (hash(301, x, y) < 0.6 + x * 0.1) set(x, y, [142, 112, 66], facet - 6, true); continue; } // chewed bare wood
      if (x < 74) { set(x, y, [62, 86, 64], facet + (hash(302, x >> 3, y) < 0.08 ? -6 : 0), true); continue; } // green paint, a scratch or two
      if (x < 76) { set(x, y, [44, 60, 46], facet - 6, true); continue; } // the paint's edge
      const taper = (L - x) / (L - 76); // 1 … 0 to the point
      if (Math.abs(across) > taper * 1.05) continue;
      if (x > L - 6) set(x, y, [70, 68, 66], facet + 4, true); // the lead
      else set(x, y, [214, 182, 132], facet + Math.round(((x * 7) % 5) - 2) * 3, true); // shaved wood, in knife-cut facets
    }
    letters(set, 30, 2, 'HB', [196, 174, 96], 0);
  });
}

/** A fountain pen: black vulcanite, chased with a fine wave, a gold clip and band on the cap, a two-tone nib. */
export function pen(): Px {
  return toned(84, 9, (set) => {
    rod(set, 2, 4.5, 64, 4.5, 3.6, (t, a, s) => [BLACK, s * 18 + (Math.abs(a) < 0.25 && t > 0.03 ? 6 : 0) + (Math.sin(t * 120 + a * 3) > 0.85 ? 6 : 0), true]);
    rod(set, 64, 4.5, 72, 4.5, 2.6, (_t, _a, s) => [BLACK, s * 14 - 4, true]); // the section
    for (let x = 72; x < 82; x++) { const h = (82 - x) / 10 * 2.4; for (let y = Math.ceil(4.5 - h); y <= 4.5 + h; y++) set(x, y, x > 76 ? [196, 160, 80] : [212, 176, 96], y < 4.5 ? 6 : -6, true); }
    set(81, 4, [80, 64, 40], 0, true);
    for (let y = 1; y <= 7; y++) for (const x of [22, 23]) set(x, y, BRASS, y < 4 ? 12 : -2, true); // the band
    for (let x = 6; x < 26; x++) set(x, 1, BRASS, x < 10 ? 14 : 4, true); // the clip
    set(6, 2, BRASS, 6, true);
  });
}

/** A flat tin of pipe tobacco: embossed lid, printed in red and gold, the enamel chipped and scuffed. */
export function tobaccoTin(): Px {
  return toned(54, 36, (set) => {
    for (let y = 0; y < 36; y++) for (let x = 0; x < 54; x++) {
      const e = Math.min(x, y, 53 - x, 35 - y);
      if (e < 2 && (x < 2 || x > 51) && (y < 2 || y > 33) && Math.hypot(Math.min(x, 53 - x) - 2, Math.min(y, 35 - y) - 2) > 2.2) continue; // rounded corners
      const rim = e < 2 ? (x + y < 40 ? 14 : -14) : 0;
      const chip = fbm(311, x / 5, y / 5, 2) > 0.72 && e < 6; // enamel knocked off round the edge: bare tin
      set(x, y, chip ? NICKEL : e < 4 ? [116, 34, 28] : [150, 44, 34], rim + (chip ? 4 : 0) + (fbm(312, x / 9, y / 9, 2) - 0.5) * 10);
    }
    for (let y = 6; y < 30; y++) for (let x = 6; x < 48; x++) if (Math.min(x - 6, y - 6, 47 - x, 29 - y) < 1) set(x, y, BRASS, x + y < 40 ? 10 : -4, true); // the gold panel
    letters(set, centre(54, 'NAVY CUT'), 10, 'NAVY CUT', [222, 196, 110], 6);
    letters(set, centre(54, 'TOBACCO'), 19, 'TOBACCO', CREAM, 0);
    for (let k = 0; k < 9; k++) { const x0 = 4 + hash(313, k, 1) * 44, y0 = 3 + hash(313, k, 2) * 30; for (let j = 0; j < 5; j++) set(x0 + j, y0 + j * 0.3, [186, 120, 104], 0, true); } // scratches
  });
}

/** A box of matches, from above: the printed label (a swan), the striker down one side, a match half out. */
export function matchbox(): Px {
  return toned(44, 26, (set) => {
    for (let y = 1; y < 25; y++) for (let x = 0; x < 38; x++) {
      const e = Math.min(x, y - 1, 37 - x, 24 - y);
      set(x, y, e < 1 ? [150, 110, 60] : [214, 182, 110], e < 1 ? (x + y < 30 ? 10 : -10) : (fbm(321, x / 6, y / 6, 2) - 0.5) * 8);
    }
    for (let y = 1; y < 4; y++) for (let x = 0; x < 38; x++) set(x, y, [92, 58, 42], (hash(322, x, y) - 0.5) * 18); // the striker
    for (let y = 6; y < 23; y++) for (let x = 3; x < 35; x++) if (Math.min(x - 3, y - 6, 34 - x, 22 - y) < 1) set(x, y, [44, 70, 110], 0, true); // blue border
    letters(set, centre(38, 'SWAN'), 15, 'SWAN', [44, 70, 110], 0);
    blob(set, 19, 10, 5, 2.4, 0, (d, nx, ny) => [[236, 232, 222], lit(nx, ny) * 10 * d, true]); // the swan
    set(23, 9, [236, 232, 222], 0, true); set(24, 8, [236, 232, 222], 0, true); set(25, 8, [200, 120, 40], 0, true);
    rod(set, 30, 18, 43, 21, 1.2, (t, _a, s) => (t > 0.82 ? [[150, 44, 32], s * 10, true] : [[226, 196, 140], s * 10, true])); // a match half out
  });
}

/** A spent match, its head burned black and the stick charred and bent at the end. */
export function spentMatch(n = 0): Px {
  return toned(26, 6, (set) => {
    const bend = (hash(331, n, 1) - 0.5) * 2;
    rod(set, 1, 3, 18, 3, 1.1, (t, _a, s) => [t > 0.7 ? [70, 54, 40] : [222, 194, 140], s * 10, true]);
    rod(set, 18, 3, 23, 3 + bend, 1.1, (_t, _a, s) => [CHAR, s * 8, true]);
    blob(set, 23.5, 3 + bend, 1.8, 1.5, 0, (_d, nx, ny) => [CHAR, lit(nx, ny) * 8 + 4, true]);
  });
}

/** A cigarette end, the paper crumpled where it was put out, a tip of ash. */
export function cigaretteEnd(n = 0): Px {
  return toned(16, 6, (set) => {
    rod(set, 1, 3, 11, 3 + (hash(341, n, 1) - 0.5), 2, (t, a, s) => [t > 0.88 ? CHAR : [234, 228, 214], s * 12 + (Math.abs(a) > 0.7 && hash(342, t * 40, a * 3) < 0.4 ? -8 : 0), true]);
    for (let k = 0; k < 6; k++) set(11 + hash(343, n, k) * 4, 1.5 + hash(344, n, k) * 3, ASH, (hash(345, n, k) - 0.5) * 20, true);
  });
}

/** An ashtray made from the base of a shell case (trench art): a thick brass ring, the struck primer in the
 * middle seen through the ash, two ends stubbed out in it. */
export function shellAshtray(): Px {
  return toned(48, 48, (set) => {
    blob(set, 24, 24, 22, 22, 0, (d, nx, ny, x, y) => {
      if (d > 0.82) return [BRASS, lit(nx, ny) * 22 * (d > 0.93 ? 1 : 0.5) + (fbm(351, x / 4, y / 4, 2) - 0.5) * 8, false]; // the rim, rounded
      if (d > 0.74) return [BRASS, -lit(nx, ny) * 14 - 10, true]; // the inner wall, lit on its far side
      const ash = fbm(352, x / 3, y / 3, 3);
      if (d < 0.2) return [[160, 120, 60], lit(nx, ny) * 8 - (d < 0.08 ? 16 : 0), true]; // the primer, struck
      return [ash > 0.55 ? ASH : [96, 88, 80], (ash - 0.5) * 30, false];
    });
    rod(set, 10, 20, 22, 26, 1.8, (t, _a, s) => [t < 0.2 ? CHAR : [228, 220, 204], s * 10 - 4, true]);
    rod(set, 30, 34, 38, 28, 1.8, (t, _a, s) => [t > 0.85 ? CHAR : [228, 220, 204], s * 10 - 4, true]);
    letters(set, 15, 38, '18PR', [120, 86, 36], 0); // stamped on the base: an 18-pounder
  });
}

/** Two .303 rounds: brass cases, rimmed, cupro-nickel bullets, the cordite crimp. */
export function cartridge(n = 0): Px {
  return toned(34, 7, (set) => {
    rod(set, 2, 3.5, 22, 3.5, 3, (t, _a, s) => [BRASS, s * 20 + (t > 0.94 ? -8 : 0), true]); // the case
    rod(set, 0.5, 3.5, 2.5, 3.5, 3.4, (_t, _a, s) => [BRASS, s * 20 - 6, true]); // the rim
    rod(set, 22, 3.5, 25, 3.5, 2, (_t, _a, s) => [BRASS, s * 16 - 2, true]); // the neck
    rod(set, 25, 3.5, 33, 3.5, 1.9, (t, _a, s) => [NICKEL, s * 22 - t * 8, true]); // the bullet, tapering
    set(33, 3, NICKEL, -10, true);
    if (n % 2) set(10, 2, [150, 100, 40], 0, true); // a thumb-tarnish
  });
}

/** A newspaper folded in four, a few days old: the masthead, the columns of close print, a headline, a
 * photograph block, the fold creased dark. */
export function newspaper(): Px {
  return toned(76, 98, (set) => {
    for (let y = 0; y < 98; y++) for (let x = 0; x < 76; x++) {
      const e = Math.min(x, y, 75 - x, 97 - y);
      const fold = Math.abs(y - 49) < 1;
      set(x, y, [206, 200, 180], (fold ? -14 : 0) + (e < 1 ? -10 : 0) + (fbm(471, x / 12, y / 12, 2) - 0.5) * 10 + (x + y < 40 ? 4 : 0));
    }
    letters(set, centre(76, 'DAILY MAIL'), 4, 'DAILY MAIL', [36, 34, 32], 0);
    for (let x = 4; x < 72; x++) { set(x, 11, [60, 58, 54], 0, true); set(x, 13, [60, 58, 54], 0, true); }
    letters(set, 4, 16, 'GAINS AT YPRES', [36, 34, 32], 0);
    for (let y = 28; y < 46; y++) for (let x = 4; x < 32; x++) set(x, y, [120, 114, 102], (fbm(472, x / 3, y / 3, 2) - 0.5) * 30); // the photograph
    for (let col = 0; col < 3; col++) for (let y = 24; y < 95; y += 2) { // the print, too small to read
      const x0 = 4 + col * 23;
      if (col === 0 && y < 47) continue;
      for (let x = x0; x < x0 + 20; x++) if (hash(473, x >> 1, y) < 0.7) set(x, y, [96, 92, 86], 0, true);
    }
  });
}

/** A ball of paper, screwed up and thrown at the bin: facets lit and shaded, a few lines of writing showing. */
export function paperBall(): Px {
  return toned(24, 22, (set) => {
    blob(set, 12, 11, 11, 10, 0, (_d, nx, ny, x, y) => {
      const facet = Math.floor(valueNoise(481, x / 3, y / 3) * 4);
      return [[220, 210, 176], lit(nx, ny) * 10 + (facet - 1.5) * 8 + (hash(482, x, y >> 1) < 0.06 ? -20 : 0), true];
    });
  });
}

/** A pocket knife, closed: horn scales riveted, nickel bolsters, the nail nick on its blade. */
export function pocketKnife(): Px {
  return toned(48, 12, (set) => {
    rod(set, 6, 6, 42, 6, 4.6, (t, _a, s) => [t < 0.12 || t > 0.88 ? NICKEL : [92, 70, 52], s * 20 + (t > 0.12 && t < 0.88 ? (fbm(491, t * 30, 0, 2) - 0.5) * 14 : 0), true]);
    for (const x of [14, 34]) set(x, 6, BRASS, 8, true); // rivets
    for (let x = 18; x < 30; x++) set(x, 2, NICKEL, 10, true); // the blade's back, showing
    set(22, 3, CHAR, 0, true);
  });
}

/** A drawing pin, brass head, lit on its dome. */
export function drawingPin(): Px {
  return toned(9, 9, (set) => blob(set, 4.5, 4.5, 4.2, 4.2, 0, (d, nx, ny) => [BRASS, lit(nx, ny) * 22 * d + (d < 0.3 ? 10 : 0), true]));
}

/** An Army biscuit, hard as a tile: the square, its docking holes in rows, a corner bitten off. */
export function biscuit(): Px {
  return toned(34, 34, (set) => {
    for (let y = 0; y < 34; y++) for (let x = 0; x < 34; x++) {
      if (x + y > 58 && Math.hypot(x - 33, y - 33) < 9 + valueNoise(501, x, y) * 3) continue; // the bite
      const e = Math.min(x, y, 33 - x, 33 - y);
      const hole = x % 7 === 3 && y % 7 === 3 && e > 2;
      set(x, y, [196, 160, 104], hole ? -30 : (e < 2 ? (x + y < 34 ? 10 : -12) : 0) + (fbm(502, x / 5, y / 5, 2) - 0.5) * 14);
    }
  });
}

/** A briar pipe on its side: the bowl, its dottle of charred tobacco, the vulcanite stem and its lip. */
export function pipe(): Px {
  return toned(52, 26, (set) => {
    rod(set, 20, 13, 49, 9, 2.3, (t, _a, s) => [t < 0.35 ? [110, 66, 38] : BLACK, s * 18 + (t > 0.95 ? 6 : 0), true]);
    blob(set, 13, 13, 12, 11, 0, (d, nx, ny, x, y) => {
      if (d > 0.62) return [[112, 64, 34], lit(nx, ny) * 22 + (fbm(361, x / 3, y / 2, 2) - 0.5) * 14, false]; // the bowl's rim and grain
      return [hash(362, x, y) < 0.3 ? [120, 92, 60] : [56, 40, 30], (hash(363, x, y) - 0.5) * 20 - 4, true]; // the dottle
    });
  });
}

/** A square bottle of ink, the glass showing the ink's level dark inside, a cork stopper, a paper label. */
export function inkBottle(): Px {
  return toned(30, 30, (set) => {
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const e = Math.min(x, y, 29 - x, 29 - y);
      if (e < 2 && Math.hypot(Math.max(0, 3 - x, x - 26), Math.max(0, 3 - y, y - 26)) > 3) continue;
      set(x, y, e < 3 ? [92, 110, 112] : [30, 38, 54], e < 3 ? (x + y < 30 ? 18 : -10) : (e < 5 && x + y < 26 ? 14 : 0), e < 3);
    }
    blob(set, 15, 15, 7, 7, 0, (d, nx, ny, x, y) => [[164, 124, 82], lit(nx, ny) * 14 * d + (hash(371, x, y) - 0.5) * 16, false]); // the cork
    for (let y = 22; y < 28; y++) for (let x = 6; x < 24; x++) set(x, y, CREAM, y === 22 ? 6 : 0, true);
    letters(set, 7, 22, 'BLUE', [44, 52, 90], 0);
  });
}

/** A picture postcard face up: a view of a town square, the printed caption, a corner bent up. */
export function postcard(): Px {
  return toned(72, 48, (set) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 72; x++) {
      if (x > 64 && y < 72 - x - 56) continue; // the bent corner…
      const pic = x > 3 && y > 3 && x < 68 && y < 38;
      const sky = y < 18 - (x > 20 && x < 30 ? 10 : 0) - (Math.abs(x - 50) < 8 ? 6 : 0); // a spire, a roofline
      set(x, y, pic ? (sky ? [176, 168, 140] : [110, 98, 76]) : CREAM, pic ? (fbm(381, x / 4, y / 4, 2) - 0.5) * 24 + (sky ? 0 : (x % 6 === 0 ? -10 : 0)) : (x + y < 20 ? 6 : 0));
    }
    for (let k = 0; k < 8; k++) set(64 + k, 8 - k, PAPER, -8, true); // …showing its back
    letters(set, 5, 41, 'YPRES - LES HALLES', [70, 60, 48], 0);
  });
}

/** A pewter hip flask, curved to the hip: its broad lit face, the screw cap on its chain, a dent. */
export function hipFlask(): Px {
  return toned(44, 62, (set) => {
    for (let y = 10; y < 62; y++) for (let x = 0; x < 44; x++) {
      const r = Math.min(x, 43 - x, y - 10, 61 - y);
      if (r < 6 && Math.hypot(Math.max(0, 6 - Math.min(x, 43 - x)), Math.max(0, 6 - Math.min(y - 10, 61 - y))) > 6) continue;
      const across = (x - 22) / 22;
      set(x, y, [150, 152, 146], -across * 18 + (r < 2 ? (x + y < 40 ? 12 : -14) : 0) + (Math.hypot(x - 30, y - 44) < 4 ? -10 : 0)); // the curve, a dent
    }
    blob(set, 22, 7, 6, 6, 0, (d, nx, ny) => [[150, 152, 146], lit(nx, ny) * 16 * d + 6, true]); // the cap
    for (let k = 0; k < 6; k++) set(28 + k, 9 + k * 0.6, STEEL, k % 2 ? -8 : 8, true); // its chain
    for (let y = 26; y < 48; y++) for (let x = 2; x < 42; x++) if (y % 3 === 0) set(x, y, LEATHER, -4, false); else if (y > 27 && y < 46) set(x, y, LEATHER, (hash(391, x, y) - 0.5) * 10 - Math.abs((x - 22) / 22) * 14);
  });
}

/** An RFC field-service cap, folded flat: khaki serge, the lit crown, the cap badge, the curtain turned up. */
export function sideCap(): Px {
  return toned(78, 36, (set) => {
    for (let y = 0; y < 36; y++) for (let x = 0; x < 78; x++) {
      const run = Math.abs(x - 39) / 39, top = 4 + run ** 2 * 14, bottom = 33 - run ** 1.5 * 12; // the boat shape, folded to a point at each end
      if (y < top || y > bottom || x < 2 || x > 76) continue;
      const fold = y > 19 ? -10 : 6; // the turned-up curtain sits lower
      const weave = (x + y) % 2 ? 2 : -2;
      set(x, y, KHAKI, fold + weave + (fbm(401, x / 10, y / 8, 2) - 0.5) * 12 + (y === 19 || y === 20 ? -14 : 0));
    }
    blob(set, 16, 26, 4, 4, 0, (d, nx, ny) => [BRASS, lit(nx, ny) * 18 * d + 6, true]); // the badge: a crown over the wings, in brass
    for (let x = 9; x < 24; x++) set(x, 26 + (x < 16 ? (16 - x) * 0.1 : (x - 16) * 0.1), BRASS, 0, true);
    for (let k = 0; k < 2; k++) blob(set, 66, 23 + k * 5, 1.6, 1.6, 0, (_d, nx, ny) => [BRASS, lit(nx, ny) * 16, true]); // the two buttons
  });
}

/** A pair of leather flying gauntlets thrown down, one over the other: long flared cuffs with fleece showing
 * at their mouths, the hand with its four fingers together and the thumb out, seams stitched in a paler thread. */
export function gauntlets(): Px {
  return toned(96, 78, (set) => {
    const glove = (cx: number, cy: number, turn: number, seed: number, flip: number) => {
      const c = Math.cos(turn), s = Math.sin(turn);
      const at = (u: number, v: number): [number, number] => [cx + c * u - s * v * flip, cy + s * u + c * v * flip];
      // The cuff: a flared trapezoid, wide at its mouth (u = -34) and narrowing to the wrist (u = -6).
      for (let u = -34; u <= -4; u += 0.5) {
        const half = 8 + (-4 - u) * 0.28;
        for (let v = -half; v <= half; v += 0.5) {
          const [x, y] = at(u, v);
          const edge = half - Math.abs(v) < 1.2;
          set(x, y, u < -32 ? [224, 210, 178] : LEATHER, u < -32 ? -4 : lit(-s * flip, c * flip) * (v / half) * 16 + (edge ? -12 : 0) + (fbm(seed, x / 5, y / 5, 2) - 0.5) * 12);
        }
      }
      // The hand: the palm, then four fingers together, rounded at the tips.
      blob(set, ...at(6, 0), 12, 9, turn, (d, nx, ny, x, y) => [LEATHER, lit(nx, ny) * 18 * d + (fbm(seed + 1, x / 5, y / 5, 2) - 0.5) * 10 + (d > 0.92 ? -10 : 0), false]);
      for (let f = 0; f < 4; f++) {
        const v = (f - 1.5) * 4.2;
        rod(set, ...at(14, v), ...at(30 - Math.abs(f - 1.5) * 3, v * 1.08), 2.3, (_t, a, sh) => [LEATHER, sh * 16 + (Math.abs(a) > 0.8 ? -10 : 0), true]);
      }
      rod(set, ...at(4, 9 * 1), ...at(16, 16), 2.6, (_t, a, sh) => [LEATHER, sh * 16 + (Math.abs(a) > 0.8 ? -10 : 0), true]); // the thumb
      for (let u = -30; u < -6; u += 3) { const [x, y] = at(u, 0); set(x, y, [176, 134, 84], 0, true); } // a seam down the cuff
      for (let u = -2; u < 14; u += 3) { const [x, y] = at(u, -9); set(x, y, [176, 134, 84], 0, true); }
    };
    glove(44, 30, 0.35, 411, 1);
    glove(54, 50, -0.25, 412, -1);
  });
}

/** An Army message pad, half used: printed heading, pencilled spotting notes, the torn stubs at the top. */
export function messagePad(): Px {
  return toned(62, 80, (set) => {
    for (let y = 0; y < 80; y++) for (let x = 0; x < 62; x++) {
      const e = Math.min(x, y, 61 - x, 79 - y);
      set(x, y, y < 8 ? [100, 104, 72] : PAPER, y < 8 ? (y < 2 ? 12 : 0) : e < 1 ? -12 : (fbm(421, x / 8, y / 8, 2) - 0.5) * 8 + (y > 12 && (y - 12) % 6 === 0 ? -8 : 0), y < 8 || e < 1);
    }
    for (let x = 0; x < 62; x += 3) set(x, 8, CREAM, 6, true); // the torn stubs
    letters(set, centre(62, 'MESSAGE'), 2, 'MESSAGE', CREAM, 0);
    const notes = ['B4 B4', 'C2 OK', 'Z11 W', 'MG AT', 'H 2 3', 'LL 6'];
    notes.forEach((s, i) => letters(set, 4, 13 + i * 6, s, [96, 92, 88], 0));
  });
}

/** A KLG sparking plug, out of the engine for cleaning: the brown porcelain, the hex, the sooted points. */
export function sparkPlug(): Px {
  return toned(46, 14, (set) => {
    rod(set, 2, 7, 22, 7, 4, (_t, _a, s) => [[150, 96, 60], s * 22 + 4, true]); // the porcelain
    for (let x = 0; x < 3; x++) for (let y = 5; y < 10; y++) set(x, y, STEEL, 8, true); // the terminal
    for (let x = 22; x < 30; x++) for (let y = 0; y < 14; y++) set(x, y, STEEL, y < 4 ? 18 : y > 10 ? -14 : 0, true); // the hex
    rod(set, 30, 7, 40, 7, 3, (t, _a, s) => [STEEL, s * 18 + (Math.floor(t * 12) % 2 ? -10 : 0), true]); // the thread
    rod(set, 40, 7, 45, 7, 1.4, (_t, _a, s) => [CHAR, s * 8, true]); // sooted points
    letters(set, 6, 5, 'KLG', [236, 220, 190], 0);
  });
}

/** A spanner from the rigger's roll: forged steel, an open jaw at each end, the size struck in it, oily. */
export function spanner(): Px {
  return toned(86, 24, (set) => {
    rod(set, 16, 12, 70, 12, 3.4, (t, _a, s) => [STEEL, s * 22 + (valueNoise(431, t * 30, 0) > 0.75 ? -10 : 0), false]);
    for (const [cx, dir] of [[10, -1], [76, 1]] as const) blob(set, cx, 12, 10, 10, 0, (d, nx, ny, x, y) => {
      const ox = (x + 0.5 - cx) * dir, oy = y + 0.5 - 12;
      if (ox > -2 && Math.abs(oy) < 4.2) return null; // the jaw: a slot open to the end
      return [STEEL, lit(nx, ny) * 20 * d + 4 + (Math.abs(Math.abs(oy) - 4.6) < 0.8 && ox > -2 ? -10 : 0), false];
    });
    letters(set, 33, 10, '7/16', [74, 74, 70], 0);
  });
}

/** A candle end stuck in an enamel saucer by its own wax: a blue rim, chipped to black iron; the stub, its
 * melted cup and black wick; drips run out and gone hard on the saucer. */
export function candle(): Px {
  return toned(42, 42, (set) => {
    blob(set, 21, 21, 20, 20, 0, (d, nx, ny, x, y) => {
      if (d > 0.9) return fbm(440, x / 3, y / 3, 2) > 0.72 ? [[44, 42, 44], 0, true] : [[52, 76, 122], lit(nx, ny) * 16, true]; // the blue rim, chipped
      return [[226, 226, 218], (d > 0.78 ? -lit(nx, ny) * 8 : 0) + (fbm(441, x / 7, y / 7, 2) - 0.5) * 8, false]; // the white enamel well
    });
    for (let k = 0; k < 7; k++) { const a = hash(442, k, 1) * 6.283, r = 8 + hash(442, k, 2) * 4; rod(set, 21 + Math.cos(a) * 7, 21 + Math.sin(a) * 7, 21 + Math.cos(a) * r, 21 + Math.sin(a) * r, 1.6, (_t, _a2, sh) => [[238, 226, 192], sh * 10, true]); } // drips
    blob(set, 21, 21, 7.5, 7.5, 0, (d, nx, ny) => (d > 0.6 ? [[244, 234, 204], lit(nx, ny) * 14, true] : [[214, 198, 156], -lit(nx, ny) * 8 - 4, true])); // the stub, its melted cup
    set(21, 21, CHAR, 0, true); set(22, 20, CHAR, 0, true); set(20, 21, [120, 100, 80], 0, true);
  });
}

/** A square of aeroplane linen cut from a wreck as a keepsake: doped cream fabric, part of a roundel, a tear
 * and a bullet hole, the ragged cut edges. */
export function fabricPatch(): Px {
  return toned(54, 44, (set, has) => {
    for (let y = 0; y < 44; y++) for (let x = 0; x < 54; x++) {
      const edge = Math.min(x, y, 53 - x, 43 - y) - (valueNoise(451, (x + y) / 2, 0) * 3);
      if (edge < 0) continue;
      const r = Math.hypot(x - 54, y - 44); // the roundel's rings, centred off the corner
      const c: RGB = r < 14 ? [176, 46, 38] : r < 24 ? [226, 220, 204] : r < 34 ? [44, 64, 112] : [204, 194, 164];
      set(x, y, c, ((x + y) % 2 ? 3 : -3) + (fbm(452, x / 9, y / 9, 2) - 0.5) * 12 + (edge < 1.5 ? -10 : 0));
    }
    for (let y = 13; y < 20; y++) for (let x = 17; x < 24; x++) if (Math.hypot(x + 0.5 - 20, y + 0.5 - 16.5) < 2.6 && has(x, y)) set(x, y, CHAR, 0, true); // the bullet hole
    for (let k = 0; k < 10; k++) set(8 + k, 30 + k * 0.4, CHAR, 0, true); // a tear
  });
}

/** A greasy rag dropped in a heap: cotton waste, folded over on itself in ridges (lit on the top-left side of
 * each, shaded on the other), threads frayed at its edge, blotched with oil. */
export function rag(): Px {
  return toned(66, 48, (set, has) => {
    blob(set, 33, 24, 31, 21, 0.25, (d, _nx, _ny, x, y) => {
      if (d > 0.8 + (valueNoise(461, x / 5, y / 5) - 0.5) * 0.45) return null;
      const f = fbm(462, x / 14, y / 10, 2) * 9 + x / 9 + y / 14; // the folds run in ridges across it
      const ridge = Math.sin(f * 2.2), slope = Math.cos(f * 2.2);
      const oil = fbm(463, x / 7, y / 7, 3);
      const col: RGB = oil > 0.66 ? [92, 82, 66] : oil > 0.58 ? [142, 130, 108] : [196, 188, 166];
      return [col, ridge * 10 + slope * 12 + (d > 0.72 ? -6 : 0), false];
    });
    for (let k = 0; k < 18; k++) { // frayed threads
      const a = hash(464, k, 1) * 6.283, x0 = 33 + Math.cos(a) * 26, y0 = 24 + Math.sin(a) * 17;
      if (!has(x0, y0)) continue;
      for (let j = 1; j < 4 + hash(464, k, 2) * 4; j++) set(x0 + Math.cos(a) * j, y0 + Math.sin(a) * j, [184, 176, 154], -4, true);
    }
  });
}

/** A coil of twine, from the rigger's stores: loops of hemp, lit where each strand turns over. */
export function twine(): Px {
  return toned(34, 34, (set) => {
    for (let k = 0; k < 4; k++) blob(set, 17 + k * 0.6, 17 - k * 0.4, 15 - k * 2.6, 14 - k * 2.6, 0, (d, nx, ny, x, y) => (d > 0.7 ? [[176, 150, 104], lit(nx, ny) * 16 + ((x + y) % 3 ? 0 : -10), true] : null));
    rod(set, 28, 24, 33, 32, 1.2, (_t, _a, s) => [[176, 150, 104], s * 10, true]); // the loose end
  });
}

/** Clutter as the desk draws it: each kind's drawing, and how many of it lie about (the small things, more). */
export const CLUTTER: readonly { name: string; art: () => Px; count: number }[] = [
  { name: 'pad', art: messagePad, count: 1 },
  { name: 'gauntlets', art: gauntlets, count: 1 },
  { name: 'sideCap', art: sideCap, count: 1 },
  { name: 'postcard', art: postcard, count: 1 },
  { name: 'fabric', art: fabricPatch, count: 1 },
  { name: 'rag', art: rag, count: 1 },
  { name: 'newspaper', art: newspaper, count: 1 },
  { name: 'biscuit', art: biscuit, count: 1 },
  { name: 'paperBall', art: paperBall, count: 1 },
  { name: 'knife', art: pocketKnife, count: 1 },
  { name: 'flask', art: hipFlask, count: 1 },
  { name: 'ashtray', art: shellAshtray, count: 1 },
  { name: 'tin', art: tobaccoTin, count: 1 },
  { name: 'candle', art: candle, count: 1 },
  { name: 'pipe', art: pipe, count: 1 },
  { name: 'ink', art: inkBottle, count: 1 },
  { name: 'spanner', art: spanner, count: 1 },
  { name: 'twine', art: twine, count: 1 },
  { name: 'matches', art: matchbox, count: 1 },
  { name: 'plug', art: sparkPlug, count: 1 },
  { name: 'pencil', art: pencil, count: 1 },
  { name: 'pen', art: pen, count: 1 },
  { name: 'cartridge0', art: () => cartridge(0), count: 1 },
  { name: 'cartridge1', art: () => cartridge(1), count: 1 },
  ...[0, 1, 2, 3].map((n) => ({ name: `match${n}`, art: () => spentMatch(n), count: 1 })),
  ...[0, 1, 2].map((n) => ({ name: `end${n}`, art: () => cigaretteEnd(n), count: 1 })),
  ...[0, 1, 2, 3].map((n) => ({ name: `pin${n}`, art: drawingPin, count: 1 })),
];
