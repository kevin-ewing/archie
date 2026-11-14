// Full-screen, device-resolution canvas where a game pixel is a fixed *physical* size on every screen
// (bigger screens see more world). Everything is drawn with a transform of `scale` device pixels per
// game pixel and smoothing off, so pixels stay crisp squares even when the world is rotated.

/** Size of one game pixel, in CSS pixels. Compact screens (phones) use smaller pixels to see more. */
export const PIXEL_SIZE = { regular: 1.75, compact: 1.2 };
/** Screens whose short side is below this many CSS pixels count as compact. */
export const COMPACT_BREAKPOINT = 600;

export type View = {
  scale: number; // whole device pixels per game pixel
  compact: boolean;
  devW: number; // canvas size in device pixels
  devH: number;
  w: number; // visible size in game pixels (may be fractional)
  h: number;
};

export function fitView(viewW: number, viewH: number, dpr: number): View {
  const compact = Math.min(viewW, viewH) < COMPACT_BREAKPOINT;
  const scale = Math.max(1, Math.round((compact ? PIXEL_SIZE.compact : PIXEL_SIZE.regular) * dpr));
  // Never 0: a collapsed window (devtools, minimise, mid-drag) reports a 0 size, and drawing from a
  // 0-size canvas throws, which would kill the game loop.
  const devW = Math.max(1, Math.round(viewW * dpr));
  const devH = Math.max(1, Math.round(viewH * dpr));
  return { scale, compact, devW, devH, w: devW / scale, h: devH / scale };
}

export type Display = { ctx: CanvasRenderingContext2D; view: () => View };

export function createDisplay(canvas: HTMLCanvasElement): Display {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  let view = fitView(1, 1, 1);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view = fitView(window.innerWidth, window.innerHeight, dpr);
    canvas.width = view.devW;
    canvas.height = view.devH;
    // CSS size maps 1:1 onto device pixels, so the browser never resamples the canvas.
    canvas.style.width = `${view.devW / dpr}px`;
    canvas.style.height = `${view.devH / dpr}px`;
    ctx!.imageSmoothingEnabled = false; // resizing resets context state
  }

  resize();
  // Browser zoom and rotation fire `resize`. Moving to a monitor with a different pixel density doesn't
  // always, so also watch devicePixelRatio itself (re-armed after each change).
  window.addEventListener('resize', resize);
  const watchDpr = () =>
    matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener(
      'change',
      () => {
        resize();
        watchDpr();
      },
      { once: true },
    );
  watchDpr();
  return { ctx, view: () => view };
}
