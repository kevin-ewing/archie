// Pixel-art WWI instruments: black-faced dials with cream figures in brass bezels, and a liquid compass
// with a dark card and luminous markings read against a fixed lubber line. Each instrument repaints its
// own small canvas from a cached face, so the HUD just places them.

import { createPx, disc, line, plot, polar, text, textWidth, type Px, type RGBA } from '../core/pixels.ts';
import { needleAngle } from './instruments.ts';

export const C = {
  brass: [0xb0, 0x8d, 0x4a, 255],
  brassLit: [0xd8, 0xb8, 0x72, 255],
  brassDark: [0x6e, 0x55, 0x2b, 255],
  face: [0x17, 0x16, 0x13, 255],
  ink: [0xe8, 0xdf, 0xc4, 255], // cream / radium-paint figures
  dim: [0x8a, 0x84, 0x70, 255],
  red: [0xb8, 0x36, 0x2b, 255],
  redDim: [0x6e, 0x24, 0x1d, 255],
  card: [0x22, 0x24, 0x22, 255],
  north: [0xd8, 0x6a, 0x48, 255],
  glint: [0xf2, 0xee, 0xe2, 255],
} as const satisfies Record<string, RGBA>;

/** alert: 0 normal, 1 warning (red zone lit), 2 alarm (red zone lit and the bezel flashes red). */
export type Alert = 0 | 1 | 2;
export type Instrument = { canvas: HTMLCanvasElement; size: number; draw: (reading: number, alert: Alert) => void };

/** Black face with a brass ring lit from the top-left. */
function bezel(px: Px, c: number, r: number) {
  disc(px, c, c, r, (dx, dy, d) => (d > r - 2 ? (dx + dy < -2 ? C.brassLit : dx + dy > 2 ? C.brassDark : C.brass) : C.face));
}

/** Repaint just the ring red, for an alarm. */
function alarmRing(px: Px, c: number, r: number) {
  disc(px, c, c, r, (dx, dy, d) => (d > r - 2 ? (dx + dy < 0 ? C.red : C.redDim) : null));
}

function instrument(size: number, paint: (px: Px, reading: number, alert: Alert) => void): Instrument {
  const px = createPx(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = new ImageData(px.data, size, size);
  return {
    canvas,
    size,
    draw(reading, alert) {
      px.data.fill(0);
      paint(px, reading, alert);
      ctx.putImageData(img, 0, 0);
    },
  };
}

/**
 * A round dial with a 270° scale. `marks` are tick fractions; `red` marks the danger part of the scale;
 * `ends` labels the two ends of the scale (e.g. E / F), set in from the end ticks so they don't collide.
 */
export function createDial(opts: { r: number; marks: number[]; red?: [number, number]; ends?: [string, string] }): Instrument {
  const { r } = opts;
  const size = 2 * r + 1;
  const c = r;
  const face = createPx(size, size);
  bezel(face, c, r);
  for (const f of opts.marks) {
    const a = needleAngle(f);
    const o = polar(c, c, r - 3, a);
    const i = polar(c, c, r - 5, a);
    line(face, i.x, i.y, o.x, o.y, C.ink);
  }
  opts.ends?.forEach((s, i) => {
    const p = polar(c, c, r - 6, (i === 0 ? -1 : 1) * 0.56 * Math.PI); // just below the 9 and 3 o'clock line
    text(face, Math.round(p.x - textWidth(s) / 2), Math.round(p.y - 2), s, C.dim);
  });
  return instrument(size, (px, reading, alert) => {
    px.data.set(face.data);
    if (alert === 2) alarmRing(px, c, r);
    if (opts.red) {
      // The red zone of the scale; it pulses when the instrument is warning.
      const [from, to] = opts.red;
      for (let f = from; f <= to; f += 0.01) {
        const p = polar(c, c, r - 3, needleAngle(f));
        plot(px, p.x, p.y, alert ? C.red : C.redDim);
      }
    }
    const a = needleAngle(reading);
    const tip = polar(c, c, r - 4, a);
    const tail = polar(c, c, 2, a + Math.PI);
    line(px, tail.x, tail.y, tip.x, tip.y, C.ink);
    plot(px, c, c, C.brassLit); // needle hub
  });
}

/**
 * Liquid compass, seen from above: the card turns so the heading sits under the lubber line at the top.
 * Markings stay upright for legibility (ponytail: a real card's letters rotate with it; rotating 3×5
 * glyphs at pixel scale just smears them).
 */
export function createCompass(r: number): Instrument {
  const size = 2 * r + 1;
  const c = r;
  return instrument(size, (px, heading) => {
    bezel(px, c, r);
    disc(px, c, c, r - 3, () => C.card);
    for (let deg = 0; deg < 360; deg += 30) {
      const a = (deg * Math.PI) / 180 - heading; // bearing on the card → angle on screen
      const major = deg % 90 === 0;
      const o = polar(c, c, r - 3, a);
      const i = polar(c, c, r - (major ? 6 : 4), a);
      line(px, i.x, i.y, o.x, o.y, major ? C.ink : C.dim);
    }
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([s, deg]) => {
      const p = polar(c, c, r - 9, (Number(deg) * Math.PI) / 180 - heading);
      text(px, Math.round(p.x - textWidth(String(s)) / 2), Math.round(p.y - 2), String(s), s === 'N' ? C.north : C.ink);
    });
    // Fixed lubber line at the top, and a glint on the glass.
    line(px, c, 1, c, 3, C.glint);
    plot(px, c - r + 5, c - r + 6, C.glint);
    plot(px, c - r + 6, c - r + 5, C.glint);
  });
}

/** A line of pixel text as a small canvas, optionally on a padded plate. */
export function label(s: string, ink: RGBA, pad = 0, plate?: RGBA): HTMLCanvasElement {
  const px = createPx(textWidth(s) + 2 * pad, 5 + 2 * pad);
  if (plate) px.data.forEach((_, i) => (px.data[i] = plate[i % 4]));
  text(px, pad, pad, s, ink);
  const canvas = document.createElement('canvas');
  canvas.width = px.w;
  canvas.height = px.h;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  return canvas;
}
