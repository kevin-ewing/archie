// The pocket watch, top-left: the time of day at a glance (hands, AM / PM tag, sunset mark), with a
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

export const createClockFace = (): ClockFace => ({ watch: createWatch(14), digital: { key: '', canvas: label('', INK) }, date: { key: '', canvas: label('', INK) } });

/** Draw in the top-left corner, on whole game pixels. Phones get extra margin (notch, rounded corners). */
export function drawClock(ctx: CanvasRenderingContext2D, view: View, face: ClockFace, time: TimeOfDay): void {
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  face.watch.sunset = time.sunset;
  face.watch.draw(time.hours, 0);
  face.digital = cached(face.digital, clockText(time.hours).clock);
  face.date = cached(face.date, time.dateText);
  const left = view.compact ? 14 : 8;
  const top = view.compact ? 26 : 8;
  // One centre line for the watch face, the readout and the date, far enough in that the widest fits.
  const half = (c: HTMLCanvasElement) => Math.ceil(c.width / 2);
  const centre = left + Math.max(face.watch.cx, half(face.date.canvas), half(face.digital.canvas));
  ctx.drawImage(face.watch.canvas, centre - face.watch.cx, top);
  const y = top + face.watch.canvas.height + 2;
  ctx.drawImage(face.digital.canvas, centre - half(face.digital.canvas), y);
  ctx.drawImage(face.date.canvas, centre - half(face.date.canvas), y + face.digital.canvas.height + 1);
}

/**
 * Pocket watch (pilots strapped one in, or carried their own): white enamel face, blued-steel hands, a
 * brass case with its bow (ring) on top, a red mark on the rim at sunset (time to be heading home), and a
 * small brass AM / PM tag just off the rim at half past ten.
 * `draw(hours)` sets the hands and the tag; `sunset` (solar hours) places the mark; `cx` is the face's
 * centre column in the canvas (the tag makes the canvas wider on the left).
 */
export function createWatch(r: number): Instrument & { sunset: number; cx: number } {
  const size = 2 * r + 1;
  const BOW = 4; // rows above the case for the bow
  const TAG = 10; // extra columns on the left for the AM / PM tag
  const W = size + TAG;
  const px = createPx(W, size + BOW);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = size + BOW;
  const ctx = canvas.getContext('2d')!;
  const img = new ImageData(px.data, W, size + BOW);
  const c = r + TAG;
  const cy = r + BOW;
  const enamel: RGBA = [0xe9, 0xe2, 0xcd, 255];
  const steel: RGBA = [0x1d, 0x2a, 0x4a, 255];
  const tickInk: RGBA = [0x3a, 0x36, 0x30, 255];
  const tagInk: RGBA = [0x2a, 0x22, 0x18, 255];
  const watch = {
    canvas,
    size,
    cx: r + TAG,
    sunset: 19.5,
    draw(hours: number) {
      px.data.fill(0);
      // Bow: a small brass ring above the case, and its stem.
      disc(px, c, 2, 2, (_, __, d) => (d > 1 ? C.brass : null));
      plot(px, c, BOW, C.brassDark);
      disc(px, c, cy, r, (dx, dy, d) => (d > r - 2 ? (dx + dy < -2 ? C.brassLit : dx + dy > 2 ? C.brassDark : C.brass) : enamel));
      const angle = (h: number) => ((h % 12) / 12) * 2 * Math.PI;
      for (let hr = 0; hr < 12; hr++) {
        const a = angle(hr);
        const o = polar(c, cy, r - 3, a);
        const i = polar(c, cy, r - (hr % 3 === 0 ? 5 : 4), a);
        line(px, i.x, i.y, o.x, o.y, tickInk);
      }
      const mark = polar(c, cy, r - 1, angle(watch.sunset)); // on the case rim
      plot(px, mark.x, mark.y, C.red);
      const minute = polar(c, cy, r - 4, (hours % 1) * 2 * Math.PI);
      const hour = polar(c, cy, r - 7, angle(hours));
      line(px, c, cy, minute.x, minute.y, steel);
      line(px, c, cy, hour.x, hour.y, steel);
      line(px, c + 1, cy, hour.x + 1, hour.y, steel); // the hour hand is the stubbier, thicker one
      plot(px, c, cy, C.brassDark);
      // AM / PM tag at 10:30, just touching the case.
      const label = hours % 24 < 12 ? 'AM' : 'PM';
      const tw = textWidth(label) + 4;
      const th = 9;
      const at = polar(c, cy, r + 5, -Math.PI / 4);
      const tx = Math.max(0, Math.round(at.x - tw / 2));
      const ty = Math.max(0, Math.round(at.y - th / 2));
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const edge = x === 0 || y === 0 || x === tw - 1 || y === th - 1;
          plot(px, tx + x, ty + y, edge ? (x + y < 3 ? C.brassLit : C.brassDark) : y < 2 ? C.brassLit : C.brass);
        }
      }
      text(px, tx + 2, ty + 2, label, tagInk);
      ctx.putImageData(img, 0, 0);
    },
  };
  return watch;
}
