// The instrument board: layout only. Which instruments, in what order, where, at what breakpoint.
// Readings come from instruments.ts; the dials themselves from gauges.ts.

import type { View } from '../render/display.ts';
import { hash } from '../core/noise.ts';
import { INSTRUMENTS, type EngineWarning, type Instruments } from './instruments.ts';
import { createCompass, createDial, createWatch, type Alert, type Instrument } from './gauges.ts';
import { createPx, text, textWidth, type RGBA } from '../core/pixels.ts';

const LABEL_INK: RGBA = [0xd8, 0xcf, 0xb4, 255];
const LABEL_HOT: RGBA = [0xd8, 0x4a, 0x38, 255];
const LABEL_H = 7; // 5-px text + 2-px gap under the dial
const GAP = 5;

type Slot = {
  inst: Instrument;
  labels?: [HTMLCanvasElement, HTMLCanvasElement]; // normal, hot
  read: (s: Instruments) => number;
  /** Alert level for this dial, given the engine warning and a blink phase. */
  alert: (s: Instruments, warning: EngineWarning, blink: boolean) => Alert;
  /** Does this dial shake with a rough-running engine? */
  engine?: boolean;
};
type Cached = { key: string; canvas: HTMLCanvasElement };
export type Hud = { slots: Slot[]; watch: ReturnType<typeof createWatch>; date: Cached; digital: Cached; ampm: Cached };

/** What the watch and date plate show. */
export type TimeOfDay = { hours: number; day: number; sunset: number; dateText: string };

function label(s: string, ink: RGBA, pad = 0, plate?: RGBA): HTMLCanvasElement {
  const px = createPx(textWidth(s) + 2 * pad, 5 + 2 * pad);
  if (plate) px.data.forEach((_, i) => (px.data[i] = plate[i % 4]));
  text(px, pad, pad, s, ink);
  const canvas = document.createElement('canvas');
  canvas.width = px.w;
  canvas.height = px.h;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  return canvas;
}
const labels = (s: string): [HTMLCanvasElement, HTMLCanvasElement] => [label(s, LABEL_INK), label(s, LABEL_HOT)];

const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
// Engine dials: warning → red zone blinks; overheated → red zone lit, bezel flashes.
const engineAlert = (warning: EngineWarning, blink: boolean): Alert => (warning === 2 ? (blink ? 2 : 1) : warning === 1 && blink ? 1 : 0);

const PLATE: RGBA = [0x14, 0x13, 0x0f, 190];

/** 12-hour clock text, e.g. hours 14.5 → { clock: '2:30', ampm: 'PM' }. Pure. */
export function clockText(hours: number): { clock: string; ampm: string } {
  const total = Math.floor(hours * 60) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { clock: `${h12}:${String(total % 60).padStart(2, '0')}`, ampm: h24 < 12 ? 'AM' : 'PM' };
}

/** Re-render a text plate only when its text changes. */
const cached = (c: Cached, text: string): Cached => (c.key === text ? c : { key: text, canvas: label(text, LABEL_INK, 2, PLATE) });

export function createHud(): Hud {
  return {
    watch: createWatch(14),
    date: { key: '', canvas: label('', LABEL_INK) },
    digital: { key: '', canvas: label('', LABEL_INK) },
    ampm: { key: '', canvas: label('', LABEL_INK) },
    slots: [
      { inst: createCompass(17), read: (s) => s.compass, alert: () => 0 },
      {
        // Rev indicator: 0 to 2,000 rpm.
        inst: createDial({ r: 13, marks: QUARTERS, red: [0.9, 1] }),
        labels: labels('RPM'),
        read: (s) => s.rpm + s.shake.rpm,
        alert: (_, w, blink) => engineAlert(w, blink),
        engine: true,
      },
      {
        // Engine temperature, in the style of the period's transmitting thermometer.
        inst: createDial({ r: 13, marks: QUARTERS, red: [INSTRUMENTS.tempRed, 1] }),
        labels: labels('TEMP'),
        read: (s) => s.temp + s.shake.temp,
        alert: (s, w, blink) => Math.max(engineAlert(w, blink), s.temp > INSTRUMENTS.tempRed ? 1 : 0) as Alert,
        engine: true,
      },
      {
        inst: createDial({ r: 13, marks: QUARTERS, red: [0, 0.12], ends: ['E', 'F'] }),
        labels: labels('PETROL'),
        read: (s) => s.petrol + s.shake.petrol,
        alert: (s) => (s.petrol < 0.12 ? 1 : 0),
      },
    ],
  };
}

/**
 * Draw the board along the bottom-left on whole game pixels (axis-aligned, so pixel-exact), bottoms aligned.
 * Breakpoint: compact screens (phones) get more margin, clear of the home indicator and thumbs.
 * A hot engine shakes its dials (by whole pixels) and turns their labels red.
 */
export function drawHud(ctx: CanvasRenderingContext2D, view: View, hud: Hud, s: Instruments, warning: EngineWarning, t: number, time: TimeOfDay): void {
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);

  // Top centre: the pocket watch with AM / PM beside it, then a digital readout, then the date.
  hud.watch.sunset = time.sunset;
  hud.watch.draw(time.hours, 0);
  const { clock, ampm } = clockText(time.hours);
  hud.date = cached(hud.date, time.dateText);
  hud.digital = cached(hud.digital, clock);
  hud.ampm = cached(hud.ampm, ampm);
  const top = view.compact ? 26 : 8;
  const mid = Math.floor(view.w / 2);
  const watch = hud.watch.canvas;
  ctx.drawImage(watch, mid - Math.floor(watch.width / 2), top);
  ctx.drawImage(hud.ampm.canvas, mid + Math.ceil(watch.width / 2) + 3, top + 4 + Math.floor((watch.height - 4) / 2) - Math.floor(hud.ampm.canvas.height / 2));
  const digitalY = top + watch.height + 2;
  ctx.drawImage(hud.digital.canvas, mid - Math.floor(hud.digital.canvas.width / 2), digitalY);
  ctx.drawImage(hud.date.canvas, mid - Math.floor(hud.date.canvas.width / 2), digitalY + hud.digital.canvas.height + 1);

  const bottom = Math.floor(view.h) - (view.compact ? 40 : 12);
  const blink = Math.floor(t * (warning === 2 ? 5 : 3)) % 2 === 0;
  const tick = Math.floor(t * 30);
  let x = view.compact ? 14 : 10;
  hud.slots.forEach((slot, i) => {
    slot.inst.draw(slot.read(s), slot.alert(s, warning, blink));
    const shake = slot.engine && warning > 0 && hash(1, tick, i) < (warning === 2 ? 0.6 : 0.25);
    const dx = shake ? (hash(2, tick, i) < 0.5 ? -1 : 1) : 0;
    const dy = shake && warning === 2 ? (hash(3, tick, i) < 0.5 ? -1 : 1) : 0;
    const below = slot.labels ? LABEL_H : 0;
    ctx.drawImage(slot.inst.canvas, x + dx, bottom - below - slot.inst.size + dy);
    if (slot.labels) {
      const lab = slot.labels[slot.engine && warning > 0 && blink ? 1 : 0];
      ctx.drawImage(lab, x + Math.floor((slot.inst.size - lab.width) / 2), bottom - 5);
    }
    x += slot.inst.size + GAP;
  });
}
