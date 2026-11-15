// Debug toggles: small brass-edged pixel placards, in the style of the gauges, stacked up from the
// bottom-right corner (development only; the player's own controls stay on the left, above the gauges).
// Lit brass = on, dark face = off. Click or tap one to flip it. Drawn on the canvas on whole game pixels;
// `hit` maps a screen point back to a toggle (see main.ts, which swallows presses that land on one so
// they don't also steer the plane).

import { createPx, plot, text, textWidth, type RGBA } from '../core/pixels.ts';
import type { View } from '../render/display.ts';
import { C, plaque } from './gauges.ts';

export type Toggle = { id: string; text: string; on: boolean };
type Rect = { x: number; y: number; w: number; h: number }; // game px
export type Toggles = { items: Toggle[]; rects: Rect[]; plates: Map<string, HTMLCanvasElement> };

const PAD = 2;
const HEIGHT = 5 + 2 * PAD + 2; // text + padding + the brass border
const GAP = 2;

export const createToggles = (items: Toggle[]): Toggles => ({ items, rects: [], plates: new Map() });


/**
 * The Hold control's face: a nickel-plated tumbler toggle like the cockpit's magneto switches [VERIFY], lever up =
 * holding steady, down = off, with a small engraved ivorine plaque reading HOLD beneath it, as the dials have.
 */
export const TUMBLER = { w: 29, h: 28 }; // the switch, with its plaque in the bottom rows
export function drawTumbler(canvas: HTMLCanvasElement, on: boolean): void {
  const { w, h } = TUMBLER;
  const px = createPx(w, h);
  const steel: RGBA = [0x3c, 0x3e, 0x3b, 255];
  const steelLit: RGBA = [0xb4, 0xb6, 0xae, 255];
  const c = 8; // the boss sits left of centre, the lever swinging out to the right
  const by = 9;
  // A metal mounting ring with a dark centre, the lever thrown up or down from it, a ball on its tip.
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
    const d = x * x + y * y;
    if (d <= 27) plot(px, c + x, by + y, d > 14 ? (x + y < -2 ? C.metalLit : x + y > 3 ? C.metalDark : C.metal) : C.face);
  }
  // The lever: 3 px thick, thrown 45° up (holding) or 45° down from the boss, a ball on its end.
  const a = on ? -Math.PI / 4 : Math.PI / 4;
  for (let k = 0; k <= 9; k++) {
    const lx = c + Math.round(Math.cos(a) * k);
    const ly = by + Math.round(Math.sin(a) * k);
    for (let o = -1; o <= 1; o++) plot(px, lx, ly + o, o < 0 ? steelLit : steel);
  }
  const tx = c + Math.round(Math.cos(a) * 9);
  const ty = by + Math.round(Math.sin(a) * 9);
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x * x + y * y <= 2) plot(px, tx + x, ty + y, x + y < 0 ? steelLit : steel);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(px.data, w, h), 0, 0);
  const label = plaque('HOLD'); // the same plaque as every label in the cockpit
  ctx.drawImage(label, Math.floor((w - label.width) / 2), h - label.height);
}

/** The plate for a toggle in one state: metal border lit from the top-left, lit metal or black face. */
function plate(t: Toggle): HTMLCanvasElement {
  const w = textWidth(t.text) + 2 * PAD + 2;
  const px = createPx(w, HEIGHT);
  const face: RGBA = t.on ? C.metalLit : C.face;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === HEIGHT - 1;
      plot(px, x, y, edge ? (x + y < 3 ? C.metalLit : x + y > w + HEIGHT - 5 ? C.metalDark : C.metal) : face);
    }
  }
  text(px, 1 + PAD, 1 + PAD, t.text, t.on ? C.face : C.dim);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = HEIGHT;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, w, HEIGHT), 0, 0);
  return canvas;
}

/** Width of the player's volume plates: as wide as the old bottom toggle, FAST PLANE. */
export const CONTROL_W = textWidth('FAST PLANE') + 2 * PAD + 2;
/**
 * Where the player's controls go, around the instrument clumps (`bank`, from hudLayout): the volume
 * plates (`engine`) stacked above the engine clump's right end; the Hold switch (`hold`) above the flight clump's left end.
 */
export function controlsAnchor(bank: Rect, side: 'hold' | 'engine'): Rect {
  if (side === 'engine') return { x: bank.x + bank.w - CONTROL_W, y: bank.y - 6 - HEIGHT, w: CONTROL_W, h: HEIGHT };
  return { x: bank.x, y: bank.y - 4 - TUMBLER.h, ...TUMBLER };
}

/** Stacked up from `boardTop`, or (with `top`) down from it, right-aligned unless `centreX` is given. */
export function drawToggles(ctx: CanvasRenderingContext2D, view: View, tg: Toggles, visible = true, boardTop?: number, centreX?: number, top?: number): void {
  ctx.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  const bottom = Math.floor(view.uiH) - (view.compact ? 40 : 12);
  const right = Math.floor(view.uiW) - (view.compact ? 14 : 10);
  let y = top !== undefined ? top + (tg.items.length - 1) * (HEIGHT + GAP) : (boardTop ?? bottom) - HEIGHT;
  tg.rects = tg.items.map((t) => {
    const key = `${t.id}:${t.on}`;
    let img = tg.plates.get(key);
    if (!img) tg.plates.set(key, (img = plate(t)));
    const x = centreX === undefined ? right - img.width : Math.round(centreX - img.width / 2);
    if (visible) ctx.drawImage(img, x, y);
    const r = { x, y, w: img.width, h: HEIGHT };
    y -= HEIGHT + GAP;
    return r;
  });
}

/** The toggle under a screen point (CSS px), as of the last draw. */
export function toggleAt(tg: Toggles, view: View, clientX: number, clientY: number): Toggle | null {
  const k = view.devW / window.innerWidth / view.uiScale; // CSS px → UI px
  const gx = clientX * k;
  const gy = clientY * k;
  const i = tg.rects.findIndex((r) => gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h);
  return i < 0 ? null : tg.items[i];
}
