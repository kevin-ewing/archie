// The cockpit watch, top-left: the time of day at a glance (hands, AM / PM aperture, sunset mark), with a
// digital readout and the date beneath. Its own module: reads the time, draws itself, nothing else.

import { createPx, disc, line, plot, polar, text, textWidth, type RGBA } from '../core/pixels.ts';
import type { View } from '../render/display.ts';
import { C, label, type Instrument } from './gauges.ts';

/** What the clock shows. */
export type TimeOfDay = { hours: number; day: number; sunset: number; dateText: string };

/** 12-hour clock text, e.g. hours 14.5 → { clock: '2:30', ampm: 'PM' }. Pure. */
export function clockText(hours: number): { clock: string; ampm: string } {
  const total = Math.floor(hours * 60) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { clock: `${h12}:${String(total % 60).padStart(2, '0')}`, ampm: h24 < 12 ? 'AM' : 'PM' };
}

const INK: RGBA = [0xd8, 0xcf, 0xb4, 255];
const PLATE: RGBA = [0x14, 0x13, 0x0f, 190];
type Cached = { key: string; canvas: HTMLCanvasElement };
/** Re-render a text plate only when its text changes. */
const cached = (c: Cached, s: string): Cached => (c.key === s ? c : { key: s, canvas: label(s, INK, 2, PLATE) });

export type ClockFace = { watch: ReturnType<typeof createWatch>; digital: Cached; date: Cached };

export const createClockFace = (): ClockFace => ({ watch: createWatch(22), digital: { key: '', canvas: label('', INK) }, date: { key: '', canvas: label('', INK) } });

/** Draw in the top-left corner, on whole game pixels. Phones get extra margin (notch, rounded corners). */
export function drawClock(ctx: CanvasRenderingContext2D, view: View, face: ClockFace, time: TimeOfDay): void {
  ctx.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  face.watch.sunset = time.sunset;
  face.watch.draw(time.hours, 0);
  face.digital = cached(face.digital, clockText(time.hours).clock);
  face.date = cached(face.date, time.dateText);
  const left = view.compact ? 14 : 8;
  const top = view.compact ? (view.uiW > view.uiH ? 4 : 26) : 8;
  // One centre line for the watch face, the readout and the date, far enough in that the widest fits.
  const half = (c: HTMLCanvasElement) => Math.ceil(c.width / 2);
  const centre = left + Math.max(face.watch.cx, half(face.date.canvas), half(face.digital.canvas));
  ctx.drawImage(face.watch.canvas, centre - face.watch.cx, top);
  const y = top + face.watch.canvas.height + 2;
  ctx.drawImage(face.digital.canvas, centre - half(face.digital.canvas), y);
  ctx.drawImage(face.date.canvas, centre - half(face.date.canvas), y + face.digital.canvas.height + 1);
}

/** Mark V-inspired cockpit watch; the user's reference has a long stem and no bow.
 * The AM / PM aperture replaces its subsidiary seconds dial as a deliberate game aid. */
export function createWatch(r: number): Instrument & { sunset: number; cx: number } {
  const size = 2 * r + 1;
  const stem = 9;
  const px = createPx(size, size + stem);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + stem;
  const ctx = canvas.getContext('2d')!;
  const img = new ImageData(px.data, size, size + stem);
  const c = r;
  const cy = r + stem;
  const metal: RGBA = [0x9c, 0x98, 0x82, 255];
  const shadow: RGBA = [0x56, 0x54, 0x49, 255];
  const face: RGBA = [0x23, 0x24, 0x20, 255];
  const staticFace = createPx(size, size + stem);
  // Ribbed brass crown above a nickel-coloured winding stem.
  for (let y = 2; y < stem + 1; y++) for (let x = c - 2; x <= c + 2; x++) plot(staticFace, x, y, x < c ? C.glint : metal);
  disc(staticFace, c, 3, 3, (dx) => Math.round(dx) % 2 === 0 ? C.brassLit : C.brassDark);
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
    const p = polar(c, cy, r - 6, angle(hr));
    text(staticFace, Math.round(p.x - textWidth(s) / 2), Math.round(p.y - 2), s, C.ink);
  }
  const watch = {
    canvas, size, cx: c, sunset: 19.5,
    draw(hours: number) {
      px.data.set(staticFace.data);
      const mark = polar(c, cy, r - 1, angle(watch.sunset));
      plot(px, mark.x, mark.y, C.red);
      // Readable day/night aperture where the reference's small seconds dial sits.
      const tag = clockText(hours).ampm;
      const tw = textWidth(tag);
      for (let y = cy + 3; y <= cy + 10; y++) for (let x = c - 7; x <= c + 7; x++) {
        plot(px, x, y, y === cy + 3 || y === cy + 10 || x === c - 7 || x === c + 7 ? metal : C.face);
      }
      text(px, c - Math.floor(tw / 2), cy + 5, tag, C.ink);
      const minute = polar(c, cy, r - 6, (hours % 1) * 2 * Math.PI);
      const hour = polar(c, cy, r - 10, angle(hours));
      line(px, c, cy, minute.x, minute.y, C.brassLit);
      line(px, c, cy, hour.x, hour.y, metal);
      line(px, c + 1, cy, hour.x + 1, hour.y, metal);
      disc(px, c, cy, 1, () => C.brass);
      ctx.putImageData(img, 0, 0);
    },
  };
  return watch;
}
