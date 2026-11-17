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

/** A colour pulled towards its own grey: `k` of its saturation left (print gone dull with age and handling). */
const mute = (c: RGB, k = 0.6): RGB => { const g = (c[0] + c[1] + c[2]) / 3; return [Math.round(g + (c[0] - g) * k), Math.round(g + (c[1] - g) * k), Math.round(g + (c[2] - g) * k)]; };
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

const BRASS: RGB = [186, 142, 62];
const CREAM: RGB = [226, 214, 176], PAPER: RGB = [206, 190, 148];
const ASH: RGB = [150, 146, 136], CHAR: RGB = [40, 32, 28];

/** A pencil, well used: a hexagonal barrel in green paint, from above showing three facets (the top and bottom
 * ones lit and shaded by which way they face, a lit ridge between), the paint worn off along the ridges and dented,
 * HB stamped in gold foil half rubbed away; one end whittled with a knife (the paint's edge scalloped where each
 * cut stopped, the cedar in facets, a short stub of graphite with a glint), the other cut flat, dented by teeth. Thin, so in whole
 * tones. `turn`: how it will lie, so its light still falls from the top-left of the screen. */
export function pencil(turn = 0): Px {
  const L = 114, H = 9, CY = 4.5, R = 3.5; // R: the barrel's half-width
  const PAINT: RGB = [62, 86, 64], CEDAR: RGB = [214, 182, 132], BARE: RGB = [170, 136, 88], LEAD: RGB = [70, 68, 66], FOIL: RGB = [196, 174, 96];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const PAINTED = 94, LEAD0 = 108, TIP = 112; // where the paint stops, where the lead begins, its tip
  return toned(L, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const a = (y + 0.5 - CY) / R; // −1 … 1 across the barrel
      const facet = a < -0.42 ? -1 : a > 0.42 ? 1 : 0; // top, middle, bottom facets as seen from above
      const face = facet ? litT(0, facet) * 22 : 0;
      const ridge = Math.abs(Math.abs(a) - 0.42) < 0.16; // the edges between the facets
      // The point: a taper whittled down to the lead, in uneven knife cuts.
      const cut = Math.floor((x + Math.abs(y - CY) * 1.6 + hash(301, Math.floor(x / 5), 0) * 3) / 5); // which knife cut
      const scallop = PAINTED + Math.round(Math.cos((a + hash(302, 0, Math.floor((a + 1) * 1.6)) ) * 3.1) * 2); // the paint's edge, one scallop per facet
      if (x >= scallop) {
        if (x > TIP) continue;
        const taper = x < LEAD0 ? 1 - ((x + 0.5 - scallop) / (LEAD0 - scallop)) * 0.68 : 0.32 - ((x + 0.5 - LEAD0) / (TIP + 1 - LEAD0)) * 0.18; // a short cone, then a stub of lead, a touch blunt
        if (Math.abs(a) > taper + 0.1) continue;
        if (x >= LEAD0) { set(x, y, LEAD, (a < 0 ? litT(0, -1) : litT(0, 1)) * 10 + (Math.abs(a) < 0.12 && x < L - 3 ? 10 : 0), true); continue; } // the graphite, its glint
        set(x, y, CEDAR, face * 0.6 + (cut % 2 ? 6 : -8) + (x > LEAD0 - 3 ? -12 : 0), true); // cedar, cut in facets; greyed by graphite at the tip
        continue;
      }
      if (Math.abs(a) > 1) continue;
      // The back: cut flat, a sliver of bare wood at its end, the paint dented by teeth just behind it.
      if (x === 0) { set(x, y, BARE, face * 0.7 - 4, true); continue; }
      if (x >= 2 && x <= 9 && (x === 3 || x === 6 || x === 8) && facet !== 0) { set(x, y, PAINT, face - 12, true); continue; } // tooth marks across the facets
      // The paint: worn off along the ridges in places, a few dents, the foil lettering half gone.
      const worn = ridge && valueNoise(305, x / 3, a < 0 ? 0 : 9) > 0.8; // only here and there, in short nicks
      if (worn) { set(x, y, CEDAR, face * 0.7 - 4, true); continue; }
      const dent = hash(306, Math.floor(x / 2), y) < 0.025 ? -10 : 0;
      set(x, y, PAINT, face + (ridge ? Math.max(0, litT(0, Math.sign(a))) * 18 : 0) + dent, true);
    }
    letters(set, 30, 2, 'HB', FOIL, 0);
    for (let k = 0; k < 6; k++) set(30 + hash(307, k, 1) * 7, 2 + hash(307, k, 2) * 5, PAINT, 0, true); // the foil rubbed off in places
  });
}

/** A fountain pen, uncapped, the cap pushed on over its end: blue celluloid (to go with the ink), marbled faintly
 * along its length, round and glossy, so shaded across (a bright stripe on the side towards the light, dark on the
 * far side, as the pencil's facets are); a gold clip and band on the cap; the black section; the gold nib, its slit
 * and breather hole, wet with blue-black ink at the tip. Thin, so in whole tones. `turn`: how it will lie. */
export function pen(turn = 0): Px {
  const L = 120, H = 12, CY = 5.5;
  const BLUE: RGB = mute([54, 84, 150], 0.75), BLACK_: RGB = [40, 38, 40], GOLD: RGB = mute([206, 168, 82], 0.8), INK: RGB = [26, 30, 46];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const up = litT(0, -1) >= litT(0, 1) ? -1 : 1; // which side of the pen (across it) faces the light
  /** The pen's radius along its length: the cap's rounded end, the cap, its band, the barrel, the section, the nib. */
  const radius = (x: number) => x < 3 ? 3.6 + x * 0.6 : x < 46 ? 5.4 : x < 86 ? 4.6 : x < 98 ? 4 - (x - 86) * 0.08 : 0;
  return toned(L, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const px = x + 0.5, py = y + 0.5, a = (py - CY) / Math.max(0.1, radius(px)); // −1 … 1 across
      if (px < 98) { // the round parts: shaded across like a glossy cylinder
        if (Math.abs(a) > 1) continue;
        const l = Math.sign(a) === up ? Math.abs(a) : -Math.abs(a); // towards the light +, away −
        const stripe = l > 0.35 && l < 0.7; // the gloss, a bright stripe
        const shade = Math.abs(a) > 0.85 ? (l > 0 ? 4 : -22) : stripe ? 22 : l < -0.3 ? -12 : 0;
        const part = px < 46 ? 'cap' : px < 86 ? 'barrel' : 'section';
        const band = part === 'cap' && px > 40 && px < 44; // the cap's gold band
        const marble = part !== 'section' && valueNoise(301, px / 6, a * 2) > 0.7 ? -8 : 0;
        set(x, y, band ? GOLD : part === 'section' ? BLACK_ : BLUE, shade + (band ? 0 : marble) + (px < 1.5 ? -8 : 0), true);
        continue;
      }
      // The nib: gold, tapering to its point, with its slit down the middle and the breather hole; inky at the tip.
      const t = (px - 98) / (L - 98), half = 3.4 * (1 - t) ** 1.3; // a shoulder, then a long point
      if (Math.abs(py - CY) > half + 0.2) continue;
      const slit = Math.abs(py - CY) < 0.5 && t > 0.42 && t < 0.62, hole = Math.hypot(px - 105, py - CY) < 1;
      const inky = t > 0.6 + (hash(302, x, y) - 0.5) * 0.1; // the point, dipped: blue-black ink
      set(x, y, hole || slit ? BLACK_ : inky ? INK : GOLD, hole || slit ? 0 : inky ? (Math.sign(py - CY) === up ? 18 : 0) : Math.sign(py - CY) === up ? 14 : -10, true); // (the wet ink catches the light on its lit side)
    }
    // The clip along the cap, on the side towards the light, a ball at its end.
    const cy = Math.round(CY + up * 2.6);
    for (let x = 8; x < 38; x++) set(x, cy, GOLD, x === 8 || x === 37 ? -6 : 10, true);
    set(8, cy - up, GOLD, -6, true); set(37, cy + up, GOLD, 4, true);
    set(L - 1, Math.round(CY), INK, 10, true); // a bead of ink on the point
  });
}

/** A 2 oz tin of Player's Navy Cut from above, carried in a pocket for a year: the bare tin's edge lit on the
 * top-left and dark on the bottom-right as the desk's metal is, the lid's rolled rim inside it; the lid printed
 * flat (no light on print): navy, a gold double border, PLAYER'S and NAVY CUT in cream, the bearded sailor in his
 * lifebuoy, red and white. The paint rubbed through to the tin at the corners and along the edges, scratched,
 * a dent, the hinge's knuckles along one side. `turn`: how it will lie, so its light still falls top-left. */
export function tobaccoTin(turn = 0): Px {
  const W = 80, H = 56, RC = 6, CX = 40, CY = 27; // RC: the corners' radius; the lifebuoy's centre
  const NAVY: RGB = mute([40, 52, 88]), GOLD: RGB = mute([196, 164, 84]), CREAMP: RGB = mute([226, 214, 178]), RED: RGB = mute([168, 44, 36]), WHITE: RGB = mute([228, 224, 212]);
  const SKIN: RGB = mute([214, 168, 128]), BEARD: RGB = mute([92, 64, 44]), TIN: RGB = [0x9c, 0x98, 0x82], LITM_: RGB = [0xe2, 0xe0, 0xd6], DARKM_: RGB = [0x56, 0x54, 0x49];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  /** How far in from the tin's rounded edge (x, y) is, and the edge's outward normal there. */
  const inner = (x: number, y: number) => {
    const qx = Math.max(RC - (x + 0.5), 0, x + 0.5 - (W - RC)), qy = Math.max(RC - (y + 0.5), 0, y + 0.5 - (H - RC));
    if (qx > 0 && qy > 0) { const d = Math.hypot(qx, qy); return { e: RC - d, nx: (x + 0.5 < W / 2 ? -qx : qx) / d, ny: (y + 0.5 < H / 2 ? -qy : qy) / d }; }
    const ex = Math.min(x + 0.5, W - x - 0.5), ey = Math.min(y + 0.5, H - y - 0.5);
    return ex < ey ? { e: ex, nx: x + 0.5 < W / 2 ? -1 : 1, ny: 0 } : { e: ey, nx: 0, ny: y + 0.5 < H / 2 ? -1 : 1 };
  };
  return toned(W, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const { e, nx, ny } = inner(x, y);
      if (e <= 0) continue;
      const l = litT(nx, ny);
      // Worn through to the tin: at the corners and along the edges where it rubs in a pocket, and in a few scratches.
      const near = Math.min(x, W - 1 - x, y, H - 1 - y);
      const corner = Math.hypot(Math.min(x, W - 1 - x), Math.min(y, H - 1 - y)); // how far from the nearest corner
      const rubbed = (corner < 10 && fbm(311, x / 3, y / 3, 2) > 0.44 + corner * 0.025) || (near < 4 && fbm(314, x / 2, y / 2, 2) > 0.74); // worn at the corners, a few rubs along the edges
      const dent = Math.hypot(x + 0.5 - 62, y + 0.5 - 38) < 3.2 ? -litT((x + 0.5 - 62) / 3.2, (y + 0.5 - 38) / 3.2) * 10 : 0; // a dent: lit on its far side
      if (e < 1.2) { set(x, y, l > 0.35 ? LITM_ : l < -0.35 ? DARKM_ : TIN, l > 0.35 || l < -0.35 ? 0 : -4, true); continue; } // the tin's very edge
      if (e < 3.4) { set(x, y, rubbed ? TIN : NAVY, (l > 0.3 ? 12 : l < -0.3 ? -14 : 0) + (rubbed ? 4 : 0), true); continue; } // the rolled rim of the lid
      if (y < 5 && x % 6 === 2) { set(x, y, TIN, -6, true); continue; } // the hinge's knuckles, along the back
      // The print: navy ground, a gold double border, the lifebuoy, the lettering (on top, below).
      const ix = Math.min(x - 4, W - 5 - x), iy = Math.min(y - 4, H - 5 - y);
      const border = ix === 1 || iy === 1 || ix === 3 || iy === 3;
      const r = Math.hypot(x + 0.5 - CX, y + 0.5 - CY), seg = Math.floor(((Math.atan2(y + 0.5 - CY, x + 0.5 - CX) + Math.PI) / (Math.PI * 2)) * 8);
      let c: RGB = NAVY;
      if (border && ix >= 1 && iy >= 1) c = GOLD;
      if (r < 13.5 && r >= 10) c = seg % 2 ? RED : WHITE; // the lifebuoy
      else if (r < 10) { // the sailor, in the ring: sky behind; his white cap with its band, face, full beard, a blue collar
        const fx = x + 0.5 - CX, fy = y + 0.5 - CY, face = Math.hypot(fx / 4.2, (fy + 0.2) / 5) < 1;
        c = mute([126, 150, 170]);
        if (fy > 5.2) c = NAVY; // his jumper and collar
        else if (fy < -4 && Math.abs(fx) < 5.2 - (fy < -6 ? 1.5 : 0)) c = WHITE; // the cap's crown
        else if (fy >= -4 && fy < -3 && Math.abs(fx) < 5) c = NAVY; // its band
        else if (face) c = fy > 0.6 ? BEARD : SKIN; // beard over the lower half
        if (face && fy > -2.2 && fy < -1.2 && Math.abs(Math.abs(fx) - 1.6) < 0.5) c = BEARD; // his eyes
        if (fy > 0.2 && fy < 1 && Math.abs(fx) < 2.2) c = mute([70, 48, 34]); // the moustache
      }
      if (rubbed) c = TIN;
      const scratch = valueNoise(312, (x + y * 0.4) / 1.2, Math.floor((y - x * 0.3) / 7)) > 0.93; // fine scratches, one way
      set(x, y, c, dent + (rubbed ? 4 : 0) + (scratch ? 8 : 0) + (c === NAVY ? (fbm(313, x / 8, y / 8, 2) - 0.5) * 4 : 0), true);
    }
    letters(set, CX - Math.floor(textWidth("PLAYER'S") / 2), 9, "PLAYER'S", CREAMP, 0);
    letters(set, CX - Math.floor(textWidth('NAVY CUT') / 2), 41, 'NAVY CUT', CREAMP, 0);
  });
}

/** A box of Swan Vestas from above, a little the worse for a pocket: the printed label on the sleeve (a white swan
 * in a blue oval, the name in blue, a blue rule round it), scuffed pale at the corners and creased across; the
 * sleeve's edges lit on the top-left and dark on the bottom-right, as the desk's cards are; the tray pushed half
 * out, a row of matches in it with their red heads, the sleeve's edge casting a hard shadow into it.
 * `turn`: how it will lie, so its light still falls from the top-left of the screen. */
export function matchbox(turn = 0): Px {
  const W = 60, H = 34, SX1 = 48, TX1 = 59, TY0 = 3, TY1 = 30; // the sleeve ends at x 48; the tray, out to 59
  const LABEL: RGB = mute([214, 188, 112]), BLUE: RGB = mute([44, 70, 120]), SWAN: RGB = mute([236, 232, 222]), TRAY: RGB = mute([176, 146, 96]);
  const STICK: RGB = mute([222, 194, 140]), HEAD: RGB = mute([150, 44, 32]);
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const TLx = -(lc + ls) / Math.SQRT2, TLy = (ls - lc) / Math.SQRT2; // towards the screen's top-left, in the drawing
  const inSleeve = (x: number, y: number) => x >= 0 && x < SX1 && y >= 1 && y < H - 1;
  /** An edge pixel's tone: one step up where its side faces the light, two down where it faces away. */
  const edge = (nx: number, ny: number) => { const l = litT(nx, ny); return l > 0.3 ? 8 : l < -0.3 ? -14 : -3; };
  return toned(W, H, (set) => {
    // The tray, pushed out: its card walls, the floor in the sleeve's shadow, the matches lying in it.
    for (let y = TY0; y < TY1; y++) for (let x = SX1; x <= TX1; x++) {
      const wall = y === TY0 ? [0, -1] : y === TY1 - 1 ? [0, 1] : x === TX1 ? [1, 0] : null;
      if (wall) { set(x, y, TRAY, edge(wall[0], wall[1]), true); continue; }
      const shade = inSleeve(Math.floor(x + TLx * 3), Math.floor(y + TLy * 3)) ? -18 : 0; // the sleeve's hard shadow
      const m = (y - TY0 - 1) % 3; // the matches, side by side: stick, stick, the gap between
      if (m === 2 || y >= TY1 - 2) { set(x, y, TRAY, shade - 10, true); continue; }
      const head = x >= TX1 - 4 - ((y >> 2) % 2); // their heads, all at the open end, not quite in line
      set(x, y, head ? HEAD : STICK, shade + (m === 0 ? litT(0, -1) * 8 : litT(0, 1) * 8) + (head && x === TX1 - 2 && m === 0 ? 10 : 0), true);
    }
    // The sleeve: the label printed on it, its edges, the wear.
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < SX1; x++) {
      const e = Math.min(x, y - 1, SX1 - 1 - x, H - 2 - y);
      const corner = Math.hypot(Math.max(0, 2 - Math.min(x, SX1 - 1 - x)), Math.max(0, 2 - Math.min(y - 1, H - 2 - y))) > 1.8;
      if (corner) continue;
      if (e < 1) { set(x, y, LABEL, edge(x === 0 ? -1 : x === SX1 - 1 ? 1 : 0, y === 1 ? -1 : y === H - 2 ? 1 : 0) - 4, true); continue; }
      const scuff = fbm(321, x / 3, y / 3, 2) > 0.62 && (Math.min(x, SX1 - 1 - x) < 7 || Math.min(y, H - 1 - y) < 5); // rubbed pale near the edges
      const crease = Math.abs(x - 30 - (y - 17) * 0.3) < 0.6 ? -8 : 0; // a crease across the label
      const rule = e === 2 || (Math.hypot((x + 0.5 - 24) / 11, (y + 0.5 - 12) / 7.5) | 0) === 1 && Math.hypot((x + 0.5 - 24) / 11, (y + 0.5 - 12) / 7.5) < 1.13; // the blue rule, the oval's ring
      const oval = Math.hypot((x + 0.5 - 24) / 11, (y + 0.5 - 12) / 7.5) < 1;
      if (rule) { const worn = scuff && hash(323, x, y) < 0.3; set(x, y, worn ? LABEL : BLUE, worn ? 6 : crease, true); continue; } // rubbed through here and there
      set(x, y, oval ? BLUE : LABEL, (scuff ? 8 : 0) + crease + (oval ? 0 : (fbm(322, x / 6, y / 6, 2) - 0.5) * 6), oval);
    }
    // The swan on the oval: its body, the curve of its neck, its head and orange beak.
    blob(set, 22, 14, 6, 2.6, 0, (_d, nx, ny) => [SWAN, lit(nx, ny) > 0.5 ? 4 : lit(nx, ny) < -0.5 ? -8 : 0, true]);
    for (const [x, y] of [[17, 13], [16, 12], [16, 11], [16, 10], [17, 9], [18, 9]]) set(x, y, SWAN, 0, true); // the neck, curving up and over at the front
    set(19, 9, mute([210, 120, 40]), 0, true); // the beak
    set(27, 13, SWAN, 4, true); set(28, 12, SWAN, 4, true); // the tail, cocked up
    letters(set, 24 - Math.floor(textWidth('SWAN') / 2), 21, 'SWAN', BLUE, 0);
  });
}

/** A spent match: a pale wooden stick, burnt brown and then black towards the end, the head a black knob, the
 * charred end bent where it curled in the flame. Round, so shaded across. `turn`: how it will lie. */
export function spentMatch(n = 0, turn = 0): Px {
  const L = 26, H = 7, CY = 3.5, lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2;
  const up = litT(0, -1) >= litT(0, 1) ? -1 : 1, bend = (hash(331, n, 1) - 0.5) * 2.4, burnt = 0.45 + hash(331, n, 2) * 0.3;
  const STICK: RGB = mute([214, 186, 134], 0.8), BROWN: RGB = [104, 78, 52];
  return toned(L, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < L - 3; x++) {
      const t = (x + 0.5) / (L - 3), cy = CY + (t > 0.7 ? ((t - 0.7) / 0.3) ** 2 * bend : 0), a = (y + 0.5 - cy) / (t > burnt ? 0.9 : 1.1);
      if (Math.abs(a) > 1) continue;
      const side = Math.sign(a) === up ? 1 : -1;
      set(x, y, t > burnt + 0.12 ? CHAR : t > burnt ? BROWN : STICK, side > 0 ? 8 : -8, true);
    }
    blob(set, L - 3, CY + bend, 2, 1.7, 0, (_d, nx, ny) => [CHAR, litT(nx, ny) > 0.3 ? 8 : -2, true]); // the head, burnt
  });
}

/** A cigarette end, put out: the white paper (its seam a faint line, shaded across), the stained mouth end showing
 * its tobacco, the other end pinched and charred, a curl of ash on it. `turn`: how it will lie. */
export function cigaretteEnd(n = 0, turn = 0): Px {
  const L = 18, H = 7, CY = 3.5, lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2;
  const up = litT(0, -1) >= litT(0, 1) ? -1 : 1, len = 11 + Math.round(hash(341, n, 1) * 4);
  const PAPER_: RGB = mute([234, 228, 214], 0.8), STAIN: RGB = mute([196, 164, 112], 0.8), TOBACCO: RGB = mute([118, 80, 44], 0.8), FLAKE: RGB = [198, 194, 184];
  return toned(L, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < len; x++) {
      const t = (x + 0.5) / len, r = 2.3 * (0.6 + 0.4 * Math.min(1, (1 - t) / 0.25)), a = (y + 0.5 - CY) / r; // pinched at the burnt end
      if (Math.abs(a) > 1) continue;
      const side = Math.sign(a) === up ? 1 : -1, rag = hash(342, n * 31 + x, y);
      if (t > 0.9 + rag * 0.06) { set(x, y, rag < 0.4 ? FLAKE : ASH, 0, true); continue; } // ash on the tip
      if (t > 0.8 + rag * 0.05) { set(x, y, CHAR, 0, true); continue; } // the charred ring
      if (x === 0) { set(x, y, Math.abs(a) < 0.5 ? TOBACCO : STAIN, -4, true); continue; } // the mouth end, its tobacco
      const seam = Math.abs(a - 0.35 * up) < 0.2;
      set(x, y, t < 0.22 ? STAIN : PAPER_, (side > 0 ? 4 : -12) + (seam ? -6 : 0) + (t > 0.7 ? -6 : 0), true);
    }
  });
}

/** An ashtray cut from the base of an 18-pounder shell case (trench art), from above, well used. The case's cut
 * rim in brass, shaded as the desk's metal is (its outer edge lit on the top-left and dark on the bottom-right, the
 * cut top in whole tones, the inside wall lit on its far side); the floor dull brass, with the rim's shadow cast
 * hard across it on the lit side, as the desk's own shadows are. In it: a heap of ash and a smaller one, flaked
 * pale and dark with cinders, dust spread over the floor, a spent match, and five cigarette ends (seamed paper,
 * the burnt end pinched and charred, the mouth end stained and showing its tobacco), one bent where it was
 * stubbed out, one left across the rim; each casts its own small shadow. A little bigger than the mug.
 * `turn`: how it will lie, so its light still falls from the top-left of the screen. */
export function shellAshtray(turn = 0): Px {
  const W = 98, H = 84, C = 40, CY = 42, R = 39, RIN = R - 5.5; // the case's outside radius; its inside wall
  const BRIGHT: RGB = [236, 204, 128], DARKB: RGB = [112, 80, 36], FLOOR: RGB = [116, 86, 44], PAPER_: RGB = [234, 228, 214];
  const STAIN: RGB = [196, 164, 112], TOBACCO: RGB = [118, 80, 44], FLAKE: RGB = [198, 194, 184], CINDER: RGB = [74, 68, 62];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const TLx = -(lc + ls) / Math.SQRT2, TLy = (ls - lc) / Math.SQRT2; // towards the screen's top-left, in the drawing
  // The cigarette ends, as polylines (from the burnt end) so one can be bent; r = the paper's radius.
  const ends = [
    { p: [[34, 44], [47, 37]], r: 2.3, salt: 1 }, // stubbed out in the heap
    { p: [[36, 58], [42, 60], [50, 57]], r: 2.3, salt: 2 }, // bent, crushed out
    { p: [[24, 30], [37, 31]], r: 2.2, salt: 3 },
    { p: [[52, 24], [58, 33]], r: 2.1, salt: 4 }, // a short one, smoked down
    { p: [[50, 46], [77, 54]], r: 2.4, salt: 5 }, // left resting on the rim, its mouth end just over the edge
  ];
  /** Where (x, y) falls on a cigarette end: its along (0 at the burnt end … 1), across (−1 … 1), or null. */
  const onEnd = (x: number, y: number) => {
    for (const e of ends) {
      const segs = e.p.slice(1).map((q, i) => [e.p[i], q]), total = segs.reduce((q, [a, b]) => q + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
      let before = 0;
      for (const [a, b] of segs) {
        const vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(vx, vy), t = ((x - a[0]) * vx + (y - a[1]) * vy) / (L * L);
        const u = (before + Math.max(0, Math.min(1, t)) * L) / total;
        const r = e.r * (0.55 + 0.45 * Math.min(1, u / 0.3)); // pinched where it was stubbed out
        const across = ((x - a[0]) * -vy + (y - a[1]) * vx) / L / r;
        if (t >= -0.05 && t <= 1.05 && Math.abs(across) <= 1) return { e, u, across, nx: -vy / L, ny: vx / L };
        before += L;
      }
    }
    return null;
  };
  return toned(W, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, dx = px - C, dy = py - CY, r = Math.hypot(dx, dy);
      const end = onEnd(px, py);
      if (end) { // the paper: shaded across, its seam, the stained mouth end and its tobacco, the burnt end charred and ragged
        const { e, u, across, nx, ny } = end, l = litT(nx * Math.sign(across), ny * Math.sign(across)) * Math.abs(across);
        const rag = hash(360 + e.salt, x, y);
        if (u < 0.08 + rag * 0.05) { set(x, y, rag < 0.35 ? FLAKE : ASH, 0, true); continue; } // the ash still on its tip
        if (u < 0.17 + rag * 0.04) { set(x, y, CHAR, rag < 0.2 ? 6 : 0, true); continue; } // the charred ring, ragged
        if (u > 0.94) { set(x, y, Math.abs(across) < 0.5 ? TOBACCO : STAIN, -4, true); continue; } // the open end, its tobacco
        const seam = Math.abs(across - 0.35) < 0.22;
        set(x, y, u > 0.8 ? STAIN : PAPER_, (l > 0.45 ? 4 : l < -0.45 ? -14 : -2) + (seam ? -6 : 0) + (u < 0.24 ? -6 : 0), true); // (scorched near the burn)
        continue;
      }
      if (r > R) continue;
      const l = litT(dx / r, dy / r); // how the outward-facing side here faces the light
      if (r > R - 1.2) { set(x, y, l > 0.4 ? BRIGHT : l < -0.4 ? DARKB : BRASS, l > 0.4 || l < -0.4 ? 0 : -4, true); continue; } // the very edge
      if (r > R - 3) { set(x, y, BRASS, l > 0.3 ? 14 : l < -0.3 ? -16 : l > -0.05 ? 4 : -6, true); continue; } // the cut top of the case
      if (r > RIN) { set(x, y, BRASS, -l > 0.3 ? 8 : -l < -0.3 ? -22 : -10, true); continue; } // the inside wall: lit on its far side
      // The floor, and what lies on it, with hard shadows: the rim's (6 px deep), and each end's (1–2 px).
      const rim = Math.hypot(px + TLx * 6 - C, py + TLy * 6 - CY) > RIN;
      const under = !!onEnd(px + TLx * 1.6, py + TLy * 1.6);
      const shade = rim || under ? -26 : 0;
      const heap = Math.min(Math.hypot(dx - 2, (dy + 1) * 1.15) / 18, Math.hypot(dx + 14, dy - 12) / 8) + (valueNoise(352, px / 3, py / 3) - 0.5) * 0.35; // < 1: in a heap
      const g = hash(354, x, y);
      if (heap < 1) {
        const top = (1 - heap) * 12; // mounded: palest on top
        if (g < 0.05) set(x, y, CINDER, shade, true); // cinders and burnt shreds
        else if (g < 0.13) set(x, y, FLAKE, shade + (heap < 0.6 ? 2 : -4), true); // pale flakes
        else set(x, y, ASH, top - 6 + shade + (fbm(353, px / 4, py / 4, 2) - 0.5) * 10); // the ash, crumbly
        continue;
      }
      if (g < 0.008 + Math.max(0, 1.5 - heap) * 0.16) { set(x, y, g < 0.02 ? CINDER : ASH, shade - 2, true); continue; } // dust and specks spread over the floor
      set(x, y, FLOOR, shade - 4 + (fbm(351, px / 9, py / 9, 2) - 0.5) * 6 + (fbm(355, px / 5, py / 5, 2) > 0.66 ? -6 : 0)); // dull brass, sooted in patches
    }
    rod(set, 18, 50, 31, 57, 0.9, (t) => [t < 0.18 ? CHAR : [70, 54, 40], t < 0.18 ? 0 : -4, true]); // a spent match, burnt down its length
  });
}

/** Two .303 rounds lying together, from above: rimmed brass cases, round so shaded across as the pen is (a bright
 * stripe on the side towards the light, the far side dark, the very edge lit or dark by which way it faces), the
 * shoulder and neck, the cupro-nickel bullets pointed, the headstamp's primer ring at the base; a thumb's tarnish.
 * About 66 px long at the desk's scale. `turn`: how they will lie, so their light still falls from the top-left. */
export function cartridges(turn = 0): Px {
  const W = 72, H = 30;
  const CASE: RGB = mute([196, 156, 76], 0.8), CNI: RGB = mute([170, 166, 150], 0.8), TARN: RGB = mute([130, 96, 48], 0.8);
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  /** One round from (x0, y0) along angle `a`: its radius along its length (0 at the base … 66 at the point). */
  const radius = (u: number) => u < 1.6 ? 4.9 : u < 2.6 ? 4 : u < 44 ? 4.5 - u * 0.012 : u < 49 ? 3.95 - (u - 44) * 0.36 : u < 52 ? 2.2 : u < 66 ? 2.2 * Math.sqrt(Math.max(0, 1 - ((u - 52) / 14) ** 2.2)) : 0;
  const round = (set: Set, x0: number, y0: number, a: number, salt: number) => {
    const c = Math.cos(a), n = Math.sin(a), up = litT(-n, c) >= litT(n, -c) ? 1 : -1; // which side, across it, faces the light
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - x0, dy = y + 0.5 - y0, u = dx * c + dy * n, v = -dx * n + dy * c, r = radius(u);
      if (u < 0 || u >= 66 || Math.abs(v) > r) continue;
      const q = v / r, l = Math.sign(q) === up ? Math.abs(q) : -Math.abs(q); // towards the light +, away −
      const shade = Math.abs(q) > 0.8 ? (l > 0 ? 8 : -22) : l > 0.3 && l < 0.65 ? 18 : l < -0.3 ? -12 : 0;
      const bullet = u >= 50;
      const groove = u >= 1.6 && u < 2.6; // the extractor groove, behind the rim
      const crimp = Math.abs(u - 50) < 0.6; // the case's mouth crimped on the bullet
      const tarnish = !bullet && u > 8 && u < 40 && Math.abs(q) < 0.7 && valueNoise(360 + salt, u / 3, q * 2) > 0.82 && hash(361 + salt, x, y) < 0.6; // a thumb's tarnish, a few specks
      set(x, y, bullet ? CNI : tarnish ? TARN : CASE, shade + (groove || crimp ? -14 : 0) + (u < 1.6 && Math.abs(q) < 0.3 ? -10 : 0), true); // (the primer, at the base)
    }
  };
  return toned(W, H, (set) => {
    round(set, 2, 7, 0.03, 1);
    round(set, 5, 22, -0.06, 2); // the second, a little apart from the first, not quite in line
  });
}

/** A soldier's clasp knife, closed, from above: polished walnut scales (rounded, lit along the side towards the
 * light, the grain in long fine lines), two rivets and a little nickel shield set in them; nickel
 * bolsters at both ends in the desk's metal shading; the blade's steel back along one edge with its nail nick;
 * the lanyard shackle at the end. `turn`: how it will lie, so its light still falls from the top-left. */
export function pocketKnife(turn = 0): Px {
  const W = 96, H = 22, L = 84, CY = 10; // L: the knife's length (the shackle beyond it)
  const WOOD: RGB = mute([118, 80, 52], 0.8);
  const METAL: RGB = [0x9c, 0x98, 0x82], DARKM: RGB = [0x56, 0x54, 0x49], LITM: RGB = [0xe2, 0xe0, 0xd6], GLINT: RGB = [0xf2, 0xee, 0xe2];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const top = (x: number) => CY - 6.5 + ((x - L / 2) / (L / 2)) ** 2 * 1.2; // the back: nearly straight
  const bot = (x: number) => CY + 7.5 - ((x - L / 2) / (L / 2)) ** 2 * 3.2; // the belly: rounder
  return toned(W, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const px = x + 0.5, py = y + 0.5, t = top(px), b = bot(px);
      const endR = Math.min(px, L - px); // rounded ends
      const half = (b - t) / 2, mid = (t + b) / 2, round = endR < half ? Math.sqrt(Math.max(0, half * half - (half - endR) ** 2)) : half;
      if (Math.abs(py - mid) > round) continue;
      const e = Math.min(round - Math.abs(py - mid), endR); // px in from the edge
      const nx = endR < half ? (px < L / 2 ? -1 : 1) * (half - endR) / half : 0, ny = Math.sign(py - mid) * (1 - Math.abs(nx));
      const l = litT(nx, ny);
      const bolster = px < 13 || px > L - 11;
      if (bolster) { // nickel: the very edge lit or dark, a step in, the flat dithered; the bolster's end against the horn
        if (e < 1.2) set(x, y, l > 0.35 ? LITM : l < -0.35 ? DARKM : METAL, l > 0.35 || l < -0.35 ? 0 : -4, true);
        else if (Math.abs(px - 13) < 1 || Math.abs(px - (L - 11)) < 1) set(x, y, METAL, litT(px < L / 2 ? 1 : -1, 0) * 14, true);
        else set(x, y, METAL, e < 2.6 ? (l > 0.3 ? 14 : l < -0.3 ? -16 : 0) : litT(0, (py - mid) / half) * 6 + 4, e < 2.6);
        continue;
      }
      if (py < t + 1.6) { set(x, y, py < t + 0.8 ? [150, 150, 142] : [96, 96, 90], (litT(0, -1) > 0 ? 6 : -6) + (Math.abs(px - 22) < 1.5 ? -24 : 0), true); continue; } // the blade's steel back: a bright edge, a dark one; its nail nick
      // The wooden scales: polished walnut, rounded across (lit along the side towards the light, a soft sheen,
      // darker towards the far edge), the grain in long fine lines running its length, gently wavering.
      const q = (py - mid) / half, side = Math.sign(q) === (litT(0, -1) >= litT(0, 1) ? -1 : 1) ? Math.abs(q) : -Math.abs(q);
      const grain = Math.sin((py + (fbm(493, px / 24, 0, 2) - 0.5) * 6) * 1.9) > 0.86 ? -6 : 0; // a fine darker line every few px
      const sheen = side > 0.25 && side < 0.6 ? 8 : 0;
      set(x, y, WOOD, (side > 0 ? side * 6 : side * 12) + sheen + grain + (fbm(494, px / 18, py / 6, 2) - 0.5) * 4 + (e < 1.5 ? (l > 0.3 ? 4 : l < -0.3 ? -12 : -2) : 0), true);
    }
    // Two rivets and the shield: nickel, a glint on the lit corner.
    const lit = (dx: number, dy: number) => litT(dx, dy) > 0.3;
    for (const rx of [19, L - 17]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(rx + dx, CY + dy, lit(-1 + dx * 2, -1 + dy * 2) ? GLINT : !lit(1 - dx * 2, 1 - dy * 2) ? METAL : DARKM, 0, true);
    for (let y = CY - 1; y <= CY + 2; y++) for (let x = 38; x <= 47; x++) {
      const d = Math.hypot((x + 0.5 - 42.5) / 5, (y + 0.5 - (CY + 0.5)) / 2);
      if (d > 1) continue;
      set(x, y, d > 0.7 ? (litT((x + 0.5 - 42.5) / 5, (y - CY) / 2) > 0.2 ? LITM : DARKM) : METAL, 2, true);
    }
    // The shackle: a nickel ring through the end bolster, the desk showing through it.
    for (let y = 0; y < H; y++) for (let x = L - 2; x < W; x++) {
      const dx = x + 0.5 - (L + 4.5), dy = y + 0.5 - CY, r = Math.hypot(dx, dy);
      if (r < 3.2 || r > 5.4 || x < L - 1) continue;
      const ln = litT(dx / r, dy / r);
      set(x, y, r > 4.6 ? (ln > 0.35 ? LITM : ln < -0.35 ? DARKM : METAL) : (-ln > 0.3 ? METAL : DARKM), 0, true);
    }
  });
}

/** A square bottle of Stephens' blue-black ink from above: thick glass, its edges lit on the top-left and dark on
 * the bottom-right, the ink near black inside it and blue where the glass is thin, the window's glint on the
 * shoulder; the round neck, a cork pushed into it, stained with ink, and a dried run of ink down the shoulder.
 * `turn`: how it will lie, so its light still falls from the top-left of the screen. */
export function inkBottle(turn = 0): Px {
  const S = 46, C = 23, RC = 7, NECK = 10, CORK = 7; // the bottle's side, its corners' radius; the neck's and cork's radii
  const GLASS: RGB = [150, 168, 166], INK: RGB = [24, 30, 48], THIN: RGB = mute([52, 70, 104]), CORKC: RGB = [158, 120, 80];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const TLx = -(lc + ls) / Math.SQRT2, TLy = (ls - lc) / Math.SQRT2; // towards the screen's top-left, in the drawing
  return toned(S, S, (set) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5, dx = px - C, dy = py - C, r = Math.hypot(dx, dy);
      // How far in from the bottle's rounded square edge, and which way that edge faces.
      const qx = Math.max(Math.abs(dx) - (C - RC), 0), qy = Math.max(Math.abs(dy) - (C - RC), 0), corner = qx > 0 && qy > 0;
      const e = corner ? RC - Math.hypot(qx, qy) : C - Math.max(Math.abs(dx), Math.abs(dy));
      if (e <= 0) continue;
      const nx = corner ? Math.sign(dx) * qx / Math.hypot(qx, qy) : Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, ny = corner ? Math.sign(dy) * qy / Math.hypot(qx, qy) : Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy);
      const l = litT(nx, ny);
      if (r < CORK) { // the cork: its grain, its top lit gently, ink soaked into one side
        const stain = Math.hypot(dx - 2.2, dy - 2.4) < 2.4 + (valueNoise(371, px, py) - 0.5) * 1.2; // a blot of ink soaked in
        set(x, y, stain ? INK : CORKC, stain ? 4 : litT(dx / CORK, dy / CORK) * (r > CORK - 1.2 ? 12 : 4) + (hash(372, x, y) < 0.18 ? -10 : 0) + (fbm(373, px / 2, py / 2, 2) - 0.5) * 8, true);
        continue;
      }
      if (r < NECK) { // the neck's glass lip round it: lit where it faces the light, the cork's shadow inside on the far side
        const out = r > NECK - 1.4, ln = litT(dx / r, dy / r);
        set(x, y, out ? GLASS : THIN, out ? (ln > 0.35 ? 16 : ln < -0.35 ? -16 : 0) : (-ln > 0.3 ? 6 : -10), true);
        continue;
      }
      if (e < 1.2) { set(x, y, l < -0.35 ? THIN : GLASS, l > 0.35 ? 20 : l < -0.35 ? -8 : -2, true); continue; } // the glass's very edge: bright where it faces the light, gone dark on the far side
      if (e < 3.2) { set(x, y, THIN, l > 0.3 ? 12 : l < -0.3 ? -10 : 0, true); continue; } // thick glass: the ink shows blue through it
      // The shoulder: ink seen through the glass, darkest in the middle; the window's glint; a dried run of ink.
      // The shoulder slopes up from the edge to the neck, so it catches the light on the side facing it: lit there,
      // darker on the far side, most where it curves up into the neck.
      const up = Math.max(0, 1 - (r - NECK) / 8), slope = litT(dx / r, dy / r);
      const toward = (dx * TLx + dy * TLy) / r; // 1: this side of the neck faces the light
      if (toward > 0.97 && r > NECK + 1.2 && r < NECK + 2.6) { set(x, y, [232, 236, 232], 0, true); continue; } // the window's glint, where the shoulder turns up: a few pixels
      if (toward > 0.9 && r > NECK + 0.8 && r < NECK + 3.2) { set(x, y, GLASS, 4, true); continue; } // and the paler glass round it
      const run = Math.abs(dx - 4 - Math.sin(dy / 3) * 0.8) < 1 && dy > NECK - 2 && dy < 18;
      set(x, y, run ? INK : THIN, run ? -6 : -12 + slope * (6 + up * 12) - Math.min(8, (C - e) * 0.4) + (fbm(374, px / 7, py / 7, 2) - 0.5) * 6);
    }
  });
}

/** A picture postcard face up: the Cloth Hall at Ypres as on the cards sold before the war (Les Halles), the
 * caption printed across the sky; the card handled and creased, a corner bent up. */
export function postcard(): Px {
  const W = 104, H = 70, F = 12; // F: how big the bent-up corner is
  const PX = 4, PY = 4, PW = 96, PH = 58; // the picture
  return toned(W, H, (set) => {
    const SEPIA_LIGHT: RGB = [184, 182, 174], STONE: RGB = [128, 126, 119], SLATE: RGB = [77, 76, 72], DARKW: RGB = [50, 49, 47], STREET: RGB = [95, 94, 88], BORDER: RGB = [198, 196, 187], FLAP: RGB = [176, 173, 166];
    const HZ = 48; // the foot of the building: the square begins
    /** A spire: a narrow slate cone from `top` to `base`, `half` wide at its foot, shaded on its right. */
    const spire = (px: number, py: number, cx: number, top: number, base: number, half: number): [RGB, number] | null =>
      py >= top && py < base && Math.abs(px + 0.5 - cx) <= ((py - top + 0.5) / (base - top)) * half ? [SLATE, px + 0.5 > cx ? -6 : 2] : null;
    const photo = (px: number, py: number): [RGB, number] => { // the picture, in its own coordinates (96 × 58)
      const grain = (hash(381, px, py) - 0.5) * 3;
      const e = Math.min(px, py, PW - 1 - px, PH - 1 - py), vig = -Math.max(0, 7 - e) * 1.4; // darker towards the edges, as a print is
      const stone = (v: number): [RGB, number] => [STONE, v + (fbm(383, px / 3, py / 3, 2) - 0.5) * 3 + grain + vig];
      // The belfry, left of centre: a square tower, its louvred openings, a pinnacle at each corner, its spire.
      const s0 = spire(px, py, 22.5, 8, 17, 2.4) ?? spire(px, py, 16.5, 12, 17, 0.9) ?? spire(px, py, 28.5, 12, 17, 0.9);
      if (s0) return [s0[0], s0[1] + grain];
      if (px >= 16 && px <= 28 && py >= 17 && py < HZ) {
        if (py >= 20 && py <= 29 && (px === 19 || px === 20 || px === 24 || px === 25)) return [DARKW, 0]; // the tall louvres
        if (py >= 32 && py <= 35 && (px === 19 || px === 25)) return [DARKW, 0];
        return stone((py === 17 ? 5 : py === 31 ? -4 : 0) + (px >= 27 ? -8 : px === 16 ? 4 : 0));
      }
      // The spires along the roof, the Nieuwerck's tower and spire, and the turret at the far left.
      const s1 = spire(px, py, 52, 10, 21, 2) ?? spire(px, py, 57, 18, 28, 1.2) ?? spire(px, py, 69, 8, 18, 2) ?? spire(px, py, 1.5, 22, 30, 1.4);
      if (s1) return [s1[0], s1[1] + grain];
      if (px >= 50 && px <= 54 && py >= 21 && py < 28) return stone(px >= 53 ? -8 : 2);
      if (px >= 67 && px <= 71 && py >= 18 && py < 35) return py >= 22 && py <= 25 && px === 69 ? [DARKW, 0] : stone(px >= 70 ? -8 : 2);
      if (px <= 2 && py >= 30 && py < HZ) return stone(px === 2 ? -6 : 3);
      // The hall: a long steep slate roof with little dormers, a row of tall windows, a ledge, the arcade below.
      if (px >= 3 && px <= 76) {
        if (py >= 28 && py < 35) return [SLATE, (py === 28 ? 6 : py === 34 ? -8 : 0) + (px % 7 === 3 && py >= 30 && py <= 31 ? 10 : 0) + grain + vig];
        if (py >= 35 && py < HZ) {
          if (py >= 37 && py <= 41 && px % 3 === 1) return [DARKW, 0];
          if (py === 42) return stone(5);
          if (py === 43) return stone(-4);
          if (py >= 44 && px % 3 !== 0 && !(py === 44 && px % 3 === 2)) return [DARKW, py > 45 ? -2 : 0];
          return stone(px > 72 ? -3 : 0);
        }
      }
      // The houses closing the right of the square: stepped gables, rows of windows.
      for (const [x0, x1, pk] of [[77, 85, 25], [86, 91, 31], [92, 95, 28]]) {
        if (px < x0 || px > x1) continue;
        const mid = (x0 + x1) / 2, top = pk + Math.floor(Math.abs(px - mid) * 0.7) * 2;
        if (py < top || py >= HZ) break;
        if (py > pk + 5 && (px - x0) % 3 === 1 && (py - pk - 6) % 5 >= 1 && (py - pk - 6) % 5 <= 3) return [DARKW, 0];
        return stone((py === top ? 6 : 0) + (x0 === 86 ? -6 : 0) + (px === x1 ? -6 : 0));
      }
      // The square: wide and empty, a few people crossing it, a shadow across its near corner.
      if (py >= HZ) {
        if ([[34, 50], [41, 51], [62, 49], [83, 50]].some(([fx, fy]) => px === fx && py >= fy && py <= fy + 2)) return [DARKW, 0];
        return [STREET, (py - HZ) * -0.3 + (py > 52 && px < 44 - (py - 52) * 2 ? -10 : 0) + (fbm(384, px / 5, py / 3, 3) - 0.5) * 6 + grain + vig];
      }
      // The sky: plain, a touch paler at the horizon.
      return [SEPIA_LIGHT, (HZ - py) * -0.08 + 2 + (fbm(385, px / 11, py / 6, 3) - 0.5) * 6 + grain + vig];
    };
    const CRACK: RGB = [238, 237, 230], FIBRE: RGB = [234, 232, 224];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x - (W - 1 - F); // the corner bent up: cut away, its underside folded back over the card
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      const corner = Math.hypot(Math.max(0, 4 - Math.min(x, W - 1 - x)), Math.max(0, 4 - Math.min(y, H - 1 - y))) > 3.6; // handled corners wear round
      if (corner || (e < 2 && hash(387, x, y) < 0.2 - e * 0.09 + (e === 0 && (x < 14 || x > W - 14 || y < 10 || y > H - 10) ? 0.1 : 0))) continue; // nicks and chips along the edge
      if (u - y > 0) continue;
      if (u >= 0 && y <= F && u <= y) { // the flap: the back of the card, creased and gone soft along its fold
        if (y - u < 1 && hash(388, x, y) < 0.3) { set(x, y, CRACK, 6, true); continue; } // the fold's white crack
        set(x, y, FLAP, u === y ? -8 : (y - u) < 2 ? -3 : 2 - (y - u) * 0.2 + (fbm(389, x / 3, y / 3, 2) - 0.5) * 6, true);
        continue;
      }
      const inPic = x >= PX && x < PX + PW && y >= PY && y < PY + PH;
      if (inPic) {
        let [c, v] = photo(x - PX, y - PY);
        const d = u - y; // distance from the fold line (negative = on the card)
        if (d > -4 && d <= 0 && hash(390, x, y) < 0.55 - Math.abs(d) * 0.12) { c = CRACK; v = 8; } // the emulsion cracked white along the fold
        const fy = 40 + Math.round((valueNoise(391, x / 6, 0) - 0.5) * 3); // a long crease across the picture, cracked here and there
        if (Math.abs(y - PY - fy) < 1 && x > 8 && x < 96) { if (hash(392, x, y) < 0.35) { c = CRACK; v = 6; } else v -= 6; }
        else if (y - PY === fy + 1 && x > 8 && x < 96 && hash(393, x, y) < 0.5) v += 5;
        set(x, y, c, v);
        continue;
      }
      // The white border: foxed and grubby, the edge frayed pale where it's been handled, darkest at the corners.
      const grime = Math.max(0, 5 - Math.min(Math.min(x, W - 1 - x), Math.min(y, H - 1 - y))) * 0.5 + (Math.hypot(Math.min(x, W - 1 - x), Math.min(y, H - 1 - y)) < 14 ? 3 : 0);
      if (e < 1.5 && hash(394, x, y) < 0.5) { set(x, y, FIBRE, 6, true); continue; }
      set(x, y, BORDER, (fbm(386, x / 7, y / 7, 2) - 0.5) * 8 + (x + y < 22 ? 5 : 0) - grime - (fbm(395, x / 4, y / 4, 2) > 0.66 ? 6 : 0), e < 1);
    }
    letters(set, PX + centre(PW, 'YPRES - LES HALLES'), PY + 1, 'YPRES - LES HALLES', [70, 68, 64], 0); // printed across the sky
  });
}

/** A pewter hip flask from above, curved to fit the hip: its broad face shaded across the curve (lit on the side
 * that faces the light, as the spanner's handle is), the edge in the desk's metal shading; a raised band of pebbled
 * brown leather round its middle, worn smooth where it's handled, saddle-stitched along both edges and down the seam
 * where it overlaps, a maker's oval stamped in it, a scuff or two; a bayonet cap on a short chain at the shoulder, a dent, the soft
 * scratches of a pocket. Pewter is duller than nickel: a step darker, a little blue. `turn`: how it will lie. */
export function hipFlask(turn = 0): Px {
  const W = 52, H = 74, T = 14, RC = 9; // the body from y 14 (the shoulder above it); its corners' radius
  const PEWTER: RGB = mute([138, 140, 140], 0.7), PLIT: RGB = mute([200, 202, 198], 0.7), PDARK: RGB = mute([74, 76, 78], 0.7);
  const LEATH: RGB = mute([110, 72, 44], 0.75), THREAD: RGB = mute([190, 160, 112], 0.75), METAL: RGB = [0x9c, 0x98, 0x82], LITM: RGB = [0xe2, 0xe0, 0xd6], DARKM: RGB = [0x56, 0x54, 0x49];
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const B0 = 34, B1 = 54; // the leather band
  return toned(W, H, (set) => {
    // The body: a rounded oblong, with a shoulder narrowing to the neck at the top.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      let e: number, nx = 0, ny = 0;
      if (py >= T) {
        const qx = Math.max(RC - px, 0, px - (W - RC)), qy = Math.max(RC - (py - T), 0, py - (H - RC));
        if (qx > 0 && qy > 0) { const d = Math.hypot(qx, qy); e = RC - d; nx = (px < W / 2 ? -qx : qx) / d; ny = (py < H / 2 ? -qy : qy) / d; }
        else { const ex = Math.min(px, W - px), ey = Math.min(py - T, H - py); e = Math.min(ex, ey); if (ex < ey) nx = px < W / 2 ? -1 : 1; else ny = py < H / 2 ? -1 : 1; }
      } else { // the shoulder: a narrowing collar up to the neck
        const half = 7 + (py - 6) * 1.2;
        if (py < 6 || Math.abs(px - W / 2) > half) continue;
        e = Math.min(half - Math.abs(px - W / 2), py - 6); nx = px < W / 2 ? -1 : 1; ny = -0.6;
      }
      if (e <= 0) continue;
      const l = litT(nx, ny);
      if (py >= B0 && py < B1 && e > 1.2) { // the leather band: raised, its edges lit and shaded; pebbled grain, worn smooth where handled
        const top = py < B0 + 1, bottom = py >= B1 - 1, faceTop = litT(0, -1) > litT(0, 1);
        if (top || bottom) { set(x, y, LEATH, (top === faceTop ? 10 : -18), true); continue; } // the band's thickness
        const row = Math.abs(py - B0 - 2.5) < 0.5 || Math.abs(py - B1 + 2.5) < 0.5; // the stitch lines, 2 px in from each edge
        const seamX = W - 14, seam = Math.abs(px - seamX) < 0.6, seamStitch = Math.abs(px - seamX - 2.5) < 0.5; // where the leather overlaps, stitched down
        if (row || seamStitch) { const k = Math.floor(row ? px : py) % 3; set(x, y, k === 2 ? mute([56, 36, 22], 0.75) : THREAD, k === 2 ? 0 : k === 0 ? 6 : -2, true); continue; } // saddle stitch: thread, thread, hole
        if (seam) { set(x, y, LEATH, -16, true); continue; }
        const worn = fbm(395, px / 7, py / 5, 2) > 0.6; // rubbed smooth and pale
        const pebble = worn ? 0 : (valueNoise(396, px / 1.4, py / 1.4) - 0.5) * 10; // the grain
        const sx = px - 22, sy = py - (B0 + B1) / 2, oval = Math.abs(Math.hypot(sx / 6, sy / 3.4) - 1) < 0.16; // a maker's oval, blind-stamped
        const scuff = [[10, 41, 0.5], [32, 47, -0.4]].some(([cx, cy, sl]) => Math.abs(px - cx - (py - cy) / sl) < 0.6 && Math.abs(py - cy) < 2.2);
        set(x, y, LEATH, litT((px - W / 2) / (W / 2), 0) * 8 + pebble + (worn ? 7 : 0) + (oval ? -12 : 0) + (scuff ? 12 : 0) + (hash(392, x, y) < 0.04 ? -8 : 0), oval || scuff);
        continue;
      }
      if (e < 1.2) { set(x, y, l > 0.35 ? PLIT : l < -0.35 ? PDARK : PEWTER, l > 0.35 || l < -0.35 ? 0 : -4, true); continue; } // the very edge
      if (e < 2.6) { set(x, y, PEWTER, l > 0.3 ? 12 : l < -0.3 ? -14 : 0, true); continue; } // a step in
      // The face: curved across, so lit on the side towards the light; a dent; scratches.
      const across = (px - W / 2) / (W / 2), dent = Math.hypot(px - 34, py - 62) < 3.6;
      const scratch = valueNoise(393, (px * 0.9 + py * 0.5) / 1.1, Math.floor((py - px * 0.6) / 9)) > 0.94;
      set(x, y, PEWTER, litT(across, 0) * 18 * Math.abs(across) ** 0.6 + (dent ? -litT((px - 34) / 3.6, (py - 62) / 3.6) * 12 : 0) + (scratch ? 7 : 0) + (fbm(394, px / 9, py / 9, 2) - 0.5) * 4);
    }
    // The cap: a domed nickel cap on the neck, its knurled edge, and the short chain to the shoulder.
    blob(set, W / 2, 6, 6, 6, 0, (d, nx, ny) => {
      const l = litT(nx, ny);
      if (d > 0.8) return [l > 0.35 ? LITM : l < -0.35 ? DARKM : METAL, Math.floor((Math.atan2(ny, nx) + Math.PI) * 4) % 2 ? 0 : -8, true]; // the knurled rim, ridged round
      if (d < 0.35) return [METAL, l > 0.3 ? 10 : 2, true]; // the dome's top
      return [METAL, l > 0.3 ? 6 : l < -0.3 ? -10 : -2, true];
    });
    for (let k = 0; k < 5; k++) { const x = W / 2 + 6 + k * 1.6, y = 8 + k * 1.3; set(x, y, k % 2 ? DARKM : METAL, 0, true); set(x + 1, y, k % 2 ? METAL : LITM, 0, true); } // the chain
  });
}

/** A letter from home, not yet opened, as the post brought it to a squadron in France: a cream laid-paper envelope
 * (the flaps on its back showing faintly through), a George V penny stamp in scarlet (its perforated edge, the
 * king's head in an oval), cancelled by a circular postmark in black with the machine's wavy lines beside it; the
 * address in blue-black ink in a careful hand, in the form of the day: rank, flight, squadron, R.F.C., B.E.F.,
 * France. Handled on the way: a crease, the corners softened, a spot of foxing. Paper, so dithered broad and whole
 * tones in the fine parts. */
export function sealedLetter(): Px {
  const W = 128, H = 82;
  const ENV: RGB = mute([226, 216, 184], 0.85), STAMP: RGB = mute([184, 48, 42], 0.8), STAMPLIT: RGB = mute([220, 130, 110], 0.8), PM: RGB = [62, 60, 64], INKC: RGB = [40, 46, 72];
  return toned(W, H, (set, has) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 2 && Math.hypot(Math.max(0, 2 - Math.min(x, W - 1 - x)), Math.max(0, 2 - Math.min(y, H - 1 - y))) > 2) continue; // softened corners
      // The back's flaps, seen through: from each corner in to the middle, as the envelope is folded.
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      const flap = Math.abs(v - Math.min(u, 1 - u) * 1.1) < 0.012 || (v > 0.5 && Math.abs((1 - v) - Math.min(u, 1 - u) * 0.95) < 0.012);
      const crease = Math.abs(x - 84 - (y - 40) * 0.05) < 0.6; // folded once in a pocket
      const fox = Math.hypot(x - 18, y - 66) < 2.5 + valueNoise(470, x / 2, y / 2) * 1.5;
      set(x, y, ENV, (e < 1 ? -10 : 0) + (flap ? -4 : 0) + (crease ? -8 : x === Math.round(85 + (y - 40) * 0.05) ? 4 : 0) + (fox ? -8 : 0) + (x % 7 === 3 ? -2 : 0) + (fbm(471, x / 9, y / 9, 2) - 0.5) * 6 + (x + y < 30 ? 3 : 0), e < 1 || crease);
    }
    // The penny stamp, top right: perforated edge, a frame, the king's head in a pale oval, the value at the foot.
    const SX = 104, SY = 4, SW = 18, SH = 22;
    for (let y = SY - 1; y < SY + SH + 1; y++) for (let x = SX - 1; x < SX + SW + 1; x++) {
      const out = x < SX || y < SY || x >= SX + SW || y >= SY + SH;
      if (out) { if ((x + y) % 2 === 0) set(x, y, STAMP, -6, true); continue; } // the perforated teeth round its edge
      const fx = x + 0.5 - (SX + SW / 2), fy = y + 0.5 - (SY + 9);
      const oval = Math.hypot(fx / 6, fy / 7.2) < 1, ring = oval && Math.hypot(fx / 6, fy / 7.2) > 0.82;
      // His head, facing left: the back of the skull and neck, the brow, nose and beard, in the oval's pale ground.
      const head = Math.hypot((fx - 0.8) / 3, (fy + 1) / 3.6) < 1 || (fy > 1.5 && fy < 5.6 && fx > -1.2 && fx < 2.6) || (Math.abs(fy + 0.8) < 0.8 && fx < -2 && fx > -3.6);
      set(x, y, ring ? STAMP : oval ? (head ? STAMP : STAMPLIT) : STAMP, ring ? -8 : 0, true);
    }
    for (let x = SX + 2; x < SX + SW - 2; x++) set(x, SY + SH - 4, STAMPLIT, -4, true); // the value tablet: ONE PENNY, too small to read
    // The postmark: a ring of black ink half over the stamp, the town and date too small to read, the wavy lines.
    const PX = 100, PY = 16, PR = 9;
    for (let y = 0; y < H; y++) for (let x = 60; x < W; x++) {
      const r = Math.hypot(x + 0.5 - PX, y + 0.5 - PY), worn = hash(472, x, y) < 0.25;
      if (worn || !has(x, y)) continue;
      if (Math.abs(r - PR) < 0.6 || (r < PR - 2 && (Math.abs(y + 0.5 - PY + 2) < 0.6 || Math.abs(y + 0.5 - PY - 2) < 0.6) && x % 3 !== 0)) set(x, y, PM, 0, true); // the ring; the town and the date across it
      else if (x < PX - PR - 2 && x > 62 && [8, 12, 16, 20, 24].some((wy) => Math.abs(y + 0.5 - wy - Math.sin(x / 3) * 1.2) < 0.55)) set(x, y, PM, 0, true); // the wavy lines
    }
    // The address, in ink: the game's letters each nudged a little, as a pen would.
    const hand = (s: string, x0: number, y0: number, salt: number) => {
      let x = x0;
      for (const [i, ch] of [...s].entries()) {
        const t = createPx(Math.max(1, textWidth(ch)), 5);
        text(t, 0, 0, ch, [255, 255, 255, 255]);
        const dy = hash(473 + salt, i, 1) < 0.25 ? -1 : 0;
        for (let j = 0; j < 5; j++) for (let k = 0; k < t.w; k++) if (t.data[(j * t.w + k) * 4 + 3]) set(x + k, y0 + j + dy, INKC, 0, true);
        x += textWidth(ch) + 1 + (hash(473 + salt, i, 2) < 0.2 ? 1 : 0);
      }
    };
    hand('2ND LIEUT.', 18, 36, 1);
    hand("'A' FLIGHT, NO. 6 SQDN.,", 24, 45, 2);
    hand('ROYAL FLYING CORPS,', 30, 54, 3);
    hand('B.E.F., FRANCE.', 36, 63, 4);
    for (let x = 36; x < 92; x++) if (x % 9 !== 0) set(x, 70 + (x % 13 === 0 ? 1 : 0), INKC, 0, true); // underlined, as many did
  });
}

/** An Army message pad, half used: printed heading, pencilled spotting notes, the torn stubs at the top. A thing you can pick up. */
export function messagePad(): Px {
  const W = 108, H = 140;
  return toned(W, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      set(x, y, y < 12 ? [100, 104, 72] : PAPER, y < 12 ? (y < 2 ? 12 : 0) : e < 1 ? -12 : (fbm(421, x / 8, y / 8, 2) - 0.5) * 8 + (y > 18 && (y - 18) % 7 === 0 ? -8 : 0), y < 12 || e < 1);
    }
    for (let x = 0; x < W; x += 3) set(x, 12, CREAM, 6, true); // the torn stubs
    letters(set, centre(W, 'MESSAGE'), 4, 'MESSAGE', CREAM, 0);
    const notes = ['B4 B4', 'C2 OK', 'Z11 W', 'MG AT', 'H 2 3', 'LL 6', 'A5 OK', 'BTY SHORT', 'C2 OK', 'F3 B2', 'X OK', 'LL 4'];
    notes.forEach((s, i) => letters(set, 6 + (hash(422, i, 1) < 0.3 ? 1 : 0), 20 + i * 7, s, [96, 92, 88], 0));
  });
}
/** A combination spanner from the rigger's roll (7/16 and 3/8 Whitworth): a ring with a hex hole at one end, an
 * open jaw at the other (turned 15° off the handle, as they are), the sizes stamped in the handle. The nickel of
 * the goggles' rims and the orders' clip, shaded the same way: its edges in whole tones (the outermost catching
 * the light on the top-left, dark on the bottom-right; the hex hole the other way round, lit on its far wall), the
 * flat faces dithered, a little old oil. `turn`: how it will lie, so its light still falls from the top-left. */
export function spanner(turn = 0): Px {
  const W = 206, H = 38, cy = 19, X0 = 19, X1 = 186; // the two heads' centres
  const heads = [{ x: X0, R: 17, hex: 9, turn: 0, open: false }, { x: X1, R: 17, hex: 8, turn: Math.PI / 12, open: true }];
  const METAL: RGB = [0x9c, 0x98, 0x82], DARKM: RGB = [0x56, 0x54, 0x49], LITM: RGB = [0xe2, 0xe0, 0xd6];
  const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
  const hexOut = (ox: number, oy: number, r: number, a0: number) => { // > 0 outside a hexagon of inradius r
    let d = -Infinity;
    for (let k = 0; k < 3; k++) { const a = a0 + k * Math.PI / 3; d = Math.max(d, Math.abs(ox * Math.cos(a) + oy * Math.sin(a)) - r); }
    return d;
  };
  /** How far inside the steel (x, y) is, in px (≤ 0: off it, or in a hole). */
  const inside = (x: number, y: number) => {
    const hw = 7.5 + Math.cos(((x - X0) / (X1 - X0)) * Math.PI * 2) ** 2; // the handle, a little fuller towards the heads
    let d = Math.max(Math.abs(y - cy) - hw, X0 - x, x - X1);
    for (const h of heads) d = smin(d, Math.hypot(x - h.x, y - cy) - h.R, 8); // flared into the heads
    for (const h of heads) {
      const ox = x - h.x, oy = y - cy, u = ox * Math.cos(h.turn) + oy * Math.sin(h.turn), v = -ox * Math.sin(h.turn) + oy * Math.cos(h.turn);
      d = Math.max(d, -(h.open ? Math.min(hexOut(ox, oy, h.hex, h.turn + Math.PI / 6), Math.max(Math.abs(v) - h.hex, -u)) : hexOut(ox, oy, h.hex, h.turn)));
    }
    return -d;
  };
  const lc = Math.cos(turn), ls = Math.sin(turn); // the top-left of the screen, in the drawing's own frame
  const lit = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the light
  return toned(W, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, e = inside(px, py);
      if (e <= 0) continue;
      const gx = inside(px + 0.5, py) - inside(px - 0.5, py), gy = inside(px, py + 0.5) - inside(px, py - 0.5), gl = Math.hypot(gx, gy) || 1;
      const l = lit(-gx / gl, -gy / gl); // which way the nearest edge faces
      if (e < 1.2) set(x, y, l > 0.4 ? LITM : l < -0.4 ? DARKM : METAL, l > 0.4 ? 6 : l < -0.4 ? -6 : -4, true); // the very edge
      else if (e < 2.6) set(x, y, METAL, l > 0.3 ? 14 : l < -0.3 ? -16 : l > -0.05 ? 4 : -6, true); // the rounded edge, in whole tones
      else set(x, y, METAL, lit(0, (py - cy) / 9) * 6 + (fbm(431, px / 9, py / 6, 2) > 0.64 ? -8 : 0) + (fbm(432, px / 14, py / 14, 2) - 0.5) * 6); // the flat: dithered, old oil
    }
    letters(set, X0 + 26, cy - 2, '7/16', DARKM, -4);
    letters(set, X1 - 26 - textWidth('3/8'), cy - 2, '3/8', DARKM, -4);
  });
}

/** A candle end stuck in an enamel saucer by its own wax, from above, well burnt down. The saucer: white enamel
 * gone grey with use, its rolled rim in green, chipped through to black iron; the rim lit on the side that faces
 * the light, the well's wall on the far side, as the ashtray's is, the rim's shadow cast hard across the well on
 * the lit side and a little of the stub's own; old wax spilt hard on it and a spent match.
 * The candle: a stub with its top melted into a cup, the rim of the cup lit, the pool of wax inside it, a burnt
 * black wick; drips run down its side and pooled where they met the saucer. `turn`: how it will lie. */
export function candle(turn = 0): Px {
  const S = 60, C = 30, R = 29, RIM = 25.5, CR = 9; // the saucer, its rim's inner edge, the candle
  const RIMC: RGB = mute([62, 92, 64], 0.7), IRON: RGB = [44, 42, 44], ENAMEL: RGB = mute([212, 212, 204], 0.8), WAX: RGB = mute([232, 222, 190], 0.8), POOL: RGB = mute([214, 198, 156], 0.8);
  const lc = Math.cos(turn), ls = Math.sin(turn);
  const litT = (nx: number, ny: number) => -((nx * lc - ny * ls) + (nx * ls + ny * lc)) / Math.SQRT2; // 1: faces the screen's top-left
  const TLx = -(lc + ls) / Math.SQRT2, TLy = (ls - lc) / Math.SQRT2; // towards the screen's top-left, in the drawing
  // Where the wax ran: drips out from the candle, the way it leant.
  const drips = Array.from({ length: 4 }, (_, k) => { const a = hash(442, k, 1) * Math.PI * 2; return { a, len: 3 + hash(442, k, 2) * 6, w: 1.4 + hash(442, k, 3) * 1.2 }; });
  const onDrip = (dx: number, dy: number) => { const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); return r > CR - 1 && drips.some((d) => { const da = Math.abs(((a - d.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return r < CR + d.len && da * r < d.w * (1 - (r - CR) / (d.len + 1) * 0.5); }); };
  return toned(S, S, (set) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5, dx = px - C, dy = py - C, r = Math.hypot(dx, dy);
      if (r > R) continue;
      const l = litT(dx / r, dy / r); // the outward side here, towards the light?
      if (r < CR) { // the candle's top: the melted cup's rim lit, the pool inside, the wick
        if (r < 1.3) { set(x, y, CHAR, 0, true); continue; } // the wick, burnt black
        if (r < 2.2 && hash(443, x, y) < 0.5) { set(x, y, [70, 60, 48], 0, true); continue; } // soot round it
        if (r > CR - 1.2) { set(x, y, WAX, l > 0.3 ? 16 : l < -0.3 ? -22 : -4, true); continue; } // the candle's edge, round: lit towards the light, dark away
        if (r > CR - 2.6) { set(x, y, WAX, l > 0.3 ? 8 : l < -0.3 ? -6 : 4, true); continue; } // the cup's rim
        set(x, y, POOL, -l * 12 - 8 + (fbm(444, px / 3, py / 3, 2) - 0.5) * 4, true); // the pool of wax, sunk: its far side lit
        continue;
      }
      // The candle's hard shadow on the saucer (it stands up), then the saucer itself.
      const rimShade = Math.hypot(px + TLx * 5 - C, py + TLy * 5 - C) > RIM - 2; // the rim's hard shadow, on the well by the lit side, as in the ashtray
      const shade = rimShade ? -20 : Math.hypot(px + TLx * 3 - C, py + TLy * 3 - C) < CR ? -12 : 0; // and a little of the stub's own
      if (onDrip(dx, dy)) { set(x, y, WAX, (l > 0.3 ? 6 : l < -0.3 ? -12 : -2) + shade * 0.5, true); continue; } // wax run down the side and set
      if (r > R - 1.2) { set(x, y, l > 0.35 ? mute([124, 160, 118], 0.7) : l < -0.35 ? mute([30, 46, 32], 0.7) : RIMC, 0, true); continue; } // the rim's very edge
      if (r > RIM) {
        const chip = fbm(440, px / 3, py / 3, 2) > 0.7; // chipped to black iron
        set(x, y, chip ? IRON : RIMC, chip ? 0 : l > 0.3 ? 10 : l < -0.3 ? -12 : 0, true);
        continue;
      }
      if (r > RIM - 2) { set(x, y, ENAMEL, (-l > 0.3 ? 6 : -l < -0.3 ? -14 : -4) + (rimShade && -l < 0 ? -6 : 0), true); continue; } // the well's wall, lit on its far side
      const spill = Math.hypot(px - 40, py - 40) < 3.4 + valueNoise(445, px, py) || Math.hypot(px - 19, py - 22) < 2.2 + valueNoise(445, px, py); // two old spills of wax, gone hard
      const wear = fbm(441, px / 6, py / 6, 2) > 0.6 ? -6 : 0; // the enamel gone grey where it's been scrubbed
      set(x, y, spill ? WAX : ENAMEL, shade + (spill ? -4 : wear) + (fbm(446, px / 9, py / 9, 2) - 0.5) * 4);
    }
    rod(set, 12, 40, 21, 46, 0.9, (t) => [t < 0.2 ? CHAR : [70, 54, 40], t < 0.2 ? 0 : -4, true]); // a spent match in the saucer
  });
}

/** Clutter as the desk draws it: each kind's drawing, and how it lies.
 * `z`: how high it lies (barn-art.ts `Z`; default under everything you use), `depth`: its shadow's drop,
 * `spin`: turned every way to find where it fits best (and drawn lit for the way it lies), `bears`: whether
 * anything may lie on top of it (flat, soft things: yes; anything round, tall or that would tip: no). */
export const CLUTTER: readonly { name: string; art: (turn?: number) => Px; turn?: number; z?: number; depth?: number; spin?: boolean; bears: boolean }[] = [
  { name: 'postcard', art: postcard, bears: true, turn: -0.3 }, // laid nearly upright, to be read
  { name: 'knife', art: pocketKnife, bears: false, z: 8.4, depth: 3, spin: true }, // nothing balances on it; over the papers; lit for the way it lies
  { name: 'flask', art: hipFlask, bears: false, z: 8.4, depth: 5, spin: true }, // curved: nothing balances on it; over the papers; lit for the way it lies
  { name: 'ashtray', art: shellAshtray, bears: false, z: 8.6, depth: 4, spin: true }, // heavy brass: on top of the papers, lit for the way it lies
  { name: 'tin', art: tobaccoTin, bears: false, z: 8.4, depth: 5, spin: true }, // a solid tin: nothing on it, it lies over the papers; lit for the way it lies
  { name: 'candle', art: candle, bears: false, z: 8.4, depth: 5, spin: true }, // it stands up: nothing on it; over the papers; lit for the way it lies
  { name: 'ink', art: inkBottle, bears: false, z: 8.4, depth: 6, spin: true }, // a tall bottle: nothing on it, over the papers, a deep shadow; lit for the way it lies
  { name: 'spanner', art: spanner, bears: false, z: 8.7, depth: 5, spin: true }, // heavy: dropped on top of almost anything (only the orders above it)
  { name: 'matches', art: matchbox, bears: false, z: 8.4, depth: 5, spin: true }, // a box that would tip: nothing on it, it lies over the papers; lit for the way it lies
  { name: 'pencil', art: pencil, bears: false, spin: true }, // turned every way to fit a gap, lit for the way it lies
  { name: 'pen', art: pen, bears: false, z: 8.4, depth: 3, spin: true }, // round: nothing balances on it; over the papers; lit for the way it lies
  { name: 'rounds', art: cartridges, bears: false, z: 8.4, depth: 3, spin: true }, // round: nothing balances on them; over the papers; lit for the way they lie
];
