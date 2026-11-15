// Pixel-art WWI instruments: black-faced dials with cream figures in brass bezels, and a liquid compass
// with a dark card and luminous markings read against a fixed lubber line. Each instrument repaints its
// own small canvas from a cached face, so the HUD just places them.

import { createPx, disc, line, plot, polar, text, textWidth, tinyText, tinyWidth, type Px, type RGBA } from '../core/pixels.ts';
import { needleAngle } from './instruments.ts';

export const C = {
  // Nickel-plated bezels and fittings, matching the watch's silver case.
  metal: [0x9c, 0x98, 0x82, 255],
  metalLit: [0xe2, 0xe0, 0xd6, 255],
  metalDark: [0x56, 0x54, 0x49, 255],
  gold: [0xc9, 0x9a, 0x3c, 255], // the compass's course index, painted gold
  goldLit: [0xf0, 0xcc, 0x6e, 255],
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
/** `glow`: the instrument's radium paint alone, for the night layer (filled only when drawn `luminous`). */
export type Instrument = { canvas: HTMLCanvasElement; glow: HTMLCanvasElement; size: number; draw: (reading: number, alert: Alert, luminous?: boolean) => void };

/**
 * Radium luminous paint, as on the needles, figures and main ticks of the period's instruments [VERIFY]:
 * by day it reads as the cream of the figures; in the dark it glows a pale yellow-green.
 */
export const RADIUM: RGBA = [0xb4, 0xe6, 0x84, 255];
/** Copy the radium-painted pixels of `px` (those in `paint`) into `out`, as glow; everything else clear. */
export function radiumOf(px: Px, out: Px, paint: RGBA = C.ink): void {
  const a = px.data;
  const o = out.data;
  o.fill(0);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] === paint[0] && a[i + 1] === paint[1] && a[i + 2] === paint[2] && a[i + 3]) o.set(RADIUM, i);
  }
}

/** Black face with a nickel ring lit from the top-left. */
function bezel(px: Px, c: number, r: number) {
  disc(px, c, c, r, (dx, dy, d) => (d > r - 2 ? (dx + dy < -2 ? C.metalLit : dx + dy > 2 ? C.metalDark : C.metal) : C.face));
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
  const glowPx = createPx(size, size);
  const glow = document.createElement('canvas');
  glow.width = glow.height = size;
  const glowCtx = glow.getContext('2d')!;
  const glowImg = new ImageData(glowPx.data, size, size);
  return {
    canvas,
    glow,
    size,
    draw(reading, alert, luminous = false) {
      px.data.fill(0);
      paint(px, reading, alert);
      ctx.putImageData(img, 0, 0);
      if (!luminous) return; // by day: no glow work at all
      radiumOf(px, glowPx);
      glowCtx.putImageData(glowImg, 0, 0);
    },
  };
}

/**
 * A round dial with a 270° scale. `marks` are tick fractions; `red` marks the danger part of the scale;
 * `ends` labels the two ends of the scale (e.g. E / F), set in from the end ticks so they don't collide.
 */
export function createDial(opts: { r: number; marks: number[]; red?: [number, number]; ends?: [string, string]; figures?: string[]; tiny?: boolean; nudge?: number[] }): Instrument {
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
  opts.figures?.forEach((s, i, all) => {
    // `tiny`: the 3×4 face, set a little further out, for a dial whose figures would crowd it.
    // The end figures sit a little beyond the end ticks, so the first and last stand well apart.
    const f = 0.5 + (i / (all.length - 1) - 0.5) * (opts.tiny ? 1.14 : 1);
    const p = polar(c, c, r - (opts.tiny ? 8 : 9), needleAngle(f));
    p.x += opts.nudge?.[i] ?? 0; // (px sideways, per figure: to sit one clear of a tick)
    if (opts.tiny) tinyText(face, Math.round(p.x - tinyWidth(s) / 2), Math.round(p.y - 2), s, C.ink);
    else text(face, Math.round(p.x - textWidth(s) / 2), Math.round(p.y - 2), s, C.ink);
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
    plot(px, c, c, C.metalLit); // needle hub
  });
}

/**
 * Liquid compass, seen from above: the card turns so the heading sits under the lubber line at the top.
 * Markings stay upright for legibility (ponytail: a real card's letters rotate with it; rotating 3×5
 * glyphs at pixel scale just smears them).
 */
export function createCompass(r: number, bearing: () => number | null = () => null): Instrument {
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
    // A manually set course index: its compass bearing stays fixed until the pilot consults the map.
    const course = bearing();
    if (course !== null) {
      const a = course - heading;
      // A filled gold wedge: every pixel inside the triangle from the tip to the two base points.
      const tip = polar(c, c, r - 5, a);
      const b1 = polar(c, c, r - 1, a - 0.14);
      const b2 = polar(c, c, r - 1, a + 0.14);
      const side = (ax: number, ay: number, bx: number, by: number, x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s1 = side(tip.x, tip.y, b1.x, b1.y, x, y);
          const s2 = side(b1.x, b1.y, b2.x, b2.y, x, y);
          const s3 = side(b2.x, b2.y, tip.x, tip.y, x, y);
          if ((s1 >= -0.5 && s2 >= -0.5 && s3 >= -0.5) || (s1 <= 0.5 && s2 <= 0.5 && s3 <= 0.5)) plot(px, x, y, C.gold);
        }
      }
      line(px, tip.x, tip.y, b1.x, b1.y, C.goldLit);
    }
    // Fixed lubber line at the top, and a glint on the glass.
    line(px, c, 1, c, 3, C.glint);
    plot(px, c - r + 5, c - r + 6, C.glint);
    plot(px, c - r + 6, c - r + 5, C.glint);
  });
}

// Every label in the cockpit (the dials' names, the HOLD switch, the watch's readout and date) is the
// same engraved ivorine plaque, made here.
export const PLAQUE_H = 9; // 5-px letters, 1 px of plate above and below, a 1-px bevelled edge
const PLATE: RGBA = [0xb8, 0xb5, 0xa6, 255]; // a strip of nickel-plated metal
const PLATE_LIT: RGBA = [0xe2, 0xe0, 0xd6, 255];
const PLATE_DARK: RGBA = [0x5e, 0x5c, 0x52, 255];
const ENGRAVED: RGBA = [0x1e, 0x1d, 0x19, 255];
export const toCanvas = (px: Px) => {
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  c.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  return c;
};

/** A small engraved ivorine plaque: cream face, dark rim, the letters cut in (dark, or red when hot). */
export function plaque(s: string, ink: RGBA = ENGRAVED): HTMLCanvasElement {
  // A small metal plate riveted on at each end: bevelled edge lit from the top-left, a domed rivet either
  // side of the engraved letters.
  const w = textWidth(s) + 12;
  const h = PLAQUE_H;
  const px = createPx(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) plot(px, x, y, x === 0 || y === 0 ? PLATE_LIT : x === w - 1 || y === h - 1 ? PLATE_DARK : PLATE);
  }
  for (const rx of [3, w - 4]) {
    plot(px, rx, 4, PLATE_DARK);
    plot(px, rx - 1, 3, PLATE_LIT);
    plot(px, rx, 3, PLATE_LIT);
    plot(px, rx - 1, 4, PLATE_LIT);
    plot(px, rx + 1, 5, PLATE_DARK);
    plot(px, rx, 5, PLATE_DARK);
  }
  text(px, 6, 2, s, ink);
  return toCanvas(px);
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

/** A simple spirit clinometer, rather than a later gyroscopic attitude indicator. */
export function createClinometer(r: number): Instrument {
  return instrument(2 * r + 1, (px, reading) => {
    bezel(px, r, r);
    for (let x = r - 9; x <= r + 9; x++) {
      const y = r - 1 + Math.round((x - r) ** 2 / 35);
      plot(px, x, y - 2, C.dim);
      plot(px, x, y + 2, C.dim);
    }
    for (const x of [r - 3, r + 3]) line(px, x, r - 4, x, r + 3, C.ink);
    const x = r + Math.round((Math.max(0, Math.min(1, reading)) - 0.5) * 16);
    disc(px, x, r - 1 + Math.round((x - r) ** 2 / 35), 1.5, () => C.metalLit);
  });
}
