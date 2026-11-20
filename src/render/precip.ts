// Canvas layer for rain and snow: draws the pixel list of precipmodel.ts onto Display.precip. Sprites are
// 1..8 px squares at whole game pixels, bucketed by (kind, sun-side band, alpha level) so each bucket sets
// fillStyle once. Colour comes from preciptint.ts, alpha only from the four model levels.
import { RAIN_COLOUR, SNOW_COLOUR, type Grade } from './grade.ts';
import type { View } from './display.ts';
import { ALPHA_LEVELS, BANDS, createPrecipModel, precipIdle, stepPrecip } from './precipmodel.ts';
import { particleColour } from './preciptint.ts';
import type { WeatherState } from '../sim/weather.ts';

type Rect = { x: number; y: number; w: number; h: number }; // game px

export type PrecipFrame = {
  ctx: CanvasRenderingContext2D | null;
  view: View;
  weather: WeatherState;
  seed: number;
  grade: Grade | undefined;
  sunScreen: { x: number; y: number } | undefined;
  heading: number;
  bank: number;
  camAngle: number;
  t: number;
  boardRects?: readonly Rect[]; // game px
};

export type PrecipLayer = {
  draw(frame: PrecipFrame): void; // never throws on its own; the caller still wraps it (10.7)
  hide(): void; // landing, desk, loading: clears once, hides the canvas, then draws nothing
};

const BOARD_ALPHA = 0.5; // alpha multiplier over the instrument board: at most 0.25 there
const LEVELS = ALPHA_LEVELS.length;
const KINDS = 2;
const BUCKETS = KINDS * BANDS * LEVELS * 2; // second half: over the board
const STYLE_CAP = 2048;
const q4 = (v: number) => Math.min(255, Math.max(0, Math.round(v / 4) * 4));

export function createPrecipLayer(reducedMotion: boolean): PrecipLayer {
  const model = createPrecipModel();
  const order = new Int32Array(model.px.length);
  const start = new Int32Array(BUCKETS + 1);
  const cursor = new Int32Array(BUCKETS);
  const bucketOf = new Uint8Array(model.px.length);
  const styles = new Map<number, string>(); // quantised tint key -> fillStyle
  let lastGrade: Grade | undefined;
  let lastSun: { x: number; y: number } | undefined;
  let lastCtx: CanvasRenderingContext2D | null = null;
  let dirty = false; // something is on the canvas

  const clear = (ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    dirty = false;
  };
  const setHidden = (ctx: CanvasRenderingContext2D, hidden: boolean) => {
    if (ctx.canvas) ctx.canvas.hidden = hidden;
  };

  const styleOf = (kind: number, band: number, level: number, board: boolean): string => {
    const k = kind === 0 ? 'rain' : 'snow';
    const rgb = lastGrade ? particleColour(lastGrade, k, (band + 0.5) / BANDS) : kind === 0 ? RAIN_COLOUR : SNOW_COLOUR;
    const r = q4(rgb[0]), g = q4(rgb[1]), b = q4(rgb[2]);
    const key = ((((r >> 2) * 64 + (g >> 2)) * 64 + (b >> 2)) * 4 + level) * 2 + (board ? 1 : 0);
    let s = styles.get(key);
    if (s === undefined) {
      if (styles.size >= STYLE_CAP) styles.clear();
      s = `rgba(${r},${g},${b},${ALPHA_LEVELS[level] * (board ? BOARD_ALPHA : 1)})`;
      styles.set(key, s);
    }
    return s;
  };

  return {
    draw(f) {
      const ctx = f.ctx;
      if (!ctx) return;
      lastCtx = ctx;
      if (f.grade) lastGrade = f.grade;
      if (f.sunScreen) lastSun = f.sunScreen;

      stepPrecip(model, {
        seed: f.seed,
        width: f.view.w,
        height: f.view.h,
        precipitation: f.weather.precipitation,
        intensity: f.weather.intensity,
        heading: f.heading,
        bank: f.bank,
        camAngle: f.camAngle,
        t: f.t,
        sun: lastSun,
        reducedMotion,
      });

      if (precipIdle(model)) {
        if (dirty) {
          clear(ctx);
          setHidden(ctx, true);
        }
        return;
      }

      // Counting sort of the pixel list into buckets.
      const n = model.n;
      const rects = f.boardRects;
      start.fill(0);
      for (let i = 0; i < n; i++) {
        const x = model.px[i], y = model.py[i], s = model.ps[i];
        let board = 0;
        if (rects) {
          for (let r = 0; r < rects.length; r++) {
            const R = rects[r];
            if (x + s > R.x && x < R.x + R.w && y + s > R.y && y < R.y + R.h) { board = 1; break; }
          }
        }
        const b = ((board * KINDS + model.kind[i]) * BANDS + model.band[i]) * LEVELS + model.style[i];
        bucketOf[i] = b;
        start[b + 1]++;
      }
      for (let b = 0; b < BUCKETS; b++) start[b + 1] += start[b];
      cursor.set(start.subarray(0, BUCKETS));
      for (let i = 0; i < n; i++) order[cursor[bucketOf[i]]++] = i;

      clear(ctx);
      setHidden(ctx, false);
      ctx.imageSmoothingEnabled = false;
      const sc = f.view.scale;
      ctx.setTransform(sc, 0, 0, sc, 0, 0);
      for (let b = 0; b < BUCKETS; b++) {
        const a = start[b], e = start[b + 1];
        if (a === e) continue;
        const level = b % LEVELS;
        const band = Math.floor(b / LEVELS) % BANDS;
        const kind = Math.floor(b / (LEVELS * BANDS)) % KINDS;
        const board = b >= BUCKETS / 2;
        ctx.fillStyle = styleOf(kind, band, level, board);
        for (let j = a; j < e; j++) {
          const i = order[j];
          const s = model.ps[i];
          ctx.fillRect(model.px[i], model.py[i], s, s);
        }
      }
      dirty = true;
    },

    hide() {
      if (!lastCtx) return;
      if (dirty) clear(lastCtx);
      setHidden(lastCtx, true);
    },
  };
}
