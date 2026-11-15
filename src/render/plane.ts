// Procedural pixel-art BE.2c sprite (abstract for now), top-down, nose up.
// Seventeen bank frames, from hard left through level to hard right, plus matching shadow silhouettes.

export const SPRITE_W = 36; // 32 for the plane, + 2 a side: room for the upper wing to slide over in a bank
const OX = 2; // the drawing's columns are offset by this
export const SPRITE_H = 24;
/** The propeller is redrawn every frame at a random width in this range, so it reads as spinning. */
export const PROP = { minW: 4, maxW: 12, row: 2 };

type RGBA = readonly [number, number, number, number];

const C = {
  nose: [0x4b, 0x48, 0x42, 255],
  metal: [[0x5c, 0x5a, 0x54, 255], [0x7a, 0x77, 0x6e, 255], [0x96, 0x92, 0x88, 255]], // shade, base, lit (engine cowl)
  exhaust: [0x3a, 0x34, 0x2e, 255],
  prop: [0xb9, 0xb5, 0xaa, 170], // spinning blur
  cockpit: [0x3a, 0x30, 0x24, 255],
  rim: [0x6b, 0x55, 0x38, 255], // the leather-bound cockpit coaming
  head: [0x5a, 0x40, 0x2a, 255], // a leather flying helmet
  tones: [
    // Clear-doped linen, darkest (trailing edges, shade) … lightest (leading edges in the sun).
    [0x7f, 0x70, 0x50, 255],
    [0x9a, 0x89, 0x63, 255],
    [0xc4, 0xb3, 0x88, 255],
    [0xdc, 0xcd, 0xa3, 255],
    [0xee, 0xe3, 0xc2, 255],
  ],
  blue: [0x2d, 0x4a, 0x8c, 255],
  white: [0xe8, 0xe4, 0xd6, 255],
  red: [0xb0, 0x30, 0x2a, 255],
} as const;

export type PlaneSprites = {
  frames: HTMLCanvasElement[];
  /** Per bank frame: each pixel's height (px above the lower wing; −1 = empty), for the self-shadow. */
  heights: Int8Array[];
  /** Per bank frame: each pixel's surface tilt (nx, ny pairs), for the baked light. */
  normals: Float32Array[];
  /** Per bank frame: the sprite's pixels (RGBA), to bake shadowed versions from. */
  pixels: Uint8ClampedArray[];
  /** Baked self-shadowed frames, by key (see selfShadowed). */
  shaded: Map<string, HTMLCanvasElement>;
  masks: Uint8Array[]; // SPRITE_W×SPRITE_H silhouettes (1 = solid), for the cast shadow
  props: HTMLCanvasElement[]; // indexed by width in pixels (index < PROP.minW unused)
};

/** Bank frames per side: b runs −BANK_STEPS … BANK_STEPS (hard left … level … hard right). Eight a
 *  side, so a turn rolls in and out in small steps. */
export const BANK_STEPS = 8;
export const BANK_FRAMES = 2 * BANK_STEPS + 1;
const MAX_BANK_ANGLE = 0.9; // radians the sprite tips at full bank

/** Bank (−1 … 1) → frame index 0 … BANK_FRAMES − 1. */
export function bankFrame(bank: number): number {
  return Math.min(BANK_FRAMES - 1, Math.max(0, Math.round(bank * BANK_STEPS) + BANK_STEPS));
}

/** Foreshortening of anything spanning the plane sideways (wings, prop disc) at bank step b. */
const foreshorten = (b: number) => Math.cos((b / BANK_STEPS) * MAX_BANK_ANGLE);

/** Prop width for a random r in [0, 1); the disc foreshortens with the wings as the plane banks. */
export function propWidth(r: number, bank: number): number {
  const max = Math.max(PROP.minW, Math.round(PROP.maxW * foreshorten(bankFrame(bank) - BANK_STEPS)));
  return PROP.minW + Math.floor(r * (max - PROP.minW + 1));
}

/** The linen tone at a fractional index (0 … 4), blended between its neighbours. */
function linen(t: number): RGBA {
  const v = Math.min(4, Math.max(0, t));
  const i = Math.min(3, Math.floor(v));
  const a = C.tones[i];
  const b = C.tones[i + 1];
  const w = v - i;
  return [Math.round(a[0] + (b[0] - a[0]) * w), Math.round(a[1] + (b[1] - a[1]) * w), Math.round(a[2] + (b[2] - a[2]) * w), 255];
}

/**
 * The BE.2c from above, nose up, banked b steps (−BANK_STEPS hard left … BANK_STEPS hard right): the wings
 * foreshorten as they tip. Drawn unlit (form only); the sun's light and the plane's shadow on itself are
 * baked per sun direction in selfShadowed.
 */
function drawPlane(b: number, out: (x: number, y: number, c: RGBA, height: number, nx: number, ny: number) => void) {
  // Every pixel also gets its height above the lower wing, in px (the sprite's own scale: ~0.35 m a
  // pixel), for the plane's shadow on itself: the tailplane a little up, the fuselage's top higher, the
  // upper wing one interplane gap (~1.8 m) above the lower.
  // And which way its surface faces, as a horizontal tilt (nx, ny: −1 … 1, sprite axes, nose up), so the
  // light can be baked for wherever the sun is (selfShadowPixels). The colours themselves are unlit:
  // only form (ribs, ailerons, edges, markings) is drawn in; light and shade come from the sun.
  let H = 0;
  let NX = 0;
  let NY = 0;
  const f = b / BANK_STEPS; // −1 … 1
  const k = foreshorten(b);
  // Rolled, everything above the lower wing swings toward the low side as seen from above, by its height
  // × sin(roll): the upper wing slides over, the lower wing peeks out on the high side and the fuselage
  // shows its upper flank. The clearest cue to which way the plane is turning, whatever the sun.
  // Parts slide as rigid pieces (S: the height they slide by), separately from each pixel's own height
  // H (for shadows): the fuselage with its cockpits, head, fin and tailplane at its centreline; the upper
  // wing (and its roundels) at its own height; the lower wing not at all.
  const lean = Math.sin(f * MAX_BANK_ANGLE);
  let S = 0;
  const set = (x: number, y: number, c: RGBA) => out(x + OX + Math.round(S * lean), y, c, H, NX, NY);
  // And a tilted wing reads lighter as it rises (toward the open sky) and darker as it drops (seen more
  // edge-on, into its own shadow), drawn in: the light of the sun is added on top of it when baked.
  // A gradient along the span (−1 at the left tip … 1 at the right), not a step at the centre: a wing is rigid.
  const tone = (span: number, base: number) => linen(base - f * span * 2.2);
  const col = (side: -1 | 1, i: number) => (side < 0 ? 15 - i : 16 + i); // i-th column out from the fuselage
  const hard = Math.abs(f) >= 0.7; // banked hard: the dropping wingtip tucks under, a pixel shorter
  const dropped = (side: -1 | 1) => (hard && Math.sign(f) === side ? 1 : 0);

  /** A wing panel: rows top (leading edge) … bottom, a tone per row; ribs show as faint lines across the
   *  fabric, the outer trailing edge (aileron, elevator) is a step darker, tip corners rounded off. */
  const wing = (side: -1 | 1, span: number, rows: number[], tones: number[], ribs: boolean, flap: number) => {
    for (let i = 0; i <= span; i++) {
      rows.forEach((y, r) => {
        const last = r === rows.length - 1;
        if (i === span && (r === 0 || last)) return; // rounded tip
        let t = tones[r];
        if (ribs && r > 0 && !last && i > 1 && i % 3 === 0) t -= 1; // a rib
        if (last && i >= span * flap && i < span) t -= 1; // aileron / elevator
        if (i === span) t -= 1; // the tip's edge
        // A banked wing's whole surface tilts toward the low side; its leading edge faces forward, its
        // trailing edge back (cambered fabric).
        NX = f * 0.8;
        NY = r === 0 ? -0.6 : last ? 0.4 : 0;
        set(col(side, i), y, tone((side * i) / Math.max(1, span), t));
      });
    }
  };

  const hs = Math.round(15 * k); // upper-wing half span
  // Lower wing first: under the fuselage and in the upper wing's shadow, staggered behind it.
  for (const side of [-1, 1] as const) wing(side, hs - 1 - dropped(side), [11, 12, 13, 14], [2, 2, 2, 1], true, 2); // 4 rows: a deeper chord than the tail's
  NX = 0;
  NY = 0;

  H = 3;
  S = 2;
  // Fuselage: the engine cowl and its exhausts, the observer's cockpit under the wing's trailing edge,
  // the pilot's behind, tapering back to the tail. Rounded: its sides face out (lit by whichever sun).
  NY = -0.8;
  set(15, 3, C.nose);
  set(16, 3, C.nose);
  NY = 0;
  for (let y = 4; y <= 6; y++) {
    for (let x = 14; x <= 17; x++) {
      NX = x <= 15 ? -0.6 : 0.6; // the cowl in two halves, lit and shaded
      set(x, y, C.metal[1]);
    }
  }
  NX = 0;
  set(13, 5, C.exhaust);
  set(18, 5, C.exhaust);
  for (let y = 7; y <= 22; y++) {
    const wide = y <= 17; // the fuselage narrows behind the pilot
    for (let x = wide ? 14 : 15; x <= (wide ? 17 : 16); x++) {
      const left = x === (wide ? 14 : 15);
      const right = x === (wide ? 17 : 16);
      NX = left ? -0.7 : right ? 0.7 : 0;
      set(x, y, C.tones[y >= 19 ? 1 : 2]);
    }
  }
  NX = 0;
  const cockpit = (y: number, head: boolean) => {
    set(14, y, C.rim);
    set(17, y, C.rim);
    set(15, y, head ? C.head : C.cockpit);
    set(16, y, C.cockpit);
    set(15, y + 1, C.cockpit);
    set(16, y + 1, C.cockpit);
  };
  H = 3; // (the head's and the fin's few pixels stay at the fuselage's height: a 1-px shadow reads as dirt)
  cockpit(14, true); // (the pilot's head, just above the fuselage's top)
  for (const side of [-1, 1] as const) {
    H = 5;
    S = 5;
    const span = hs - dropped(side);
    wing(side, span, [7, 8, 9, 10], [3, 3, 2, 2], true, 0.55); // upper wing, over the fuselage (cabane centre section)
    // Roundel: blue ring, white, red centre (a smaller one once the wing is foreshortened).
    const rx = col(side, span - 4);
    if (hs >= 10) {
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if ((dy === 0 || dy === 3) && Math.abs(dx) === 2) continue;
          const ring = dy === 0 || dy === 3 || Math.abs(dx) === 2;
          set(rx + dx, 7 + dy, ring ? C.blue : dx === 0 ? C.red : C.white); // (on the wing: its tilt still applies)
        }
      }
    } else if (hs >= 7) {
      for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) set(rx + dx, 8 + dy, dx === 0 && dy === 1 ? C.red : C.blue);
    }
    H = 1;
    S = 2;
    wing(side, Math.round(7 * k), [19, 20, 21], [3, 2, 2], false, 0.3); // tailplane and elevators
  }
  NX = 0;
  NY = 0;
  H = 3;
  S = 2;
  cockpit(11, false); // the observer's, just behind the upper wing
  H = 3;
  // Fin and rudder, edge on from above: a dark line, the rudder's stripes at its tip.
  set(15, 22, C.tones[0]);
  set(16, 22, C.tones[0]);
  set(15, 23, C.blue);
  set(16, 23, C.red);
}

/** Each pixel's height at bank step b (px above the lower wing; −1 = empty), for the self-shadow. Pure. */
export function planeHeights(b: number): Int8Array {
  const h = new Int8Array(SPRITE_W * SPRITE_H).fill(-1);
  drawPlane(b, (x, y, _c, height) => (h[y * SPRITE_W + x] = height));
  return h;
}

/** Each pixel's surface tilt at bank step b, as (nx, ny) pairs (sprite axes), for the baked light. Pure. */
export function planeNormals(b: number): Float32Array {
  const n = new Float32Array(SPRITE_W * SPRITE_H * 2);
  drawPlane(b, (x, y, _c, _h, nx, ny) => n.set([nx, ny], (y * SPRITE_W + x) * 2));
  return n;
}

/** The sprite at bank step b as RGBA pixels, SPRITE_W × SPRITE_H (for previews and tests). */
export function planePixels(b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SPRITE_W * SPRITE_H * 4);
  drawPlane(b, (x, y, c) => px.set(c, (y * SPRITE_W + x) * 4));
  return px;
}

// --- The plane's shadow on itself ----------------------------------------------------------------
// The upper wing shades the fuselage and lower wing, the fuselage the lower wing, down-sun, by an amount
// that grows with the height difference and the sun's lowness. Baked per (bank frame, sun direction
// relative to the plane, shadow length), quantised so turning only rebuilds when the light has visibly
// moved; each bake is cached, and the likely ones are pre-baked while the game loads.
export const SELF_SHADOW = { directions: 16, lengths: [0.35, 0.7, 1.2, 2], darken: 0.76, light: 0.16 }; // light: how far a surface facing the sun brightens (and one facing away dims)

/** The cache key and shadow offset per px of height (in sprite px) for a frame and the sun, or null when
 *  there's no direct sun to cast it. `shadow` is the sun's shadow travel per unit height, world axes. */
export function selfShadowKey(frame: number, shadow: { x: number; y: number }, heading: number, strength: number) {
  const len = Math.hypot(shadow.x, shadow.y);
  if (strength < 0.15 || len < 0.05) return null;
  // Into the plane's own axes (the sprite is drawn rotated by its heading).
  const c = Math.cos(-heading);
  const s = Math.sin(-heading);
  const lx = shadow.x * c - shadow.y * s;
  const ly = shadow.x * s + shadow.y * c;
  const n = SELF_SHADOW.directions;
  const d = ((Math.round((Math.atan2(ly, lx) / (2 * Math.PI)) * n) % n) + n) % n;
  const L = SELF_SHADOW.lengths;
  const li = L.reduce((best, v, i) => (Math.abs(v - Math.min(len, 2.5)) < Math.abs(L[best] - Math.min(len, 2.5)) ? i : best), 0);
  const a = (d / n) * 2 * Math.PI;
  return { key: `${frame}:${d}:${li}`, dx: Math.cos(a) * L[li], dy: Math.sin(a) * L[li] };
}

/**
 * Bake the light for a sun whose shadows fall along (dx, dy) per px of height (sprite axes): each surface
 * brightened as it faces the sun and dimmed as it faces away (`normals`), then every pixel some higher part
 * of the plane stands over darkened, along the shadow. `normals` may be omitted (shadow only). Pure.
 */
export function selfShadowPixels(px: Uint8ClampedArray, h: Int8Array, dx: number, dy: number, normals?: Float32Array): Uint8ClampedArray {
  const out = px.slice();
  const len = Math.hypot(dx, dy) || 1;
  const tx = -dx / len; // toward the sun
  const ty = -dy / len;
  const low = Math.min(1, len / 1.2); // a low sun rakes across the surfaces: stronger modelling
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const hi = h[y * SPRITE_W + x];
      if (hi < 0) continue;
      if (normals) {
        const j = y * SPRITE_W + x;
        const l = 1 + SELF_SHADOW.light * (0.4 + 0.6 * low) * (normals[j * 2] * tx + normals[j * 2 + 1] * ty);
        const i = j * 4;
        // Brightening eases off toward white (a lit surface never blows out), dimming is plain.
        const lift = (v: number) => (l >= 1 ? v + (255 - v) * (l - 1) * 0.6 : v * l);
        out[i] = lift(px[i]);
        out[i + 1] = lift(px[i + 1]);
        out[i + 2] = lift(px[i + 2]);
      }
      // Walk back up-sun from this pixel: is anything higher by the height it would take to shade it?
      for (let k = 1; k <= 6 - hi; k++) {
        const sx = Math.round(x - dx * k);
        const sy = Math.round(y - dy * k);
        if (sx < 0 || sy < 0 || sx >= SPRITE_W || sy >= SPRITE_H) break;
        if (h[sy * SPRITE_W + sx] >= hi + k) {
          const i = (y * SPRITE_W + x) * 4;
          out[i] = out[i] * SELF_SHADOW.darken;
          out[i + 1] = out[i + 1] * SELF_SHADOW.darken;
          out[i + 2] = out[i + 2] * SELF_SHADOW.darken; // neutral: shade on doped linen, not a grey film
          break;
        }
      }
    }
  }
  return out;
}

/** The frame to draw: the self-shadowed bake for this light (cached), or the plain frame with no sun. */
export function selfShadowed(sprites: PlaneSprites, frame: number, shadow: { x: number; y: number }, heading: number, strength: number): HTMLCanvasElement {
  const k = selfShadowKey(frame, shadow, heading, strength);
  if (!k) return sprites.frames[frame];
  let c = sprites.shaded.get(k.key);
  if (!c) {
    const baked = selfShadowPixels(sprites.pixels[frame], sprites.heights[frame], k.dx, k.dy, sprites.normals[frame]);
    c = paint(SPRITE_H, (set) => {
      for (let i = 0; i < SPRITE_W * SPRITE_H; i++) if (baked[i * 4 + 3]) set(i % SPRITE_W, Math.floor(i / SPRITE_W), [baked[i * 4], baked[i * 4 + 1], baked[i * 4 + 2], baked[i * 4 + 3]]);
    });
    sprites.shaded.set(k.key, c);
  }
  return c;
}

/** Pre-bake every direction for the level and gently banked frames at this sun (during loading). */
export function prewarmSelfShadow(sprites: PlaneSprites, shadow: { x: number; y: number }, strength: number): void {
  for (let f = BANK_STEPS - 3; f <= BANK_STEPS + 3; f++) {
    for (let d = 0; d < SELF_SHADOW.directions; d++) selfShadowed(sprites, f, shadow, (d / SELF_SHADOW.directions) * 2 * Math.PI, strength);
  }
}

/** Paints into a canvas with a 1-px transparent border: drawn rotated, Canvas antialiases the image's
 *  outer edge, so the border keeps that soft edge off the actual pixels. */
function paint(h: number, draw: (set: (x: number, y: number, c: RGBA) => void) => void): HTMLCanvasElement {
  const w = SPRITE_W + 2;
  const img = new ImageData(w, h + 2);
  draw((x, y, c) => img.data.set(c, ((y + 1) * w + x + 1) * 4));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h + 2;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas;
}

export function createPlaneSprites(): PlaneSprites {
  const banks = Array.from({ length: BANK_FRAMES }, (_, i) => i - BANK_STEPS);
  return {
    heights: banks.map(planeHeights),
    normals: banks.map(planeNormals),
    pixels: banks.map((b) => planePixels(b)),
    shaded: new Map(),
    frames: banks.map((b) => paint(SPRITE_H, (set) => drawPlane(b, set))),
    masks: banks.map((b) => {
      const m = new Uint8Array(SPRITE_W * SPRITE_H);
      drawPlane(b, (x, y) => (m[y * SPRITE_W + x] = 1));
      return m;
    }),
    // One-row strips, centred on the fuselage (columns 15–16).
    props: Array.from({ length: PROP.maxW + 1 }, (_, w) =>
      paint(1, (set) => {
        for (let x = 16 + OX - Math.ceil(w / 2), i = 0; i < w; i++) set(x + i, 0, C.prop);
      }),
    ),
  };
}
