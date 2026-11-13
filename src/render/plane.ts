// Procedural pixel-art BE.2c sprite (abstract for now), top-down, nose up.
// Nine bank frames, from hard left through level to hard right, plus matching shadow silhouettes.

export const SPRITE_W = 32;
export const SPRITE_H = 24;
/** The propeller is redrawn every frame at a random width in this range, so it reads as spinning. */
export const PROP = { minW: 4, maxW: 12, row: 2 };

type RGBA = readonly [number, number, number, number];

const C = {
  nose: [0x55, 0x53, 0x4d, 255],
  metal: [0x7a, 0x77, 0x6e, 255],
  prop: [0xb9, 0xb5, 0xaa, 170], // spinning blur
  cockpit: [0x4a, 0x3f, 0x30, 255],
  tones: [
    [0x8d, 0x7d, 0x5a, 255],
    [0xa1, 0x90, 0x6a, 255],
    [0xcd, 0xbd, 0x92, 255],
    [0xe4, 0xd6, 0xad, 255],
    [0xf0, 0xe6, 0xc6, 255],
  ],
  blue: [0x2d, 0x4a, 0x8c, 255],
  red: [0xb0, 0x30, 0x2a, 255],
} as const;

export type PlaneSprites = {
  frames: HTMLCanvasElement[];
  masks: Uint8Array[]; // SPRITE_W×SPRITE_H silhouettes (1 = solid), for the cast shadow
  props: HTMLCanvasElement[]; // indexed by width in pixels (index < PROP.minW unused)
};

/** Bank frames per side: b runs −BANK_STEPS … BANK_STEPS (hard left … level … hard right). */
export const BANK_STEPS = 4;
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

function drawPlane(b: number, set: (x: number, y: number, c: RGBA) => void) {
  const k = foreshorten(b); // wings foreshorten as the plane tips
  // In a right bank (b > 0) the left wing rises into the light and the right wing drops into shade,
  // more so the harder it banks.
  const shift = Math.abs(b) >= BANK_STEPS - 1 ? 2 : Math.abs(b) >= 1 ? 1 : 0;
  const tone = (side: -1 | 1, base: number) => C.tones[Math.min(4, Math.max(0, base - Math.sign(b) * side * shift))];
  const col = (side: -1 | 1, i: number) => (side < 0 ? 15 - i : 16 + i); // i-th column out from the fuselage

  // A wing panel: rows top…bottom with a tone per row; tip corners rounded off.
  const wing = (side: -1 | 1, span: number, rows: number[], tones: number[]) => {
    for (let i = 0; i <= span; i++) {
      rows.forEach((y, r) => {
        const corner = i === span && (r === 0 || r === rows.length - 1);
        if (!corner) set(col(side, i), y, tone(side, tones[r]));
      });
    }
  };

  const hs = Math.round(15 * k); // upper-wing half span
  for (const side of [-1, 1] as const) {
    // Lower wing first: it sits under the fuselage and in the upper wing's shadow, staggered behind it.
    const lowered = Math.abs(b) >= BANK_STEPS - 1 && Math.sign(b) === side ? 1 : 0; // lowered tip a pixel shorter at hard bank
    wing(side, hs - 1 - lowered, [11, 12, 13], [0, 1, 0]);
  }
  for (let y = 3; y <= 22; y++) {
    const c = y === 3 ? C.nose : y <= 6 ? C.metal : y === 14 || y === 15 ? C.cockpit : C.tones[2];
    set(15, y, c);
    set(16, y, c);
    if (y >= 4 && y <= 6) {
      set(14, y, C.metal); // engine bulk
      set(17, y, C.metal);
    }
  }
  for (const side of [-1, 1] as const) {
    const lowered = Math.abs(b) >= BANK_STEPS - 1 && Math.sign(b) === side ? 1 : 0;
    const span = hs - lowered;
    wing(side, span, [7, 8, 9, 10], [3, 2, 2, 1]); // upper wing, over the fuselage (cabane centre section)
    if (span >= 7) {
      const rx = col(side, span - 3);
      for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) set(rx + dx, 8 + dy, C.blue);
      set(rx, 9, C.red);
    }
    wing(side, Math.round(7 * k), [19, 20, 21], [3, 2, 1]); // tailplane
  }
  set(15, 23, C.tones[0]); // rudder
  set(16, 23, C.tones[0]);
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
