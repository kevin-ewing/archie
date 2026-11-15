// Tint small instrument rasters, rather than asking the compositor to filter a full-screen HUD surface.
import { createPx, type Px } from '../core/pixels.ts';

export type HudLight = { key: string; channels: Uint8ClampedArray[] };
const IDENTITY = '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0';
let lastKey = '';
let lastLight: HudLight | undefined;
export function hudLight(key: string): HudLight | undefined {
  if (key === lastKey) return lastLight;
  lastKey = key;
  if (key === IDENTITY) return (lastLight = undefined);
  const matrix = key.split(' ').map(Number);
  return (lastLight = { key, channels: [0, 1, 2].map((c) => Uint8ClampedArray.from({ length: 256 }, (_, v) => v * matrix[c * 6] + 255 * matrix[c * 5 + 4])) });
}
export function applyLight(px: Px, light?: HudLight): void {
  if (!light) return;
  const [r, g, b] = light.channels;
  const data = px.data;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    data[i] = r[data[i]]; data[i + 1] = g[data[i + 1]]; data[i + 2] = b[data[i + 2]];
  }
}
const lit = new WeakMap<HTMLCanvasElement, { key: string; raw: Uint8ClampedArray; px: Px; canvas: HTMLCanvasElement }>();
/** Static plaques and charm pieces only repaint when the quantised light changes. */
export function litCanvas(source: HTMLCanvasElement, light?: HudLight): HTMLCanvasElement {
  if (!light) return source;
  let c = lit.get(source);
  if (!c) {
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    c = { key: '', raw: source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data, px: createPx(source.width, source.height), canvas };
    lit.set(source, c);
  }
  if (c.key !== light.key) {
    c.key = light.key;
    c.px.data.set(c.raw);
    applyLight(c.px, light);
    c.canvas.getContext('2d')!.putImageData(new ImageData(c.px.data, c.px.w, c.px.h), 0, 0);
  }
  return c.canvas;
}
