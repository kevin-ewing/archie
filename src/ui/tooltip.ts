// Tooltips: what a thing is, when you point at it (or focus it, or press and hold it on a touch screen): a
// small nickel-edged plate like the menus', its name in the game's lettering over a line or two about it.
// For DOM controls (`attach`: the compass, the Hold switch, the things on the desk) and for areas of a canvas
// (`area`: the instruments, which are drawn, not elements). One tooltip shows at a time.

import { createPx, plot, text, textWidth } from '../core/pixels.ts';
import { C } from './gauges.ts';
import { wrapWords } from './voice.ts';

export type Tip = { title: string; body?: string };

const DELAY_MS = 380; // pointing at something this long shows its tip …
const HOLD_MS = 450; // … as does pressing and holding it (touch)

/** The tip as a plate (UI px): its title, a rule, and the body wrapped to `width`. Pure. */
export function tipPlate(tip: Tip, width = 120) {
  const body = tip.body ? wrapWords(tip.body.toUpperCase(), width - 10) : [];
  const title = tip.title.toUpperCase();
  const w = Math.max(textWidth(title), ...body.map(textWidth), 20) + 10;
  const h = 11 + (body.length ? 3 + body.length * 7 : 0);
  const px = createPx(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    plot(px, x, y, edge ? (x + y < 3 ? C.metalLit : x + y > w + h - 5 ? C.metalDark : C.metal) : C.face);
  }
  text(px, 5, 3, title, C.ink);
  if (body.length) {
    for (let x = 4; x < w - 4; x++) plot(px, x, 10, C.metalDark);
    body.forEach((l, i) => text(px, 5, 13 + i * 7, l, [200, 194, 176, 255]));
  }
  return px;
}

/** Where the tip goes: beside the point (or under the box), turned back inside the window. Pure. */
export function placeTip(at: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }, gap = 14) {
  let x = at.x + gap, y = at.y + gap;
  if (x + size.w > view.w - 4) x = at.x - gap - size.w;
  if (y + size.h > view.h - 4) y = at.y - gap - size.h;
  return { x: Math.round(Math.max(4, Math.min(view.w - size.w - 4, x))), y: Math.round(Math.max(4, Math.min(view.h - size.h - 4, y))) };
}

export function createTooltips(uiPx: () => number) {
  const el = document.createElement('canvas');
  el.className = 'tooltip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.append(el);
  let showingAt = 0, timer = 0;
  let current: Tip | null = null;

  function show(tip: Tip, at: { x: number; y: number }) {
    const u = uiPx();
    if (current !== tip) {
      const px = tipPlate(tip);
      el.width = px.w;
      el.height = px.h;
      el.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
      el.style.width = `${px.w * u}px`;
      el.style.height = `${px.h * u}px`;
      el.setAttribute('aria-label', tip.body ? `${tip.title}. ${tip.body}` : tip.title);
      current = tip;
    }
    const p = placeTip(at, { w: el.width * u, h: el.height * u }, { w: innerWidth, h: innerHeight });
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.hidden = false;
    showingAt = performance.now();
  }
  function hide() {
    clearTimeout(timer);
    el.hidden = true;
    current = null;
  }
  /** Show `tip` after the usual pause (at once if another was just showing). */
  function soon(tip: Tip | null, at: { x: number; y: number }, wait = DELAY_MS) {
    clearTimeout(timer);
    if (!tip) return hide();
    if (!el.hidden || performance.now() - showingAt < 300) return show(tip, at);
    timer = window.setTimeout(() => show(tip, at), wait);
  }
  // A long press shows it on touch screens; the finger moving (a drag: steering, say) cancels it.
  const press = (e: PointerEvent, tip: () => Tip | null) => {
    if (e.pointerType !== 'touch') return;
    const start = { x: e.clientX, y: e.clientY };
    const t = tip();
    if (!t) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => show(t, start), HOLD_MS);
    const cancel = (m: PointerEvent) => { if (m.type !== 'pointermove' || Math.hypot(m.clientX - start.x, m.clientY - start.y) > 8) { clearTimeout(timer); off(); } };
    const off = () => { removeEventListener('pointermove', cancel); removeEventListener('pointerup', cancel); removeEventListener('pointercancel', cancel); };
    addEventListener('pointermove', cancel);
    addEventListener('pointerup', cancel);
    addEventListener('pointercancel', cancel);
  };
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !el.hidden) hide(); }, true); // a tap elsewhere puts it away
  addEventListener('keydown', (e) => { if (e.code === 'Escape') hide(); });

  return {
    /** Give a control its tip (shown on hover, focus or a long press). Returns a function that removes it. */
    attach(target: HTMLElement, tip: Tip | (() => Tip | null)) {
      const get = typeof tip === 'function' ? tip : () => tip;
      target.removeAttribute('title'); // (the browser's own tooltip would show as well)
      const enter = (e: PointerEvent) => { if (e.pointerType !== 'touch') soon(get(), { x: e.clientX, y: e.clientY }); };
      const move = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !el.hidden) show(current ?? get()!, { x: e.clientX, y: e.clientY }); };
      const down = (e: PointerEvent) => press(e, get);
      const focus = () => { if (!target.matches(':focus-visible')) return; const r = target.getBoundingClientRect(); soon(get(), { x: r.left, y: r.bottom - 6 }, 150); };
      const ls: [string, EventListener][] = [['pointerenter', enter as EventListener], ['pointermove', move as EventListener], ['pointerleave', hide], ['pointerdown', down as EventListener], ['focus', focus], ['blur', hide], ['click', hide]];
      for (const [k, f] of ls) target.addEventListener(k, f);
      return () => { for (const [k, f] of ls) target.removeEventListener(k, f); hide(); };
    },
    /** Tips for areas of `target` (a canvas, say): `hit(x, y)` in client px gives the tip there, or null. */
    area(target: HTMLElement, hit: (x: number, y: number) => Tip | null) {
      let over: Tip | null = null;
      const move = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const t = hit(e.clientX, e.clientY);
        if (t !== over) { over = t; soon(t, { x: e.clientX, y: e.clientY }); }
        else if (t && !el.hidden) show(t, { x: e.clientX, y: e.clientY });
      };
      const leave = () => { over = null; hide(); };
      const down = (e: PointerEvent) => press(e, () => hit(e.clientX, e.clientY));
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerleave', leave);
      target.addEventListener('pointerdown', down);
      return () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerleave', leave); target.removeEventListener('pointerdown', down); hide(); };
    },
    hide,
  };
}
export type Tooltips = ReturnType<typeof createTooltips>;
