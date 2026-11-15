// The instrument board: layout only. Which instruments, in what order, where, at what breakpoint.
// Readings come from instruments.ts; the dials themselves from gauges.ts.
//
// Two clumps along the bottom of the screen: the compass and the flight
// instruments, then the engine's. Every dial that needs naming carries a small engraved ivorine plaque
// beneath it, as the instruments of the period did [VERIFY]. A worn toy black cat (the period's best
// documented aviation mascots were stuffed black cats: Twinkletoes and Lucky Jim, carried across the
// Atlantic by Alcock and Brown in 1919, with black fur, green glass eyes and a white silk scarf) hangs
// on a cord from the altimeter and swings as the plane banks. The board wraps into centred rows on
// narrow screens rather than shrinking the instruments.

import type { View } from '../render/display.ts';
import { hash } from '../core/noise.ts';
import { INSTRUMENTS, type EngineWarning, type Instruments } from './instruments.ts';
import { createClinometer, createCompass, createDial, plaque, PLAQUE_H, toCanvas, type Alert, type Instrument } from './gauges.ts';
import { createPx, plot, type RGBA } from '../core/pixels.ts';

const GAP = 4; // between instruments
const ROW_GAP = 9; // room for a short dial's plaque, which hangs below the row's centre line
const PLAQUE_GAP = 1;
/** How far the board sits above the bottom edge (phones keep clear of the home indicator). */
export const BOARD_MARGIN = { regular: 2, compact: 8 };

type Slot = {
  inst: Instrument;
  plaque?: [HTMLCanvasElement, HTMLCanvasElement]; // normal, hot (the engraving picked out in red)
  read: (s: Instruments) => number;
  /** Alert level for this dial, given the engine warning and a blink phase. */
  alert: (s: Instruments, warning: EngineWarning, blink: boolean) => Alert;
  /** Does this dial shake with a rough-running engine? */
  engine?: boolean;
};
export type Hud = { slots: Slot[]; cat: Charm; swing: { angle: number; velocity: number }; lastT: number };

const ENGRAVED_HOT: RGBA = [0xb8, 0x2c, 0x22, 255];
const plaques = (s: string): [HTMLCanvasElement, HTMLCanvasElement] => [plaque(s), plaque(s, ENGRAVED_HOT)];

const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
// Engine dials: warning → red zone blinks; overheated → red zone lit, bezel flashes.
const engineAlert = (warning: EngineWarning, blink: boolean): Alert => (warning === 2 ? (blink ? 2 : 1) : warning === 1 && blink ? 1 : 0);
/** Index of the altimeter in `slots` (the cat hangs from it). */
const ALTIMETER = 1;

export function createHud(bearing: () => number | null = () => null): Hud {
  return {
    cat: luckPiece(),
    swing: { angle: 0, velocity: 0 },
    lastT: 0,
    slots: [
      { inst: createCompass(17, bearing), read: (s) => s.compass, alert: () => 0 },
      // The altimeter: no plaque (its figures say what it is); the charm hangs between it and the compass.
      { inst: createDial({ r: 15, marks: QUARTERS, figures: ['0', '5', '10'] }), read: (s) => s.altitude, alert: () => 0 },
      { inst: createDial({ r: 15, marks: QUARTERS, figures: ['0', '60', '120'], tiny: true, nudge: [-2, 0, 0] }), plaque: plaques('MPH'), read: (s) => s.airspeed, alert: () => 0 },
      {
        inst: createDial({ r: 13, marks: QUARTERS, red: [0, 0.12], ends: ['E', 'F'] }),
        plaque: plaques('PETROL'),
        read: (s) => s.petrol + s.shake.petrol,
        alert: (s) => (s.petrol < 0.12 ? 1 : 0),
      },
      {
        // Rev indicator: 0 to 2,000 rpm.
        inst: createDial({ r: 13, marks: QUARTERS, red: [0.9, 1] }),
        plaque: plaques('RPM'),
        read: (s) => s.rpm + s.shake.rpm,
        alert: (_, w, blink) => engineAlert(w, blink),
        engine: true,
      },
      {
        // Engine temperature, in the style of the period's transmitting thermometer.
        inst: createDial({ r: 13, marks: QUARTERS, red: [INSTRUMENTS.tempRed, 1] }),
        plaque: plaques('TEMP'),
        read: (s) => s.temp + s.shake.temp,
        alert: (s, w, blink) => Math.max(engineAlert(w, blink), s.temp > INSTRUMENTS.tempRed ? 1 : 0) as Alert,
        engine: true,
      },
      { inst: createDial({ r: 15, marks: QUARTERS, figures: ['0', '', '3'] }), read: (s) => s.pressure, alert: (s) => (s.pressure < 0.2 ? 1 : 0) },
      { inst: createClinometer(13), read: (s) => s.clinometer, alert: () => 0 },
    ],
  };
}

type Rect = { x: number; y: number; w: number; h: number };
/** An item on the board: its own size, and whether a plaque hangs under it. */
export type BoardItem = { w: number; h: number; plaque: boolean };
const SIDE = 8; // the least space at the screen's edges
const MIDDLE = 16; // the least space between the two clumps

/**
 * Whole-UI-pixel layout: two clumps along the bottom, flight and navigation to port (items before
 * `split`), engine to starboard. Each wraps into rows within its half of the screen. Every dial in a
 * row is centred on one horizontal line (the row's centre line is shared by both clumps), plaques beneath.
 */
export function hudLayout(view: View, items: readonly BoardItem[], split: number) {
  const half = Math.floor((Math.floor(view.uiW) - 2 * SIDE - MIDDLE) / 2);
  const wrap = (idx: number[]) => {
    const rows: number[][] = [[]];
    let width = 0;
    for (const i of idx) {
      const row = rows[rows.length - 1];
      if (row.length && width + GAP + items[i].w > half) {
        rows.push([i]);
        width = items[i].w;
      } else {
        width += (row.length ? GAP : 0) + items[i].w;
        row.push(i);
      }
    }
    return rows;
  };
  const clumps = [wrap([...items.keys()].slice(0, split)), wrap([...items.keys()].slice(split))];
  const nRows = Math.max(...clumps.map((c) => c.length));
  const bottom = Math.floor(view.uiH) - (view.compact ? BOARD_MARGIN.compact : BOARD_MARGIN.regular);
  const slots: Rect[] = new Array(items.length);
  // Row k counted from the bottom; the same k in both clumps shares a centre line.
  const rowOf = (c: number[][], k: number) => c[c.length - 1 - k];
  let base = bottom;
  for (let k = 0; k < nRows; k++) {
    const inRow = clumps.flatMap((c) => rowOf(c, k) ?? []);
    const plaqueRoom = inRow.some((i) => items[i].plaque) ? PLAQUE_GAP + PLAQUE_H : 0;
    const tallest = Math.max(...inRow.map((i) => items[i].h));
    const centre = base - plaqueRoom - tallest + Math.floor(tallest / 2); // the tallest dial's top sits exactly on the row's top
    clumps.forEach((c, side) => {
      const row = rowOf(c, k);
      if (!row) return;
      const rowW = row.reduce((a, i) => a + items[i].w, 0) + GAP * (row.length - 1);
      let x = side === 0 ? SIDE : Math.floor(view.uiW) - SIDE - rowW;
      for (const i of row) {
        slots[i] = { x, y: centre - Math.floor(items[i].h / 2), w: items[i].w, h: items[i].h };
        x += items[i].w + GAP;
      }
    });
    base -= plaqueRoom + tallest + ROW_GAP;
  }
  const bound = (idx: number[]) => {
    const r = idx.map((i) => slots[i]);
    const x = Math.min(...r.map((s) => s.x));
    const y = Math.min(...r.map((s) => s.y));
    return { x, y, w: Math.max(...r.map((s) => s.x + s.w)) - x, h: bottom - y };
  };
  const banks = [bound(clumps[0].flat()), bound(clumps[1].flat())];
  return { slots, banks, top: Math.min(...slots.map((s) => s.y)), bottom, rows: nRows };
}

const boardItems = (hud: Hud): BoardItem[] => hud.slots.map((s) => ({ w: s.inst.size, h: s.inst.size, plaque: !!s.plaque }));
/** The compass, altimeter, airspeed and petrol go to port; the engine's from RPM on (and the clinometer) to starboard. */
export const SPLIT = 4;

/** Draw the two clumps along the bottom. Returns the layout: `slots` are the instruments' rects. */
/** `glow`: at night, the layer the radium paint is drawn on (undefined by day: no glow work). */
export function drawHud(ctx: CanvasRenderingContext2D, view: View, hud: Hud, s: Instruments, warning: EngineWarning, t: number, glow?: CanvasRenderingContext2D) {
  glow?.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  ctx.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  const layout = hudLayout(view, boardItems(hud), SPLIT);
  const slots = layout.slots;

  // Each row's plaque line: the bottom of its lowest dial (dials in a row share a centre line).
  const rowKey = (r: Rect) => r.y + Math.floor(r.h / 2);
  const plaqueLine = new Map<number, number>();
  for (const r of slots) plaqueLine.set(rowKey(r), Math.max(plaqueLine.get(rowKey(r)) ?? -Infinity, r.y + r.h));
  const blink = Math.floor(t * (warning === 2 ? 5 : 3)) % 2 === 0;
  const tick = Math.floor(t * 30);
  hud.slots.forEach((slot, i) => {
    slot.inst.draw(slot.read(s), slot.alert(s, warning, blink), !!glow);
    const shake = slot.engine && warning > 0 && hash(1, tick, i) < (warning === 2 ? 0.3 : 0.12);
    const dx = shake ? (hash(2, tick, i) < 0.5 ? -1 : 1) : 0;
    const dy = shake && warning === 2 && hash(4, tick, i) < 0.4 ? (hash(3, tick, i) < 0.5 ? -1 : 1) : 0;
    const { x, y } = slots[i];
    ctx.drawImage(slot.inst.canvas, x + dx, y + dy);
    glow?.drawImage(slot.inst.glow, x + dx, y + dy);
    if (slot.plaque) {
      const p = slot.plaque[slot.engine && warning > 0 && blink ? 1 : 0];
      // All the plaques in a row hang on one line: under the row's lowest dial, whatever this one's size.
      ctx.drawImage(p, x + Math.floor((slot.inst.size - p.width) / 2), plaqueLine.get(rowKey(slots[i]))! + PLAQUE_GAP);
    }
  });

  // The charm on its cord, tied to the altimeter's bezel; it leans out of turns and swings.
  stepMascot(hud.swing, (s.clinometer - 0.5) * 2, Math.min(0.05, Math.max(0, t - hud.lastT)));
  hud.lastT = t;
  const alt = slots[ALTIMETER];
  // Tied round the left side of the bezel, halfway up (its knot over the rim), hanging down between the
  // altimeter and the compass. (The coin may hang off the screen's bottom edge: that's fine.)
  drawCharm(ctx, hud.cat, hud.swing, alt.x + 4, alt.y + Math.floor(alt.h * 0.5));
  return { ...layout, slots };
}

/** Damped pendulum: the hanging mascot leans out of turns and settles after levelling. */
export function stepMascot(s: { angle: number; velocity: number }, bank: number, dt: number): void {
  // Swings out with the bank (as a hanging weight would, seen from the seat), lively and quick.
  s.velocity += (-40 * (s.angle - bank * 0.7) - 2.2 * s.velocity) * dt;
  s.angle += s.velocity * dt;
}

/**
 * The charm, drawn each frame so its cord hangs slack: the knot barely turns, the cord bends down from it
 * (curving more toward the coin, and bowing back against the swing as it moves, as a soft cord trails),
 * and the coin hangs at the cord's end at the full swing angle. Whole UI pixels throughout.
 */
const CORD = { length: 12, knot: 0.45, bow: 0.45, maxBow: 1.5 }; // bow: px of lag per rad/s of swing
function drawCharm(ctx: CanvasRenderingContext2D, c: Charm, swing: { angle: number; velocity: number }, px: number, py: number) {
  const a = swing.angle;
  ctx.save();
  ctx.translate(px, py);
  ctx.save();
  ctx.rotate(a * CORD.knot);
  ctx.drawImage(c.knot, -c.pivot, 0);
  ctx.restore();
  // The cord from below the knot: its direction eases from the knot's angle to the coin's, and it bows
  // back against the swing (lagging behind like a soft cord), most in the middle.
  const start = { x: Math.sin(-a * CORD.knot) * 5, y: Math.cos(a * CORD.knot) * 5 };
  const bow = Math.max(-CORD.maxBow, Math.min(CORD.maxBow, swing.velocity * CORD.bow));
  let x = start.x;
  let y = start.y;
  for (let k = 0; k < CORD.length; k++) {
    const t = (k + 0.5) / CORD.length;
    const dir = a * (CORD.knot + (1 - CORD.knot) * t ** 1.4);
    x -= Math.sin(dir);
    y += Math.cos(dir);
    const lag = bow * Math.sin(Math.PI * t);
    const cx = Math.round(x + lag) - 1;
    const cy = Math.round(y);
    ctx.fillStyle = k % 2 ? c.cordB : c.cordA;
    ctx.fillRect(cx, cy, 1, 1);
    ctx.fillStyle = k % 2 ? c.cordA : c.cordB;
    ctx.fillRect(cx + 1, cy, 1, 1);
  }
  // The coin, hung from the cord's end at the full angle.
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(a);
  ctx.drawImage(c.coin, -c.pivot, 0);
  ctx.restore();
}

/**
 * The charm on its cord: the old hand's lucky sixpence, drilled through and hung on a length of signal
 * cord. The story's first operator is a former Post Office telegraphist (docs/STORY.md); a holed silver
 * coin, carried for luck, is the sort of thing an older man gives a young officer, and the sort of thing
 * that keeps swinging under the altimeter long after he's gone. (Holed and bent coins as soldiers' luck
 * pieces [VERIFY].) Made as two images, the knot and the coin (the cord between is drawn live, see
 * drawCharm), each hung from `pivot` px across its top.
 */
type Charm = { knot: HTMLCanvasElement; coin: HTMLCanvasElement; pivot: number; cordA: string; cordB: string };
function luckPiece(): Charm {
  const W = 23;
  const H = 34;
  const px = createPx(W, H);
  const c = 11;
  const cordA: RGBA = [0xc4, 0xb0, 0x80, 255];
  const cordB: RGBA = [0x7a, 0x68, 0x45, 255];
  const cordDark: RGBA = [0x4f, 0x43, 0x2c, 255];
  const silver: RGBA = [0xc6, 0xc4, 0xb8, 255];
  const silverLit: RGBA = [0xf0, 0xee, 0xe4, 255];
  const silverDark: RGBA = [0x6c, 0x6a, 0x60, 255];
  const worn: RGBA = [0x9c, 0x9a, 0x8e, 255];
  // The tie: a loop of cord wrapped round the bezel (around the pivot), a fat knot below it with its two
  // cut ends sticking out, then the twisted cord down to the coin.
  for (const [x, y] of [[c - 1, 0], [c, 0], [c + 1, 0], [c + 2, 0], [c - 2, 1], [c + 3, 1], [c - 1, 2], [c + 2, 2]]) plot(px, x, y, y ? cordB : cordA);
  for (let y = 3; y <= 4; y++) for (let x = c - 1; x <= c + 2; x++) plot(px, x, y, (x + y) % 2 ? cordA : cordB); // the knot
  plot(px, c + 2, 4, cordDark);
  for (const [x, y] of [[c - 2, 5], [c + 3, 5], [c + 3, 6]]) plot(px, x, y, cordB); // the cut ends
  // The coin, as a worn George V silver sixpence (1911 on): a flat raised rim lit from
  // the top-left and shadowed bottom-right, a ring of toothed border beads just inside it, the legend
  // (GEORGIVS V DEI GRA: BRITT: OMN: REX …, far too small to read: a broken ring of dots), and the king's
  // bare head in low relief facing left, its edge caught by the light. Rubbed smooth in a pocket.
  const cy = 25;
  const R = 8.5;
  const field: RGBA = [0xb4, 0xb2, 0xa6, 255];
  for (let y = -9; y <= 9; y++) {
    for (let x = -9; x <= 9; x++) {
      const d = Math.hypot(x, y);
      if (d > R) continue;
      const lit = (x + y) / Math.max(1, d); // −1.4 top-left … 1.4 bottom-right
      let col: RGBA;
      if (d > R - 1.4) col = lit < -0.5 ? silverLit : lit > 0.6 ? silverDark : silver; // the raised rim
      else if (d > R - 2.9) col = Math.round((Math.atan2(y, x) / (2 * Math.PI)) * 30) & 1 ? worn : silverDark; // border teeth
      else col = lit < -0.9 && d > 4 ? silver : field; // the field, a touch brighter toward the light
      plot(px, c + x, cy + y, col);
    }
  }
  // The legend: a broken ring of dots inside the teeth, gapped at the bottom (under the bust).
  for (let k = 0; k < 24; k++) {
    if (k === 5 || k === 6 || k === 7) continue; // (bottom: the truncation of the neck)
    const a = (k / 24) * 2 * Math.PI;
    if (k % 2) plot(px, c + Math.round(Math.cos(a) * 4.9), cy + Math.round(Math.sin(a) * 4.9), silverDark);
  }
  // The head, facing left, in low relief: the skull and hair, brow, nose, lips and beard, the neck cut off.
  const head = [
    [-1, 2], // y −4: the crown
    [-2, 3], // y −3
    [-2, 3], // y −2: brow
    [-3, 3], // y −1: nose
    [-2, 3], // y 0: lips
    [-2, 2], // y 1: beard
    [-1, 2], // y 2: neck
    [-1, 2], // y 3
  ];
  head.forEach(([from, to], i) => {
    const y = i - 4;
    for (let x = from; x <= to; x++) {
      const rim = x === from || y === -4; // the face's profile and the top of the head catch the light …
      const shade = x === to || i === head.length - 1; // … the back of the head and the neck are in shadow
      plot(px, c + x, cy + y, rim ? silverLit : shade ? silverDark : worn);
    }
  });
  plot(px, c - 1, cy - 2, silverDark); // the eye
  plot(px, c + 1, cy - 1, silverDark); // the ear
  // Years in a pocket: a fine scratch across the field and a little dark toning by the rim.
  for (const [x, y] of [[-4, 3], [-3, 4]]) plot(px, c + x, cy + y, worn);
  for (const [x, y] of [[4, 4], [5, 2]]) plot(px, c + x, cy + y, [0x8a, 0x80, 0x6a, 255]);
  // The drilled hole, with the cord through it.
  for (const x of [c, c + 1]) {
    plot(px, x, cy - R + 2, silverDark);
    plot(px, x, cy - R + 1, x === c ? cordA : cordB);
  }
  const whole = toCanvas(px);
  const part = (y0: number, h: number) => {
    const out = document.createElement('canvas');
    out.width = W;
    out.height = h;
    out.getContext('2d')!.drawImage(whole, 0, y0, W, h, 0, 0, W, h);
    return out;
  };
  const css = ([r, g, b]: RGBA) => `rgb(${r} ${g} ${b})`;
  // The knot mirrored, so its cut ends point away from the bezel it's tied round (the left side).
  const knot = part(0, 7);
  const flipped = document.createElement('canvas');
  flipped.width = W;
  flipped.height = 7;
  const fc = flipped.getContext('2d')!;
  fc.translate(W, 0);
  fc.scale(-1, 1);
  fc.drawImage(knot, 0, 0);
  return { knot: flipped, coin: part(16, H - 16), pivot: c, cordA: css(cordA), cordB: css(cordB) };
}

/**
 * The light of the hour on the instruments: the very tint the world gets from the grade (render/grade.ts),
 * a multiply by the sky's colour blended in by its strength, plus a touch of its sunset glow, as the
 * values of an SVG colour matrix for the HUD (the browser applies it; main.ts only sets it when it
 * changes, quantised). Identity in plain daylight. Pure.
 */
export function gradeMatrix(g: { near: readonly number[]; far: readonly number[]; tintAlpha: number; glow: readonly number[]; glowAlpha: number; active: boolean } | undefined): string {
  if (!g?.active) return '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0';
  const q = (v: number) => Math.round(v * 100) / 100;
  const k0 = 0.9; // the instruments take the light a little less strongly than the landscape
  const ch = [0, 1, 2].map((c) => {
    const tint = (g.near[c] + g.far[c]) / 2 / 255; // the instruments sit across the bottom: the sky's middle
    const k = 1 - g.tintAlpha * k0 + g.tintAlpha * k0 * tint; // multiply, at 90% of the grade's strength
    const add = (g.glowAlpha * k0 * 0.35 * g.glow[c]) / 255; // a little of the screen glow (lifts toward the sun's colour)
    return [q(k * (1 - add)), q(add)];
  });
  return `${ch[0][0]} 0 0 0 ${ch[0][1]} 0 ${ch[1][0]} 0 0 ${ch[1][1]} 0 0 ${ch[2][0]} 0 ${ch[2][1]} 0 0 0 1 0`;
}

/** How strongly the radium paint shows, 0 (daylight: none) … 1 (full dark), quantised. Pure. */
export function radiumGlow(elevationRad: number): number {
  const deg = (elevationRad * 180) / Math.PI;
  return Math.round(Math.min(1, Math.max(0, (2 - deg) / 10)) * 20) / 20;
}
