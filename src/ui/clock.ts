// The cockpit watch, top-left: the time of day at a glance (hands, AM / PM aperture, sunset mark), with a
// digital readout and the date beneath. Its own module: reads the time, draws itself, nothing else.

import { createPx, disc, line, plot, polar, text, textWidth, type Px, type RGBA } from '../core/pixels.ts';
import { applyLight, litCanvas, type HudLight } from './light.ts';
import type { View } from '../render/display.ts';
import { C, label, RADIUM, radiumOf, type Instrument } from './gauges.ts';

/** What the clock shows. */
export type TimeOfDay = { hours: number; day: number; sunset: number; dateText: string };

/** 12-hour clock text, e.g. hours 14.5 → { clock: '2:30', ampm: 'PM' }. Pure. */
export function clockText(hours: number): { clock: string; ampm: string } {
  const total = Math.floor(hours * 60) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { clock: `${h12}:${String(total % 60).padStart(2, '0')}`, ampm: h24 < 12 ? 'AM' : 'PM' };
}

type Cached = { key: string; canvas: HTMLCanvasElement };
/** Re-render a text plate only when its text changes. */
// The time and date aren't cockpit fittings, just help for the player: plain cream text on a soft, see-through
// dark pad (no plate, bevel or rivets), so they read as an overlay rather than part of the plane.
const HELP_PAD: RGBA = [0x14, 0x13, 0x0f, 150];
const helpText = (s: string) => label(s, C.ink, 2, HELP_PAD);
const cached = (c: Cached, s: string): Cached => (c.key === s ? c : { key: s, canvas: helpText(s) });

export type ClockFace = { watch: ReturnType<typeof createWatch>; digital: Cached; date: Cached };

export const createClockFace = (): ClockFace => ({ watch: createWatch(27), digital: { key: '', canvas: helpText('') }, date: { key: '', canvas: helpText('') } });

/** Draw in the top-left corner, on whole game pixels. Phones get extra margin (notch, rounded corners). */
export function drawClock(ctx: CanvasRenderingContext2D, view: View, face: ClockFace, time: TimeOfDay, glow?: CanvasRenderingContext2D, light?: HudLight): void {
  ctx.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  face.watch.sunset = time.sunset;
  face.watch.draw(time.hours, 0, !!glow, light);
  face.digital = cached(face.digital, clockText(time.hours).clock);
  face.date = cached(face.date, time.dateText);
  const left = view.compact ? 14 : 8;
  const top = view.compact ? (view.uiW > view.uiH ? 4 : 26) : 8;
  // One centre line for the watch face, the readout and the date, far enough in that the widest fits.
  const half = (c: HTMLCanvasElement) => Math.ceil(c.width / 2);
  const centre = left + Math.max(face.watch.cx, half(face.date.canvas), half(face.digital.canvas));
  ctx.drawImage(face.watch.canvas, centre - face.watch.cx, top);
  if (glow) {
    glow.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
    glow.drawImage(face.watch.glow, centre - face.watch.cx, top);
  }
  const y = top + face.watch.canvas.height + 2;
  ctx.drawImage(litCanvas(face.digital.canvas, light), centre - half(face.digital.canvas), y);
  ctx.drawImage(litCanvas(face.date.canvas, light), centre - half(face.date.canvas), y + face.digital.canvas.height + 1);
}

const STEM = 9;

/** The watch's drawing, free of any canvas: its fixed face, and `paint` for the moving parts (sunset mark,
 * AM / PM aperture, hands). The cockpit and the desk in the barn both draw from it, so they are one watch. */
function watchFace(r: number) {
  const size = 2 * r + 1;
  const c = r;
  const cy = r + STEM;
  const metal: RGBA = [0x9c, 0x98, 0x82, 255];
  const shadow: RGBA = [0x56, 0x54, 0x49, 255];
  const face: RGBA = [0x23, 0x24, 0x20, 255];
  const staticFace = createPx(size, size + STEM);
  // Ribbed brass crown above a nickel-coloured winding stem.
  for (let y = 2; y < STEM + 1; y++) for (let x = c - 2; x <= c + 2; x++) plot(staticFace, x, y, x < c ? C.glint : metal);
  disc(staticFace, c, 3, 3, (dx) => Math.round(dx) % 2 === 0 ? C.metalLit : C.metalDark);
  disc(staticFace, c, cy, r, (dx, dy, d) => d > r - 1 ? (dx + dy < 0 ? C.glint : shadow) : d > r - 3 ? metal : face);
  const angle = (hour: number) => (hour % 12) / 12 * 2 * Math.PI;
  for (let tick = 0; tick < 60; tick++) {
    const a = tick / 60 * 2 * Math.PI;
    const outer = polar(c, cy, r - 4, a);
    const inner = polar(c, cy, r - (tick % 5 === 0 ? 5 : 4), a);
    line(staticFace, inner.x, inner.y, outer.x, outer.y, tick % 5 === 0 ? C.ink : C.dim);
  }
  for (let hr = 1; hr <= 12; hr++) {
    const s = String(hr);
    const p = polar(c, cy, r - 8, angle(hr)); // set well in from the minute track, so the figures stand clear
    text(staticFace, Math.round(p.x - textWidth(s) / 2), Math.round(p.y - 2), s, C.ink);
  }
  const paint = (px: Px, hours: number, sunset: number) => {
    const mark = polar(c, cy, r - 1, angle(sunset));
    plot(px, mark.x, mark.y, C.red);
    // Readable day/night aperture where the reference's small seconds dial sits.
    const tag = clockText(hours).ampm;
    const tw = textWidth(tag);
    for (let y = cy + 5; y <= cy + 13; y++) for (let x = c - 7; x <= c + 7; x++) {
      plot(px, x, y, y === cy + 5 || y === cy + 13 || x === c - 7 || x === c + 7 ? metal : C.face);
    }
    text(px, c - Math.floor(tw / 2), cy + 7, tag, C.ink);
    // Hands: a long bright minute hand and a short broad hour hand, both clear of the figures.
    const minute = polar(c, cy, r - 7, (hours % 1) * 2 * Math.PI);
    const hour = polar(c, cy, r - 13, angle(hours));
    line(px, c, cy, minute.x, minute.y, C.metalLit);
    line(px, c + 1, cy, minute.x + 1, minute.y, C.metal);
    line(px, c, cy, hour.x, hour.y, C.glint);
    line(px, c + 1, cy, hour.x + 1, hour.y, C.glint);
    line(px, c, cy + 1, hour.x, hour.y + 1, metal);
    disc(px, c, cy, 1.5, () => C.metal); // the pivot
    return { minute, hour };
  };
  /** Everything `paint` depends on, as it lands on whole pixels (every line and dot rounds its ends): the
   * same key, the same picture. The watch repaints only when it changes (the hands move a pixel). */
  const key = (hours: number, sunset: number) => {
    const mark = polar(c, cy, r - 1, angle(sunset));
    const minute = polar(c, cy, r - 7, (hours % 1) * 2 * Math.PI);
    const hour = polar(c, cy, r - 13, angle(hours));
    return `${Math.round(mark.x)},${Math.round(mark.y)},${clockText(hours).ampm},${Math.round(minute.x)},${Math.round(minute.y)},${Math.round(hour.x)},${Math.round(hour.y)}`;
  };
  return { size, c, cy, staticFace, paint, key };
}

/** The watch as a plain raster at a given time, for the desk in the barn. Pure. */
/** The key the watch repaints on (see watchFace `key`): for tests. */
export const watchKey = (r: number, hours: number, sunset: number): string => watchFace(r).key(hours, sunset);

export function watchPx(r: number, hours: number, sunset: number): Px {
  const f = watchFace(r);
  const px = createPx(f.size, f.size + STEM);
  px.data.set(f.staticFace.data);
  f.paint(px, hours, sunset);
  return px;
}


/** Mark V-inspired cockpit watch; the user's reference has a long stem and no bow.
 * The AM / PM aperture replaces its subsidiary seconds dial as a deliberate game aid; no seconds hand. */
export function createWatch(r: number): Instrument & { sunset: number; cx: number } {
  const { size, c, cy, staticFace, paint, key } = watchFace(r);
  let shown = '';
  const px = createPx(size, size + STEM);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + STEM;
  const ctx = canvas.getContext('2d')!;
  const img = new ImageData(px.data, size, size + STEM);
  const glowPx = createPx(size, size + STEM);
  const glowImg = new ImageData(glowPx.data, size, size + STEM);
  const glow = document.createElement('canvas');
  glow.width = size;
  glow.height = size + STEM;
  const watch = {
    canvas, glow, size, cx: c, sunset: 19.5,
    draw(hours: number, _alert = 0, luminous = false, light?: HudLight) {
      const k = `${key(hours, watch.sunset)}|${luminous}|${light?.key ?? ''}`;
      if (k === shown) return; // the same picture as last frame
      shown = k;
      px.data.set(staticFace.data);
      const { minute, hour } = paint(px, hours, watch.sunset);
      if (luminous) {
        // Extract luminous paint before tinting the visible metal and face.
        radiumOf(px, glowPx);
        for (const p of [minute, hour]) line(glowPx, c, cy, p.x, p.y, RADIUM);
        glow.getContext('2d')!.putImageData(glowImg, 0, 0);
      }
      applyLight(px, light);
      ctx.putImageData(img, 0, 0);
    },
  };
  return watch;
}
