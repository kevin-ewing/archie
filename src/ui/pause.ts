// The pause button (top-right, or P), its menu, and photo mode. DOM controls with faces painted in the
// game's own pixels and palette (nickel-edged plates like the toggles), sized to whole UI pixels.
//
// Menu: RESUME · SETTINGS (ENGINE and MUSIC volume, LOCAL TIME, FULL SCREEN, CONTROLS: shared with the
// landing page) · PHOTO MODE · MAIN MENU.
// Photo mode hides everything but the world and offers SAVE PHOTO (the frame at device resolution, with a
// small Archie mark and the game's address in the bottom-right corner) and BACK.

import { createPx, plot, text, textWidth } from '../core/pixels.ts';
import type { View } from '../render/display.ts';
import { C, label } from './gauges.ts';

export const GAME_URL = 'https://kevin-ewing.github.io/archie/';
const PLATE_H = 11;
export const MENU_W = 74; // UI px: the width of every menu plate (and the volume plates moved into the menu)

/** A menu plate: nickel border lit from the top-left, dark face (lit metal when `on`), centred text. */
export function drawPlate(canvas: HTMLCanvasElement, w: number, s: string, on = false, h = PLATE_H): void {
  const px = createPx(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      plot(px, x, y, edge ? (x + y < 3 ? C.metalLit : x + y > w + h - 5 ? C.metalDark : C.metal) : on ? C.metalLit : C.face);
    }
  }
  text(px, Math.floor((w - textWidth(s)) / 2), Math.floor((h - 5) / 2), s, on ? C.face : C.ink);
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, w, h), 0, 0);
}

/**
 * A volume plate: the same plate as the menu's (drawPlate), its name raised a little, with the slider's
 * track along the bottom and a metal thumb at the level. (The DOM range input sits invisibly over it.)
 */
export function drawVolumePlate(canvas: HTMLCanvasElement, w: number, value: number, s: string): void {
  drawPlate(canvas, w, '', false, PLATE_H + 3);
  const h = PLATE_H + 3;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const px = { w, h, data: img.data };
  text(px, Math.floor((w - textWidth(s)) / 2), 2, s, C.ink);
  for (let x = 3; x < w - 3; x++) plot(px, x, h - 4, C.metalDark);
  const thumb = 3 + Math.round(Math.max(0, Math.min(1, value)) * (w - 7));
  for (let y = h - 6; y <= h - 3; y++) plot(px, thumb, y, y === h - 6 ? C.metalLit : C.metal);
  plot(px, thumb + 1, h - 5, C.metalDark);
  plot(px, thumb + 1, h - 4, C.metalDark);
  ctx.putImageData(img, 0, 0);
}

/** The pause button's face: two upright bars on a small plate. */
function drawPauseFace(canvas: HTMLCanvasElement): void {
  const n = 13;
  const px = createPx(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      plot(px, x, y, edge ? (x + y < 3 ? C.metalLit : x + y > 2 * n - 5 ? C.metalDark : C.metal) : C.face);
    }
  }
  for (const bx of [4, 7]) for (let y = 3; y <= 9; y++) for (let x = bx; x < bx + 2; x++) plot(px, x, y, C.ink);
  canvas.width = canvas.height = n;
  canvas.getContext('2d')!.putImageData(new ImageData(px.data, n, n), 0, 0);
}

/** The lines of the controls card. */
const CONTROLS = ['STEER   MOUSE  A D  ARROWS', 'FULL POWER   HOLD CLICK  SPACE', 'TOUCH   DRAG  DOUBLE TAP HOLD', 'HOLD STEADY   T', 'PAUSE   P  ESC', 'BACK   ESC'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, id?: string) => {
  const e = document.createElement(tag);
  if (id) e.id = id;
  return e;
};

/** A menu button: a plate face that lights up under the pointer or keyboard focus. `s` can change (a switch). */
export function menuItem(s: string | (() => string), act: () => void): HTMLButtonElement {
  const text = typeof s === 'string' ? () => s : s;
  const b = el('button');
  b.type = 'button';
  b.className = 'pause-item';
  const c = el('canvas');
  let lit = false;
  const draw = (on = lit) => {
    lit = on;
    drawPlate(c, MENU_W, text(), on);
    b.setAttribute('aria-label', text().toLowerCase());
  };
  draw(false);
  b.append(c);
  b.addEventListener('click', () => {
    act();
    draw();
  });
  b.addEventListener('pointerenter', () => draw(true));
  b.addEventListener('pointerleave', () => draw(false));
  b.addEventListener('focus', () => draw(true));
  b.addEventListener('blur', () => draw(false));
  return b;
}

/** Size every face canvas under `roots` to whole UI pixels (CSS size = pixel size × the UI scale). */
export function sizeFaces(roots: readonly Element[], px: number): void {
  for (const c of roots.flatMap((root) => [...root.querySelectorAll('canvas')])) {
    c.style.width = `${c.width * px}px`;
    c.style.height = `${c.height * px}px`;
  }
}

export type Settings = { panel: HTMLElement; open: (onBack: () => void) => void; close: () => void; isOpen: () => boolean };

/**
 * The settings panel, shared by the landing page and the pause menu: ENGINE and MUSIC volume, LOCAL TIME
 * (on: flights start at the browser's own time of day), FULL SCREEN, CONTROLS (the controls card), BACK.
 * `volumes` are the volume controls, moved into it.
 */
export function createSettings(volumes: (HTMLElement | null)[], localTime: { on: () => boolean; set: (on: boolean) => void }): Settings {
  const panel = el('div', 'settings-menu');
  panel.className = 'menu-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Settings');
  const title = label('SETTINGS', C.ink);
  title.className = 'pause-title';
  const card = el('div');
  card.className = 'pause-controls';
  card.hidden = true;
  for (const line of CONTROLS) card.append(label(line, C.ink));
  let back = () => {};
  panel.append(
    title,
    ...volumes.filter((v): v is HTMLElement => !!v),
    menuItem(() => `LOCAL TIME  ${localTime.on() ? 'ON' : 'OFF'}`, () => localTime.set(!localTime.on())),
    menuItem('FULL SCREEN', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    }),
    menuItem('CONTROLS', () => (card.hidden = !card.hidden)),
    card,
    menuItem('BACK', () => close()),
  );
  document.body.append(panel);
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    back();
  }
  return {
    panel,
    isOpen: () => !panel.hidden,
    close,
    open(onBack) {
      back = onBack;
      card.hidden = true;
      panel.hidden = false;
      (panel.querySelector('input, .pause-item') as HTMLElement | null)?.focus();
    },
  };
}

export type PauseUi = {
  /** Lay the button out for this view (call when the view changes). */
  layout: (view: View) => void;
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
};

/**
 * Build the pause UI: RESUME · SETTINGS (the shared panel) · PHOTO MODE · MAIN MENU. `onPause` / `onResume`
 * drive the game; `hideForPhoto` lists the elements photo mode hides; `photo` returns the frame to save;
 * `mainMenu` leaves for the landing page.
 */
export function createPauseUi(opts: {
  onPause: () => void;
  onResume: () => void;
  canPause: () => boolean;
  hideForPhoto: () => (HTMLElement | null)[];
  photo: () => HTMLCanvasElement;
  settings: Settings;
  mainMenu: () => void;
}): PauseUi {
  const button = el('button', 'pause-button');
  button.type = 'button';
  button.title = 'Pause (P)';
  button.setAttribute('aria-label', 'Pause (P)');
  const face = el('canvas');
  drawPauseFace(face);
  button.append(face);

  const menu = el('div', 'pause-menu');
  menu.className = 'menu-panel';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Paused');
  const title = label('PAUSED', C.ink);
  title.className = 'pause-title';
  menu.append(
    title,
    menuItem('RESUME', () => close()),
    menuItem('SETTINGS', () => {
      menu.hidden = true;
      opts.settings.open(() => {
        menu.hidden = false;
        (menu.querySelector('.pause-item') as HTMLElement | null)?.focus();
      });
    }),
    menuItem('PHOTO MODE', () => photoMode(true)),
    menuItem('MAIN MENU', () => opts.mainMenu()),
  );

  const bar = el('div', 'photo-bar');
  bar.hidden = true;
  bar.append(
    menuItem('SAVE PHOTO', () => save()),
    menuItem('BACK', () => photoMode(false)),
  );
  document.body.append(button, menu, bar);

  let open = false;
  let photo = false;
  let hidden: { e: HTMLElement; v: string }[] = [];
  function photoMode(on: boolean) {
    photo = on;
    menu.hidden = on;
    bar.hidden = !on;
    button.hidden = on;
    if (on) {
      document.querySelector<HTMLElement>('.tooltip')?.setAttribute('hidden', '');
      hidden = opts.hideForPhoto().filter((e): e is HTMLElement => !!e).map((e) => ({ e, v: e.style.visibility }));
      for (const h of hidden) h.e.style.visibility = 'hidden';
    } else {
      for (const h of hidden) h.e.style.visibility = h.v;
      hidden = [];
    }
  }
  function save() {
    opts.photo().toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `archie-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }
  function openMenu() {
    if (open || !opts.canPause()) return;
    open = true;
    opts.onPause();
    menu.hidden = false;
    (menu.querySelector('.pause-item') as HTMLElement | null)?.focus();
  }
  function close() {
    if (!open) return;
    if (photo) photoMode(false);
    if (opts.settings.isOpen()) opts.settings.panel.hidden = true; // (closing straight from settings)
    open = false;
    menu.hidden = true;
    button.blur();
    opts.onResume();
  }
  button.addEventListener('click', (e) => {
    (open ? close : openMenu)();
    if (e.detail > 0) button.blur();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !e.repeat && (open || opts.canPause())) (open ? close : openMenu)();
    else if (e.code === 'Escape' && open) photo ? photoMode(false) : opts.settings.isOpen() ? opts.settings.close() : close();
    else if (e.code === 'Escape' && !e.repeat && opts.canPause()) openMenu(); // Esc pauses too (and backs out, above)
    else return;
    e.preventDefault();
  });

  let key = '';
  return {
    isOpen: () => open,
    open: openMenu,
    close,
    layout(view) {
      const px = view.uiScale / (window.devicePixelRatio || 1); // CSS px per UI px
      const k = `${px}`;
      if (k === key) return;
      key = k;
      document.documentElement.style.setProperty('--ui-px', `${px}px`);
      sizeFaces([button, menu, bar, opts.settings.panel], px);
    },
  };
}
