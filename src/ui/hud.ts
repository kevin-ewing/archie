// The instrument board: layout only. Which instruments, in what order, where, at what breakpoint.
// Readings come from instruments.ts; the dials themselves from gauges.ts.

import type { View } from '../render/display.ts';
import { hash } from '../core/noise.ts';
import { INSTRUMENTS, type EngineWarning, type Instruments } from './instruments.ts';
import { createCompass, createDial, createClinometer, label as plate, type Alert, type Instrument } from './gauges.ts';
import { createPx, disc, line, plot, type RGBA } from '../core/pixels.ts';

const LABEL_INK: RGBA = [0xd8, 0xcf, 0xb4, 255];
const LABEL_HOT: RGBA = [0xd8, 0x4a, 0x38, 255];
const LABEL_H = 7; // 5-px text + 2-px gap under the dial
const GAP = 3;

type Slot = {
  inst: Instrument;
  labels?: [HTMLCanvasElement, HTMLCanvasElement]; // normal, hot
  read: (s: Instruments) => number;
  /** Alert level for this dial, given the engine warning and a blink phase. */
  alert: (s: Instruments, warning: EngineWarning, blink: boolean) => Alert;
  /** Does this dial shake with a rough-running engine? */
  engine?: boolean;
};
export type Hud = { slots: Slot[]; keepsakes: ReturnType<typeof createKeepsakes>; swing: { angle: number; velocity: number }; lastT: number };

const label = (s: string, ink: RGBA) => plate(s, ink);
const labels = (s: string): [HTMLCanvasElement, HTMLCanvasElement] => [label(s, LABEL_INK), label(s, LABEL_HOT)];

const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
// Engine dials: warning → red zone blinks; overheated → red zone lit, bezel flashes.
const engineAlert = (warning: EngineWarning, blink: boolean): Alert => (warning === 2 ? (blink ? 2 : 1) : warning === 1 && blink ? 1 : 0);

export function createHud(bearing: () => number | null = () => null): Hud {
  return {
    keepsakes: createKeepsakes(), swing: { angle: 0, velocity: 0 }, lastT: 0,
    slots: [
      { inst: createCompass(17, bearing), read: (s) => s.compass, alert: () => 0 },
      {
        inst: createDial({ r: 15, marks: QUARTERS, figures: ['0', '60', '120'] }),
        labels: labels('MPH'), read: (s) => s.airspeed, alert: () => 0,
      },
      {
        inst: createDial({ r: 15, marks: QUARTERS, figures: ['0', '5', '10'] }),
        labels: labels('100FT'), read: (s) => s.altitude, alert: () => 0,
      },
      { inst: createClinometer(13), labels: labels('CLINO'), read: (s) => s.clinometer, alert: () => 0 },
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
        inst: createDial({ r: 15, marks: QUARTERS, figures: ['0', '', '3'] }),
        labels: labels('PSI'), read: (s) => s.pressure, alert: (s) => s.pressure < 0.2 ? 1 : 0,
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

/** Whole UI-pixel layout, shared by the dials, compass hit target and controls above them. */
export function hudLayout(view: View, sizes: number[]) {
  const left = 10;
  const bottom = Math.floor(view.uiH) - (view.compact ? 48 : 40);
  const right = Math.floor(view.uiW) - left;
  const bankWidth = Math.floor((right - left - 8) / 2);
  let rows = 1;
  const slots: { x: number; y: number; w: number; h: number }[] = [];
  const banks = [sizes.slice(0, 4), sizes.slice(4)].map((group, bank) => {
    let x = 0;
    let row = 0;
    let width = 0;
    const placed = group.map((size, j) => {
      if (x > 0 && x + size > bankWidth) { x = 0; row++; }
      const below = bank === 0 && j === 0 ? 0 : LABEL_H;
      const rect = { x, y: bottom - row * 44 - below - size, w: size, h: size };
      width = Math.max(width, x + size);
      x += size + GAP;
      return rect;
    });
    const origin = bank === 0 ? left : right - width;
    for (const rect of placed) { rect.x += origin; slots.push(rect); }
    rows = Math.max(rows, row + 1);
    return { x: origin, y: Math.min(...placed.map((s) => s.y)), w: width, bottom };
  });
  return { slots, banks, top: Math.min(...slots.map((s) => s.y)), bottom, rows };
}

/** Draw the board at the bottom-left, wrapping upward on narrow screens. */
export function drawHud(ctx: CanvasRenderingContext2D, view: View, hud: Hud, s: Instruments, warning: EngineWarning, t: number) {
  ctx.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  const layout = hudLayout(view, hud.slots.map((s) => s.inst.size));
  // Two modest wooden mounting boards: flight / navigation to port, engine / fuel to starboard.
  for (const bank of layout.banks) {
    ctx.fillStyle = '#302820';
    ctx.fillRect(bank.x - 3, bank.y - 3, bank.w + 6, bank.bottom - bank.y + 5);
    ctx.fillStyle = '#4d3e2c';
    ctx.fillRect(bank.x - 2, bank.y - 2, bank.w + 4, bank.bottom - bank.y + 2);
    ctx.fillStyle = '#574631';
    for (let y = bank.y + 4; y < bank.bottom; y += 9) ctx.fillRect(bank.x - 1, y, bank.w + 2, 1);
    ctx.fillStyle = '#9c8b61';
    for (const x of [bank.x - 1, bank.x + bank.w]) ctx.fillRect(x, bank.y, 1, 2);
  }
  // A creased card trapped under a bezel, not neatly displayed beside the clock.
  const tucked = layout.slots[layout.rows > 2 ? 2 : 3];
  ctx.save();
  ctx.translate(tucked.x + tucked.w - 12, tucked.y - 12);
  ctx.rotate(-0.16);
  ctx.drawImage(hud.keepsakes.card, 0, 0);
  ctx.restore();
  const blink = Math.floor(t * (warning === 2 ? 5 : 3)) % 2 === 0;
  const tick = Math.floor(t * 30);
  hud.slots.forEach((slot, i) => {
    slot.inst.draw(slot.read(s), slot.alert(s, warning, blink));
    const shake = slot.engine && warning > 0 && hash(1, tick, i) < (warning === 2 ? 0.6 : 0.25);
    const dx = shake ? (hash(2, tick, i) < 0.5 ? -1 : 1) : 0;
    const dy = shake && warning === 2 ? (hash(3, tick, i) < 0.5 ? -1 : 1) : 0;
    const { x, y } = layout.slots[i];
    ctx.drawImage(slot.inst.canvas, x + dx, y + dy);
    if (slot.labels) {
      const lab = slot.labels[slot.engine && warning > 0 && blink ? 1 : 0];
      ctx.drawImage(lab, x + Math.floor((slot.inst.size - lab.width) / 2), y + slot.inst.size + 2);
    }
  });
  stepMascot(hud.swing, (s.clinometer - 0.5) * 2, Math.min(0.05, Math.max(0, t - hud.lastT)));
  hud.lastT = t;
  const rpm = layout.slots[4];
  ctx.save();
  ctx.translate(rpm.x + 5, rpm.y + rpm.h - 4);
  ctx.rotate(hud.swing.angle);
  ctx.drawImage(hud.keepsakes.cat, -10, 0);
  ctx.restore();
  return layout;
}

/** Damped pendulum: the gauge-mounted mascot leans out of turns and settles after levelling. */
export function stepMascot(s: { angle: number; velocity: number }, bank: number, dt: number): void {
  s.velocity += (-18 * (s.angle + bank * 0.35) - 3.5 * s.velocity) * dt;
  s.angle += s.velocity * dt;
}

function createKeepsakes() {
  const card = createPx(24, 30);
  const paper: RGBA = [185, 167, 126, 255];
  const ink: RGBA = [116, 104, 78, 255];
  for (let y = 0; y < 30; y++) for (let x = 0; x < 24; x++) {
    if ((x === 0 && y % 7 === 0) || (y < 4 && x > 19 + y)) continue;
    plot(card, x, y, x === 23 || y === 29 ? ink : paper);
  }
  line(card, 1, 17, 22, 18, [164, 146, 110, 255]);
  line(card, 10, 25, 15, 4, [92, 99, 59, 255]);
  for (let i = 0; i < 6; i++) {
    const x = 15 - Math.floor(i / 2), y = 4 + i * 3;
    line(card, x, y + 2, x - 4, y, [92, 99, 59, 255]);
    plot(card, x - 4, y - 1, [224, 217, 191, 255]);
    plot(card, x + 1, y + 1, [224, 217, 191, 255]);
  }
  // Uneven pencil strokes and a worn fold, rather than a printed HOME placard.
  for (const [x, y, length] of [[3, 23, 5], [5, 26, 9], [15, 25, 4]]) line(card, x, y, x + length, y - 1, ink);
  const cat = createPx(22, 32);
  const fur: RGBA = [37, 36, 31, 255], edge: RGBA = [73, 65, 50, 255];
  line(cat, 10, 0, 10, 8, [159, 140, 97, 255]);
  line(cat, 9, 1, 12, 3, [159, 140, 97, 255]);
  disc(cat, 10, 23, 6, () => fur);
  disc(cat, 10, 13, 5, () => fur);
  for (let y = 6; y < 12; y++) for (let x = 0; x <= (y - 6) / 2; x++) {
    plot(cat, 5 + x, y, fur); plot(cat, 15 - x, y, fur);
  }
  for (const x of [7, 13]) { plot(cat, x, 12, [174, 160, 99, 255]); plot(cat, x, 13, edge); }
  plot(cat, 10, 15, [129, 101, 78, 255]);
  for (const y of [14, 16]) { line(cat, 1, y - 1, 6, y, edge); line(cat, 14, y, 19, y - 1, edge); }
  line(cat, 6, 18, 14, 18, [119, 63, 43, 255]);
  disc(cat, 6, 29, 2, () => fur); disc(cat, 13, 29, 2, () => fur);
  line(cat, 15, 27, 20, 24, fur); line(cat, 20, 24, 20, 20, fur);
  for (let y = 21; y < 28; y += 3) plot(cat, 10, y, edge);
  const canvas = (px: typeof card) => {
    const c = document.createElement('canvas'); c.width = px.w; c.height = px.h;
    c.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
    return c;
  };
  return { card: canvas(card), cat: canvas(cat) };
}
