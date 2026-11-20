// Full-screen, device-resolution canvas where a game pixel is a fixed *physical* size on every screen
// (bigger screens see more world). Everything is drawn with a transform of `scale` device pixels per
// game pixel and smoothing off, so pixels stay crisp squares even when the world is rotated.

/** Size of one game pixel, in CSS pixels. Compact screens (phones) use smaller pixels to see more. */
export const PIXEL_SIZE = { regular: 1.75, compact: 1.5 };
/** Screens whose short side is below this many CSS pixels count as compact. */
export const COMPACT_BREAKPOINT = 600;
export const MOBILE_SCALE = { scene: 1.25, ui: 1 };
export type MobilePlatform = 'ios' | 'android' | 'other';

export function mobilePlatform(userAgent: string, platform = '', maxTouchPoints = 0): MobilePlatform | null {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return /Mobi|Mobile|Tablet/i.test(userAgent) ? 'other' : null;
}

export type View = {
  scale: number; // whole device pixels per game pixel
  uiScale: number; // independently enlarged mobile HUD, also kept on whole device pixels
  compact: boolean;
  mobile: MobilePlatform | null;
  devW: number; // canvas size in device pixels
  devH: number;
  w: number; // visible size in game pixels (may be fractional)
  h: number;
  uiW: number;
  uiH: number;
};

export function fitView(viewW: number, viewH: number, dpr: number, mobile: MobilePlatform | null = null): View {
  const compact = Math.min(viewW, viewH) < COMPACT_BREAKPOINT;
  const baseScale = Math.max(1, Math.round((compact ? PIXEL_SIZE.compact : PIXEL_SIZE.regular) * dpr));
  const scale = mobile ? Math.round(baseScale * MOBILE_SCALE.scene) : baseScale;
  const uiScale = mobile ? Math.max(1, Math.round(baseScale * MOBILE_SCALE.ui * (Math.min(viewW, viewH) < 360 ? 0.8 : 1))) : baseScale;
  // Never 0: a collapsed window (devtools, minimise, mid-drag) reports a 0 size, and drawing from a
  // 0-size canvas throws, which would kill the game loop.
  const devW = Math.max(1, Math.round(viewW * dpr));
  const devH = Math.max(1, Math.round(viewH * dpr));
  return { scale, uiScale, compact, mobile, devW, devH, w: devW / scale, h: devH / scale, uiW: devW / uiScale, uiH: devH / uiScale };
}

/** `ctx` draws the world; `hud` is a transparent canvas of the same size stacked over it, for the HUD. */
export type Display = { ctx: CanvasRenderingContext2D; hud: CanvasRenderingContext2D; glow: CanvasRenderingContext2D; precip: CanvasRenderingContext2D | null; view: () => View };

export function createDisplay(canvas: HTMLCanvasElement): Display {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  // The HUD's own canvas, right over the game's (clicks pass through to the game): the world canvas then
  // ends each frame on the light of the hour, which keeps the browser from rendering the frame early.
  const hudCanvas = document.createElement('canvas');
  hudCanvas.id = 'hud';
  hudCanvas.setAttribute('aria-hidden', 'true');
  canvas.after(hudCanvas);
  const hud = hudCanvas.getContext('2d')!;
  // Above it, the instruments' radium glow alone: not dimmed with the HUD at night (see ui/hud.ts gradeMatrix).
  const glowCanvas = document.createElement('canvas');
  glowCanvas.id = 'hud-glow';
  glowCanvas.setAttribute('aria-hidden', 'true');
  hudCanvas.after(glowCanvas);
  const glow = glowCanvas.getContext('2d')!;
  // Rain and snow (render/precip.ts): a third overlay, null if the canvas or its context is unavailable.
  let precip: CanvasRenderingContext2D | null = null;
  try {
    const weatherCanvas = document.createElement('canvas');
    weatherCanvas.id = 'weather';
    weatherCanvas.setAttribute('aria-hidden', 'true');
    precip = weatherCanvas.getContext('2d');
    if (precip) glowCanvas.after(weatherCanvas);
  } catch {
    precip = null;
  }
  const mobile = mobilePlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  let view = fitView(1, 1, 1, mobile);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view = fitView(window.innerWidth, window.innerHeight, dpr, mobile);
    for (const c of [canvas, hudCanvas, glowCanvas, ...(precip ? [precip.canvas] : [])]) {
      const width = view.devW;
      const height = view.devH;
      if (c.width !== width) c.width = width;
      if (c.height !== height) c.height = height;
      // CSS size maps 1:1 onto device pixels, so the browser never resamples the canvas.
      c.style.width = `${width / dpr}px`;
      c.style.height = `${height / dpr}px`;
    }
    ctx!.imageSmoothingEnabled = false; // resizing resets context state
    hud.imageSmoothingEnabled = false;
    glow.imageSmoothingEnabled = false;
    if (precip) precip.imageSmoothingEnabled = false;
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
  return { ctx, hud, glow, precip, view: () => view };
}
