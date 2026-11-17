// The Story screen: the pilot's desk in the barn at Rook Field, from above (picture: story/barn-art.ts), in
// flight's own pixel size. Everything on it you can use is a button. Press one and it's picked up: it comes
// to the top of the pile and is held up close, with what you can do with it. The orders and the goggles are how you
// go and fly; the logbook lists your story flights. A column of plates (top right) does
// the main things directly: TAKE OFF, LOGBOOK, SETTINGS, MAIN MENU. `?story` opens it from the address.

import { createPx, plot, text, textWidth, type Px, type RGBA } from '../core/pixels.ts';
import { menuItem, MENU_W, sizeFaces } from '../ui/pause.ts';
import { BARN_LOADING, barnScene, drawing, logbookDrawing, ordersDrawing, Z, type BarnInfo, type BarnScene, type Spot } from './barn-art.ts';
import * as I from './desk-items.ts';
import { messagePad, sealedLetter } from './clutter.ts';
import './barn.css';

export type LogEntry = { sortie: number; date: string; minutes: number };
export type BarnOptions = {
  info: BarnInfo;
  resuming: boolean; // a story flight to carry on from
  log: readonly LogEntry[];
  uiPx: () => number; // CSS px per UI px (the plates)
  gamePx: () => number; // CSS px per game px: flight's pixel size, used for the desk too
  /** The watch's time of day in hours (default: the device's clock, to the second). */
  now?: () => number;
  /** Draw the layout's boxes over the desk (barn-art.ts `DebugBox`): for working on the arrangement. */
  debugBoxes?: boolean;
  onFly: () => void;
  onSettings: (back: () => void) => void;
  onClose: () => void;
};

const INK: RGBA = I.P.ink;
const PAPER: RGBA = I.P.cream;
const EDGE: RGBA = I.P.paperShade;
const LABEL: Record<I.ItemId, string> = { orders: 'ORDERS', chart: 'CHART', letters: 'LETTER', logbook: 'LOG BOOK', clockcode: 'CLOCK CODE', calendar: 'CALENDAR', mug: 'COFFEE', watch: 'WATCH', goggles: 'GOGGLES', pad: 'MESSAGE PAD', coin: 'SIXPENCE' };

/** Words wrapped to `w` px in the game's lettering ('' = a blank line). */
function wrap(lines: readonly string[], w: number): string[] {
  const out: string[] = [];
  for (const l of lines) {
    let cur = '';
    for (const word of l.toUpperCase().split(' ').filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && textWidth(next) > w) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

const toCanvas = (px: Px, scale: number, label?: string) => {
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  c.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  c.style.width = `${px.w * scale}px`;
  c.style.height = `${px.h * scale}px`;
  if (label) {
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', label);
  } else c.setAttribute('aria-hidden', 'true');
  return c;
};

/** A raster as a canvas, `pad` transparent px all round. */
const bitmap = (px: Px, pad: number) => {
  const c = document.createElement('canvas');
  c.width = px.w + 2 * pad;
  c.height = px.h + 2 * pad;
  c.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), pad, pad);
  return c;
};

/** A note in the game's lettering, on a slip of paper. */
function note(body: readonly string[], w: number): Px {
  const lines = wrap(body, w - 12);
  const h = lines.length * 7 + 9;
  const px = createPx(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(px, x, y, x === 0 || y === 0 || x === w - 1 || y === h - 1 ? EDGE : PAPER);
  lines.forEach((l, i) => text(px, 6, 5 + i * 7, l, INK));
  return px;
}

/** The layout's boxes over the desk, each thing's own box as it lies: cyan (red where nothing may lie on it),
 * what may never be covered (yellow), the plates' room (magenta). The buttons are these same boxes. */
function drawBoxes(ctx: CanvasRenderingContext2D, boxes: BarnScene['boxes'], s: number) {
  const STYLE = { box: '#3ad', shy: '#f90', keep: '#fd2', clear: '#e4e' } as const, size = Math.max(9, Math.round(s * 2.4));
  ctx.save();
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = 'top';
  for (const b of boxes) {
    ctx.strokeStyle = b.kind === 'box' && b.bears === false ? '#f44' : STYLE[b.kind];
    ctx.lineWidth = b.kind === 'box' ? 2 : 1;
    ctx.beginPath();
    b.quad.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.closePath();
    ctx.stroke();
    const [tx, ty] = b.quad.reduce((q, p) => (p[1] < q[1] ? p : q)).map((v) => Math.round(v * s) + 3), w = ctx.measureText(b.label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tx - 2, ty - 1, w + 4, size + 2);
    ctx.fillStyle = ctx.strokeStyle; ctx.fillText(b.label, tx, ty);
  }
  ctx.restore();
}


/** The barn's loading screen: the desk's own brown, a message in the game's lettering above the same three
 * pulsing pixels as the first load (index.html's .landing-wait). */
function barnLoading() {
  const el = document.createElement('div');
  el.className = 'barn-loading';
  el.setAttribute('role', 'status');
  const wait = document.createElement('div');
  wait.className = 'landing-wait';
  const msg = document.createElement('canvas');
  msg.className = 'barn-loading-message';
  const dots = document.createElement('div');
  dots.className = 'landing-dots';
  dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  wait.append(msg, dots);
  el.append(wait);
  const say = () => {
    const s = BARN_LOADING[Math.floor(Math.random() * BARN_LOADING.length)];
    const px = createPx(textWidth(s), 5);
    text(px, 0, 0, s, [20, 19, 15, 255]);
    msg.width = px.w;
    msg.height = px.h;
    msg.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
    msg.style.setProperty('--w', String(px.w));
    msg.style.setProperty('--h', String(px.h));
    el.setAttribute('aria-label', `Loading. ${s.toLowerCase()}`);
  };
  let up = false;
  return {
    el,
    show() { if (!up) { up = true; say(); el.hidden = false; } },
    hide() { up = false; el.hidden = true; },
  };
}

export function openBarn(o: BarnOptions): { close: () => void; isOpen: () => boolean } {
  const room = document.createElement('div');
  room.className = 'barn';
  room.setAttribute('role', 'dialog');
  room.setAttribute('aria-label', 'Your desk in the barn at Rook Field');
  const art = document.createElement('canvas');
  art.className = 'barn-art';
  art.setAttribute('aria-hidden', 'true');
  const things = document.createElement('nav');
  things.className = 'barn-things';
  things.setAttribute('aria-label', 'On the desk');
  const plates = document.createElement('div');
  plates.className = 'barn-plates';
  const held = document.createElement('div');
  held.className = 'barn-held';
  held.hidden = true;
  // What lies on top of the thing being picked up or put down, cut to its outline: drawn over the held thing
  // so it comes out from under them (and goes back under them) rather than jumping over the pile.
  const covers = document.createElement('canvas');
  covers.className = 'barn-covers';
  covers.setAttribute('aria-hidden', 'true');
  covers.hidden = true;
  const loading = barnLoading();
  room.append(art, things, plates, held, covers, loading.el);
  document.body.append(room);

  const flyLabel = () => (o.resuming ? 'CONTINUE' : o.info.sortie > 1 ? `SORTIE ${o.info.sortie}` : 'FIRST SORTIE');
  const fly = () => o.onFly();
  const order: I.ItemId[] = []; // things picked up, in the order they were: the last is on top
  let from: HTMLElement | null = null;
  let hover: I.ItemId | null = null; // lifted a little off the desk under the pointer or focus
  let heldId: I.ItemId | null = null; // picked up: gone from the desk while it's held
  let quiet = false; // focus going back to a thing as it's put down: that alone doesn't lift it
  let pointer = { x: -1, y: -1 }; // where the pointer last was (client px)
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const ms = (t: number) => (calm.matches ? 0 : t);
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'; // quick away, a long soft settle
  const DIM = 'rgb(14 11 8 / 0.62)';
  const CLEAR = 'rgb(14 11 8 / 0)';

  // Hover: the thing rises over ~0.12 s (and sinks back), drawn on device pixels so the rise is smooth.
  const lifted = new Map<I.ItemId, number>(); // 0 … 1, eased toward 1 for the hovered thing, 0 for the rest
  let rising = 0;
  const RISE_MS = 120;
  function rise(at: number, last = at) {
    let busy = false;
    for (const id of new Set([...lifted.keys(), ...(hover ? [hover] : [])])) {
      const v = lifted.get(id) ?? 0, to = id === hover ? 1 : 0;
      const next = calm.matches ? to : to > v ? Math.min(1, v + (at - last) / RISE_MS) : Math.max(0, v - (at - last) / RISE_MS);
      if (next === 0) lifted.delete(id); else lifted.set(id, next);
      busy ||= next !== to;
    }
    paint();
    rising = busy ? requestAnimationFrame((t) => rise(t, at)) : 0;
  }
  const setHover = (id: I.ItemId | null) => {
    if (id === hover) return;
    hover = id;
    if (!rising) rising = requestAnimationFrame((t) => rise(t, t - 16));
  };
  const liftOf = (id: I.ItemId | null) => { const v = id ? lifted.get(id) ?? 0 : 0; return 2 * (1 - (1 - v) * (1 - v)); };

  /** The held thing's transform that puts it back exactly where it lies on the desk (turned, at its desk size). */
  const onDesk = (id: I.ItemId, el: HTMLElement): string => {
    const d = scene?.drawn.find((e) => e.id === id);
    if (!d) return 'translateY(40vh)';
    const g = o.gamePx(), r = el.getBoundingClientRect();
    const dx = d.cx * g - (r.left + r.width / 2), dy = (d.cy - liftOf(id)) * g - (r.top + r.height / 2);
    return `translate(${dx}px, ${dy}px) rotate(${d.turn}rad) scale(${(d.art.w * d.k) / Math.max(1, el.offsetWidth / g)})`;
  };
  let flight: Animation[] = [];
  const stop = () => { flight.forEach((a) => a.cancel()); flight = []; covers.hidden = true; };

  /** Put it back: it flies home to its place on the desk as the room lightens, then lies there again. */
  const putDown = () => {
    if (!heldId || held.hidden) return;
    const id = heldId;
    things.inert = plates.inert = false;
    const thing = held.querySelector<HTMLElement>('.barn-held-thing');
    const rest = [...held.querySelectorAll<HTMLElement>('.barn-held-lift > :not(.barn-held-thing)')];
    stop();
    const LAND = 300;
    flight = [
      held.animate([{ backgroundColor: DIM }, { backgroundColor: CLEAR }], { duration: ms(LAND - 20), easing: 'ease-in', fill: 'forwards' }),
      ...rest.map((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(120), fill: 'forwards' })),
      ...(thing ? [thing.animate([{ transform: 'none' }, { transform: onDesk(id, thing) }], { duration: ms(LAND), easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' })] : []),
      // Once it has landed (still now), whatever lies on top of its place closes back over it.
      ...(drawCovers(id) ? [covers.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(110), delay: ms(LAND), easing: 'ease-out', fill: 'both' })] : []),
    ];
    Promise.all(flight.map((a) => a.finished)).then(() => {
      heldId = null;
      paint(); // back on the desk, under what's on it, in the same frame the flying copy and the covers go
      held.hidden = true;
      stop();
      quiet = true;
      from?.focus({ preventScroll: true });
      quiet = false;
      // Back on the desk it lifts only if the pointer is over it (or over whatever else it's over).
      const under = (document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null)?.closest<HTMLElement>('.barn-thing');
      setHover((under?.dataset.id as I.ItemId | undefined) ?? null);
    }, () => {}); // cancelled: picked up again before it landed
  };
  room.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
  room.addEventListener('pointerdown', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
  // Pressing anywhere but the thing itself (or one of its own controls) puts it down.
  held.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.barn-held-thing, button')) putDown(); });
  /** Pick a thing up: it lifts off the desk from where it lies, turning square as it comes up close, the room
   * dimming behind it; then its note and what you can do with it appear under it. */
  function pickUp(id: I.ItemId, button: HTMLElement | null) {
    from = button;
    stop();
    const covered = drawCovers(id); // what lies on it now, before it comes to the top of its pile
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    order.push(id);
    // Lift it to the top of its own height on the desk, without rebuilding the scene.
    if (scene) {
      const all = scene.drawn, j = all.findIndex((d) => d.id === id);
      if (j >= 0) {
        const [d] = all.splice(j, 1), above = all.findIndex((e) => e.id !== null && Z[e.id] > Z[id]);
        all.splice(above < 0 ? all.length : above, 0, d);
      }
    }
    const g = o.gamePx();
    const { art: pic, body, actions } = USE[id]();
    const w = Math.max(96, Math.min(170, Math.floor(innerWidth / g) - 12));
    const lift = document.createElement('div');
    lift.className = 'barn-held-lift';
    const thing = toCanvas(pic, g, LABEL[id].toLowerCase());
    thing.classList.add('barn-held-thing');
    lift.append(thing, ...(body.length ? [toCanvas(note(body, Math.min(w, Math.max(pic.w, 96))), g, body.join(' '))] : []));
    const row = document.createElement('div');
    row.className = 'barn-held-plates';
    for (const [name, act] of actions) row.append(menuItem(name, act));
    if (actions.length) lift.append(row);
    held.replaceChildren(lift);
    sizeFaces([row], o.uiPx());
    held.hidden = false;
    const from0 = onDesk(id, thing); // measured where it'll come to rest, before it moves
    heldId = id;
    hover = null;
    lifted.delete(id);
    paint(); // it leaves the desk in the same frame it starts to rise, so it never shows twice
    // Under something? First what lies on it fades away (the thing still where it lies), then it rises: it never
    // shows through what was on top of it, nor jumps out over it.
    const CLEAR_MS = covered ? ms(90) : 0;
    flight = [
      held.animate([{ backgroundColor: CLEAR }, { backgroundColor: DIM }], { duration: ms(320), delay: CLEAR_MS, easing: 'ease-out', fill: 'both' }),
      thing.animate([{ transform: from0 }, { transform: 'none' }], { duration: ms(420), delay: CLEAR_MS, easing: EASE, fill: 'both' }),
      ...[...lift.children].filter((e) => e !== thing).map((e) => (e as HTMLElement).animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: ms(220), delay: CLEAR_MS + ms(260), easing: 'ease-out', fill: 'backwards' })),
      ...(covered ? [covers.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLEAR_MS, easing: 'ease-in', fill: 'forwards' })] : []),
    ];
    things.inert = plates.inert = true;
    ((row.querySelector('button') as HTMLElement | null) ?? held).focus({ preventScroll: true });
  }
  held.tabIndex = -1;
  const takeOff: [string, () => void] = [o.resuming ? 'CONTINUE' : 'TAKE OFF', fly];
  const logLines = () => (o.log.length ? o.log.map((e) => `SORTIE ${e.sortie}  ${e.date}  ${e.minutes} MIN`) : ['NO SORTIES FLOWN YET.', 'EACH FLIGHT IS WRITTEN UP HERE WHEN YOU COME BACK.']);
  const USE: Record<I.ItemId, () => { art: Px; body: string[]; actions: [string, () => void][] }> = {
    orders: () => ({ art: ordersDrawing(o.info), body: [], actions: [takeOff] }), // the sheet says it all
    chart: () => ({ art: drawing('chart:held', () => I.chartArt()), body: ['OUR SECTOR. THE GERMAN LINE IN RED, OURS IN BLUE. BTY: OUR BATTERY. TGT: TODAY.'], actions: [] }),
    letters: () => ({ art: drawing('letters', sealedLetter), body: ['A LETTER FROM HOME, IN MOTHER\'S HAND. STILL SEALED.'], actions: [] }),
    logbook: () => ({ art: logbookDrawing(o.info), body: logLines(), actions: [[flyLabel(), fly]] }),
    clockcode: () => ({ art: drawing('clockcode', I.clockcodeArt), body: ['TARGET AT THE CENTRE, TWELVE IS NORTH. RINGS A TO F: 50 TO 500 YARDS. B4: 100 YARDS, A LITTLE SOUTH OF EAST.'], actions: [] }),
    pad: () => ({ art: drawing('pad', messagePad), body: ['YOUR SPOTTING NOTES FROM THE LAST SHOOT, IN PENCIL.'], actions: [] }),
    goggles: () => ({ art: drawing('goggles', I.gogglesArt), body: ['FLYING GOGGLES: LEATHER AND NICKEL, THE GLASS CLEAR BUT DUSTY.'], actions: [takeOff] }),
    coin: () => ({ art: drawing('coin', I.coinArt), body: ['A SIXPENCE, DRILLED THROUGH FOR A CORD. FOR LUCK.'], actions: [] }),
    mug: () => ({ art: drawing('coffee', I.coffeeArt), body: ['COFFEE FROM THE MESS. GONE COLD.'], actions: [] }),
    watch: () => ({ art: I.watchArt(clock(), o.info.sunset ?? 19.5), body: ['THE RED MARK ON THE RIM IS SUNSET. BE DOWN BEFORE IT.'], actions: [] }),
    calendar: () => { const big = innerWidth / o.gamePx() >= 480 && innerHeight / o.gamePx() >= 300; return { art: drawing(`calendar:${o.info.day}:${o.info.month}:${o.info.year}:${big}`, () => I.calendarArt(o.info, big)), body: ['THE CALENDAR ONLY MOVES WHEN YOU FLY.'], actions: [] }; },
  };
  // Make every close-up's drawing while the browser is idle, so picking something up never waits on one.
  const idle = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 200));
  for (const id of Object.keys(USE) as I.ItemId[]) idle(() => { if (open) USE[id](); });

  plates.append(
    menuItem(flyLabel(), fly),
    menuItem('LOG BOOK', () => pickUp('logbook', plates.children[1] as HTMLElement)),
    menuItem('SETTINGS', () => {
      room.hidden = true;
      o.onSettings(() => {
        room.hidden = false;
        (plates.children[2] as HTMLElement).focus();
      });
    }),
    menuItem('MAIN MENU', () => shut(true)),
  );

  let scene: BarnScene | null = null;
  let scale = 1;
  let maps = new Map<Px, HTMLCanvasElement>();
  // The watch's changing drawings: one canvas each, redrawn, rather than a new one each time.
  const reusable = () => {
    const c = document.createElement('canvas');
    return (px: Px) => {
      if (c.width !== px.w + 2 || c.height !== px.h + 2) { c.width = px.w + 2; c.height = px.h + 2; }
      c.getContext('2d')!.putImageData(new ImageData(px.data, px.w, px.h), 1, 1);
      return c;
    };
  };
  const faceBitmap = reusable();
  const clock = o.now ?? (() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; });
  /** Set up a context to draw `d` turned whole at its place, `off` game px down-right, scaled to the device. */
  const place = (ctx: CanvasRenderingContext2D, d: BarnScene['drawn'][number], ox: number, oy: number) => {
    const s = scale;
    ctx.setTransform(1, 0, 0, 1, Math.round((d.cx + ox) * s), Math.round((d.cy + oy) * s));
    ctx.scale(s, s);
    ctx.rotate(d.turn);
    if (d.k !== 1) ctx.scale(d.k, d.k); // drawn smaller on a small screen (k × the device pixels is whole)
  };
  let shownMinute = -1; // the minute the watch's face (hour and minute hands) was last drawn at
  const mapOf = (px: Px, pad: number) => maps.get(px) ?? (maps.set(px, bitmap(px, pad)), maps.get(px)!);
  /** Draw onto the covers layer what lies on top of `id` where it lies (each thing after it in the pile,
   * with its shadow), cut to `id`'s own outline; false if nothing lies on it. */
  function drawCovers(id: I.ItemId): boolean {
    if (!scene) return false;
    const all = scene.drawn, j = all.findIndex((d) => d.id === id);
    if (j < 0) return false;
    const me = all[j], above = all.slice(j + 1).filter((d) => d.id !== heldId || d.id === id);
    if (!above.length) return false;
    if (covers.width !== art.width || covers.height !== art.height) { covers.width = art.width; covers.height = art.height; }
    Object.assign(covers.style, { width: art.style.width, height: art.style.height });
    const ctx = covers.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, covers.width, covers.height);
    ctx.imageSmoothingEnabled = false;
    const now = clock();
    for (const d of above) {
      const face = d.live ? I.watchArt(now, o.info.sunset ?? 19.5) : d.art;
      for (const [img, off] of [[d.shadow, d.depth], [face, 0]] as const) {
        place(ctx, d, off, off);
        ctx.drawImage(d.live && img === face ? faceBitmap(img) : mapOf(img, 1), -img.w / 2 - 1, -img.h / 2 - 1);
      }
    }
    ctx.globalCompositeOperation = 'destination-in'; // only over the thing itself
    place(ctx, me, 0, 0);
    ctx.drawImage(mapOf(me.art, 1), -me.art.w / 2 - 1, -me.art.h / 2 - 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const shown = ctx.getImageData(0, 0, covers.width, covers.height).data.some((v, i) => i % 4 === 3 && v > 0);
    covers.hidden = !shown;
    return shown;
  }
  /** The desk at device resolution: the planks on the game-pixel grid, then every thing drawn turned whole
   * (nearest-neighbour, in a 1-px transparent border so the canvas's antialiased edge stays off its pixels).
   * The watch has no seconds hand, so the desk is redrawn only when its minute hand moves. */
  function paint() {
    if (!scene) return;
    const s = scale;
    const ctx = art.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mapOf(scene.px, 0), 0, 0, scene.px.w * s, scene.px.h * s);
    const now = clock();
    shownMinute = Math.floor(now * 60);
    for (const d of scene.drawn) {
      if (d.id && d.id === heldId) continue; // it's in your hands, not on the desk
      const face = d.live ? I.watchArt(now, o.info.sunset ?? 19.5) : d.art;
      const up = liftOf(d.id); // lifted: it rises, and its shadow falls further away
      for (const [img, off] of [[d.shadow, d.depth + up], [face, -up]] as const) {
        place(ctx, d, img === face ? 0 : off, off);
        ctx.drawImage(d.live && img === face ? faceBitmap(img) : mapOf(img, 1), -img.w / 2 - 1, -img.h / 2 - 1);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (o.debugBoxes) drawBoxes(ctx, scene.boxes, s);
  }
  let timer = 0;
  const tick = () => {
    if (!room.hidden && !document.hidden && Math.floor(clock() * 60) !== shownMinute) paint(); // a new minute: the hands move
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 3); // checked each second
  };
  tick();

  let spots: Spot[] = [];
  let key = '';
  function layout() {
    const g = o.gamePx();
    const W = Math.max(80, Math.ceil(innerWidth / g));
    const H = Math.max(80, Math.ceil(innerHeight / g));
    const k = `${W}x${H}:${g}`;
    if (k === key) return;
    key = k;
    // Keep the plates' corner clear of the usable things (the plates are in UI px; the desk in game px).
    const r = o.uiPx() / g;
    const clear = [{ x: W - Math.ceil((MENU_W + 16) * r), y: 0, w: Math.ceil((MENU_W + 16) * r), h: Math.ceil(70 * r) }];
    scale = Math.max(1, Math.round(g * (window.devicePixelRatio || 1)));
    scene = barnScene(W, H, o.info, order, clear, scale);
    art.width = W * scale;
    art.height = H * scale;
    art.style.width = `${W * g}px`;
    art.style.height = `${H * g}px`;
    maps = new Map();
    paint();
    spots = scene.spots;
    things.replaceChildren(...spots.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'barn-thing';
      b.setAttribute('aria-label', LABEL[s.id].toLowerCase());
      const { cx, cy, w, h, turn } = s.box; // pressed by its own box, turned as it lies
      Object.assign(b.style, { left: `${(cx - w / 2) * g}px`, top: `${(cy - h / 2) * g}px`, width: `${w * g}px`, height: `${h * g}px`, transform: `rotate(${turn}rad)` });
      b.dataset.id = s.id;
      const lift = (on: boolean) => setHover(on ? s.id : hover === s.id ? null : hover);
      b.addEventListener('pointerenter', () => lift(true));
      b.addEventListener('pointerleave', () => lift(false));
      b.addEventListener('focus', () => { if (!quiet) lift(true); });
      b.addEventListener('blur', () => lift(false));
      b.addEventListener('click', () => pickUp(s.id, b));
      return b;
    }));
    sizeFaces([things, plates], o.uiPx());
  }
  // Working out the arrangement can take a moment (most of a second the first time; then very little), so it
  // happens behind the barn's loading screen: shown at once, the arrangement worked out once it's on screen
  // (two frames later), then lifted. A resize brings it back until the window has stopped changing.
  let pending = 0, settle = 0;
  const arrangeBehind = (wait: number) => {
    loading.show();
    clearTimeout(settle);
    cancelAnimationFrame(pending);
    settle = window.setTimeout(() => {
      pending = requestAnimationFrame(() => (pending = requestAnimationFrame(() => {
        pending = 0;
        if (!open) return;
        if (heldId) { stop(); held.hidden = true; things.inert = plates.inert = false; heldId = null; } // (a resize puts it down)
        layout();
        loading.hide();
      })));
    }, wait);
  };
  arrangeBehind(0);
  const relayout = () => arrangeBehind(180); // once the window has been still for a moment
  addEventListener('resize', relayout);
  const keys = (e: KeyboardEvent) => {
    if (room.hidden || e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!held.hidden) putDown();
    else shut(true);
  };
  addEventListener('keydown', keys, true);
  let open = true;
  /** Leave the desk; `notify` for MAIN MENU (taking off closes it quietly). */
  function shut(notify: boolean) {
    if (!open) return;
    open = false;
    clearTimeout(timer);
    cancelAnimationFrame(rising);
    removeEventListener('resize', relayout);
    cancelAnimationFrame(pending);
    clearTimeout(settle);
    removeEventListener('keydown', keys, true);
    room.remove();
    if (notify) o.onClose();
  }
  (plates.firstElementChild as HTMLElement | null)?.focus();
  return { isOpen: () => open, close: () => shut(false) };
}
