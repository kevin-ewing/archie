// Debug toggles: small brass-edged pixel placards, in the style of the gauges, stacked up from the
// bottom-right corner (development only; the player's own controls stay on the left, above the gauges).
// Lit brass = on, dark face = off. Click or tap one to flip it. Drawn on the canvas on whole game pixels;
// `hit` maps a screen point back to a toggle (see main.ts, which swallows presses that land on one so
// they don't also steer the plane).

import { createPx, plot, text, textWidth, type RGBA } from '../core/pixels.ts';
import type { View } from '../render/display.ts';
import { C } from './gauges.ts';

export type Toggle = { id: string; text: string; on: boolean };
type Rect = { x: number; y: number; w: number; h: number }; // game px
export type Toggles = { items: Toggle[]; rects: Rect[]; plates: Map<string, HTMLCanvasElement> };

const PAD = 2;
const HEIGHT = 5 + 2 * PAD + 2; // text + padding + the brass border
const GAP = 2;
const GAUGES_TOP = 35; // the tallest instrument on the board, so the toggles sit just above it

export const createToggles = (items: Toggle[]): Toggles => ({ items, rects: [], plates: new Map() });

/** DOM-backed volume slider face, painted in the same game pixels and palette as the toggle below it. */
export function drawVolumePlate(canvas: HTMLCanvasElement, w: number, value: number, label: string): void {
  const px = createPx(w, HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === HEIGHT - 1;
      plot(px, x, y, edge ? (x + y < 3 ? C.brassLit : x + y > w + HEIGHT - 5 ? C.brassDark : C.brass) : C.face);
    }
  }
  text(px, Math.floor((w - textWidth(label)) / 2), 1, label, C.ink);
  for (let x = 2; x < w - 2; x++) plot(px, x, HEIGHT - 3, C.brassDark);
  const thumb = 2 + Math.round(Math.max(0, Math.min(1, value)) * (w - 5));
  plot(px, thumb, HEIGHT - 4, C.brassLit);
  plot(px, thumb, HEIGHT - 3, C.brassLit);
  plot(px, thumb, HEIGHT - 2, C.brass);
  canvas.width = w;
  canvas.height = HEIGHT;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, w, HEIGHT), 0, 0);
}

/** DOM-backed button face matching the volume controls. */
export function drawButtonPlate(canvas: HTMLCanvasElement, w: number, label: string, on: boolean): void {
  const px = createPx(w, HEIGHT);
  const face: RGBA = on ? C.brassLit : C.face;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === HEIGHT - 1;
      plot(px, x, y, edge ? (x + y < 3 ? C.brassLit : x + y > w + HEIGHT - 5 ? C.brassDark : C.brass) : face);
    }
  }
  text(px, Math.floor((w - textWidth(label)) / 2), 1 + PAD, label, on ? C.face : C.dim);
  canvas.width = w;
  canvas.height = HEIGHT;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, w, HEIGHT), 0, 0);
}

/** The plate for a toggle in one state: brass border lit from the top-left, lit brass or black face. */
function plate(t: Toggle): HTMLCanvasElement {
  const w = textWidth(t.text) + 2 * PAD + 2;
  const px = createPx(w, HEIGHT);
  const face: RGBA = t.on ? C.brassLit : C.face;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === HEIGHT - 1;
      plot(px, x, y, edge ? (x + y < 3 ? C.brassLit : x + y > w + HEIGHT - 5 ? C.brassDark : C.brass) : face);
    }
  }
  text(px, 1 + PAD, 1 + PAD, t.text, t.on ? C.face : C.dim);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = HEIGHT;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, w, HEIGHT), 0, 0);
  return canvas;
}

/** Width of the player's control plates (volume, HOLD): as wide as the old bottom toggle, FAST PLANE. */
export const CONTROL_W = textWidth('FAST PLANE') + 2 * PAD + 2;
/** Where the player's controls stack up from: on the left, just above the gauges. */
export function controlsAnchor(view: View): Rect {
  const bottom = Math.floor(view.uiH) - (view.compact ? 40 : 12);
  return { x: view.compact ? 14 : 10, y: bottom - GAUGES_TOP - 4 - HEIGHT, w: CONTROL_W, h: HEIGHT };
}

export function drawToggles(ctx: CanvasRenderingContext2D, view: View, tg: Toggles, visible = true): void {
  ctx.setTransform(view.uiScale, 0, 0, view.uiScale, 0, 0);
  const bottom = Math.floor(view.uiH) - (view.compact ? 40 : 12);
  const right = Math.floor(view.uiW) - (view.compact ? 14 : 10);
  let y = bottom - HEIGHT;
  tg.rects = tg.items.map((t) => {
    const key = `${t.id}:${t.on}`;
    let img = tg.plates.get(key);
    if (!img) tg.plates.set(key, (img = plate(t)));
    const x = right - img.width; // right-aligned
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
