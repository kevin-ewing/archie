// Procedural pixel-art BE.2c sprite (abstract for now), top-down, nose up.
// Seventeen bank frames, from hard left through level to hard right, plus matching shadow silhouettes.

export const SPRITE_W = 32;
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
 * The BE.2c from above, nose up, banked b steps (−BANK_STEPS hard left … BANK_STEPS hard right).
 * Light comes from the north-west (upper left): leading edges and the left of the fuselage catch it.
 * In a bank the rising wing turns into the light and the dropping wing into shade, a little more at each
 * step, and both wings foreshorten as they tip.
 */
function drawPlane(b: number, set: (x: number, y: number, c: RGBA) => void) {
  const f = b / BANK_STEPS; // −1 … 1
  const k = foreshorten(b);
  const shade = Math.abs(f) * 2; // how many tone steps the wings shift at this bank (0 … 2)
  const tone = (side: -1 | 1, base: number) => linen(base - Math.sign(f) * side * shade);
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
        set(col(side, i), y, tone(side, t));
      });
    }
  };

  const hs = Math.round(15 * k); // upper-wing half span
  // Lower wing first: under the fuselage and in the upper wing's shadow, staggered behind it.
  for (const side of [-1, 1] as const) wing(side, hs - 1 - dropped(side), [11, 12, 13], [1, 1, 0], true, 2);

  // Fuselage: the engine cowl and its exhausts, the observer's cockpit under the wing's trailing edge,
  // the pilot's behind, tapering back to the tail. Its left side catches the light.
  set(15, 3, C.nose);
  set(16, 3, C.nose);
  for (let y = 4; y <= 6; y++) for (let x = 14; x <= 17; x++) set(x, y, C.metal[x === 14 ? 2 : x === 17 ? 0 : 1]);
  set(13, 5, C.exhaust);
  set(18, 5, C.exhaust);
  for (let y = 7; y <= 22; y++) {
    const wide = y <= 17; // the fuselage narrows behind the pilot
    for (let x = wide ? 14 : 15; x <= (wide ? 17 : 16); x++) {
      const edge = x === (wide ? 14 : 15) ? 3 : x === (wide ? 17 : 16) ? 1 : 2; // lit left, shaded right
      set(x, y, C.tones[y >= 19 ? edge - 1 : edge]);
    }
  }
  const cockpit = (y: number, head: boolean) => {
    set(14, y, C.rim);
    set(17, y, C.rim);
    set(15, y, head ? C.head : C.cockpit);
    set(16, y, C.cockpit);
    set(15, y + 1, C.cockpit);
    set(16, y + 1, C.cockpit);
  };
  cockpit(14, true); // the pilot
  for (const side of [-1, 1] as const) {
    const span = hs - dropped(side);
    wing(side, span, [7, 8, 9, 10], [4, 3, 2, 1], true, 0.55); // upper wing, over the fuselage (cabane centre section)
    // Roundel: blue ring, white, red centre (a smaller one once the wing is foreshortened).
    const rx = col(side, span - 4);
    if (hs >= 10) {
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if ((dy === 0 || dy === 3) && Math.abs(dx) === 2) continue;
          const ring = dy === 0 || dy === 3 || Math.abs(dx) === 2;
          set(rx + dx, 7 + dy, ring ? C.blue : dx === 0 ? C.red : C.white);
        }
      }
    } else if (hs >= 7) {
      for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) set(rx + dx, 8 + dy, dx === 0 && dy === 1 ? C.red : C.blue);
    }
    wing(side, Math.round(7 * k), [19, 20, 21], [3, 2, 1], false, 0.3); // tailplane and elevators
  }
  cockpit(11, false); // the observer's, just behind the upper wing
  // Fin and rudder, edge on from above: a dark line, the rudder's stripes at its tip.
  set(15, 22, C.tones[0]);
  set(16, 22, C.tones[0]);
  set(15, 23, C.blue);
  set(16, 23, C.red);
}

/** The sprite at bank step b as RGBA pixels, SPRITE_W × SPRITE_H (for previews and tests). */
export function planePixels(b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SPRITE_W * SPRITE_H * 4);
  drawPlane(b, (x, y, c) => px.set(c, (y * SPRITE_W + x) * 4));
  return px;
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
    frames: banks.map((b) => paint(SPRITE_H, (set) => drawPlane(b, set))),
    masks: banks.map((b) => {
      const m = new Uint8Array(SPRITE_W * SPRITE_H);
      drawPlane(b, (x, y) => (m[y * SPRITE_W + x] = 1));
      return m;
    }),
    // One-row strips, centred on the fuselage (columns 15–16).
    props: Array.from({ length: PROP.maxW + 1 }, (_, w) =>
      paint(1, (set) => {
        for (let x = 16 - Math.ceil(w / 2), i = 0; i < w; i++) set(x + i, 0, C.prop);
      }),
    ),
  };
}
