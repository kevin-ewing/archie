// The Story screen: the pilot's desk in the barn at Rook Field, from above (picture: story/barn-art.ts), in
// flight's own pixel size. Everything on it you can use is a button. Press one and it's picked up: it comes
// to the top of the pile and is held up close, with what you can do with it. The flying helmet is how you
// go and fly (as are the orders); the logbook lists your story flights. A column of plates (top right) does
// the main things directly: TAKE OFF, LOGBOOK, SETTINGS, MAIN MENU. `?story` opens it from the address.

import { createPx, plot, text, textWidth, type Px, type RGBA } from '../core/pixels.ts';
import { plaque } from '../ui/gauges.ts';
import { menuItem, MENU_W, sizeFaces } from '../ui/pause.ts';
import { barnScene, type BarnInfo, type Spot } from './barn-art.ts';
import * as I from './desk-items.ts';
import './barn.css';

export type LogEntry = { sortie: number; date: string; minutes: number };
export type BarnOptions = {
  info: BarnInfo;
  resuming: boolean; // a story flight to carry on from
  log: readonly LogEntry[];
  uiPx: () => number; // CSS px per UI px (the plates)
  gamePx: () => number; // CSS px per game px: flight's pixel size, used for the desk too
  onFly: () => void;
  onSettings: (back: () => void) => void;
  onClose: () => void;
};

const INK: RGBA = I.P.ink;
const PAPER: RGBA = I.P.cream;
const EDGE: RGBA = I.P.paperShade;
const LABEL: Record<I.ItemId, string> = { helmet: 'FLYING HELMET', orders: 'ORDERS', chart: 'CHART', letters: 'LETTERS', photo: 'PHOTOGRAPH', logbook: 'LOG BOOK', clockcode: 'CLOCK CODE', calendar: 'CALENDAR' };

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

/** A note in the game's lettering, on a slip of paper. */
function note(body: readonly string[], w: number): Px {
  const lines = wrap(body, w - 12);
  const h = lines.length * 7 + 9;
  const px = createPx(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(px, x, y, x === 0 || y === 0 || x === w - 1 || y === h - 1 ? EDGE : PAPER);
  lines.forEach((l, i) => text(px, 6, 5 + i * 7, l, INK));
  return px;
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
  room.append(art, things, plates, held);
  document.body.append(room);

  const flyLabel = () => (o.resuming ? 'CONTINUE' : o.info.sortie > 1 ? `SORTIE ${o.info.sortie}` : 'FIRST SORTIE');
  const fly = () => o.onFly();
  const order: I.ItemId[] = []; // things picked up, in the order they were: the last is on top
  let from: HTMLElement | null = null;
  const putDown = () => {
    held.hidden = true;
    things.inert = plates.inert = false;
    from?.focus();
  };
  /** Pick a thing up: to the top of the pile, and held up close with its note and what you can do with it. */
  function pickUp(id: I.ItemId, button: HTMLElement | null) {
    from = button;
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    order.push(id);
    key = '';
    layout();
    const g = o.gamePx();
    const { art: pic, body, actions } = USE[id]();
    const w = Math.max(96, Math.min(170, Math.floor(innerWidth / g) - 12));
    held.replaceChildren(toCanvas(pic, g, LABEL[id].toLowerCase()), ...(body.length ? [toCanvas(note(body, Math.min(w, Math.max(pic.w, 96))), g, body.join(' '))] : []));
    const row = document.createElement('div');
    row.className = 'barn-held-plates';
    for (const [name, act] of actions) row.append(menuItem(name, act));
    row.append(menuItem('PUT DOWN', putDown));
    held.append(row);
    sizeFaces([row], o.uiPx());
    held.hidden = false;
    things.inert = plates.inert = true;
    (row.querySelector('button') as HTMLElement | null)?.focus();
  }
  const takeOff: [string, () => void] = [o.resuming ? 'CONTINUE' : 'TAKE OFF', fly];
  const logLines = () => (o.log.length ? o.log.map((e) => `SORTIE ${e.sortie}  ${e.date}  ${e.minutes} MIN`) : ['NO SORTIES FLOWN YET.', 'EACH FLIGHT IS WRITTEN UP HERE WHEN YOU COME BACK.']);
  const USE: Record<I.ItemId, () => { art: Px; body: string[]; actions: [string, () => void][] }> = {
    helmet: () => ({ art: I.helmetArt(), body: [o.resuming ? 'BACK TO THE MACHINE: CARRY ON WHERE YOU LEFT OFF.' : `SORTIE ${o.info.sortie}. THE MACHINE IS WAITING ON THE FIELD.`], actions: [takeOff] }),
    orders: () => ({ art: I.ordersArt(o.info.sortie, o.info.date), body: ['ARTILLERY OBSERVATION OVER THE SECTOR. KEEP THE CANAL ON YOUR LEFT GOING OUT. WATCH FOR THE BATTERY PANELS. BE BACK OVER THE LINES BEFORE THE LIGHT GOES.', 'THE MAJOR'], actions: [takeOff] }),
    chart: () => ({ art: I.chartArt(), body: ['OUR SECTOR. THE GERMAN LINE IN RED, OURS IN BLUE. BTY: OUR BATTERY. TGT: TODAY.'], actions: [] }),
    letters: () => ({ art: I.lettersArt(), body: ['YOUR CARD CAME ON TUESDAY. THE APPLE TREE HAS COME OUT ALL AT ONCE. I HAVE PUT A PHOTOGRAPH IN WITH THIS. WRITE WHEN YOU CAN.', 'MOTHER'], actions: [] }),
    photo: () => ({ art: I.photoArt(), body: [], actions: [] }),
    logbook: () => ({ art: I.logbookArt(), body: logLines(), actions: [[flyLabel(), fly]] }),
    clockcode: () => ({ art: I.clockcodeArt(), body: ['TARGET AT THE CENTRE, TWELVE IS NORTH. RINGS Y TO F: 10 TO 500 YARDS. B4: 100 YARDS, A LITTLE SOUTH OF EAST.'], actions: [] }),
    calendar: () => ({ art: I.calendarArt(o.info), body: ['THE CALENDAR ONLY MOVES WHEN YOU FLY.'], actions: [] }),
  };

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
    const scene = barnScene(W, H, o.info, order, clear);
    art.width = W;
    art.height = H;
    art.getContext('2d')!.putImageData(new ImageData(scene.px.data, W, H), 0, 0);
    art.style.width = `${W * g}px`;
    art.style.height = `${H * g}px`;
    spots = scene.spots;
    things.replaceChildren(...spots.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'barn-thing';
      b.setAttribute('aria-label', LABEL[s.id].toLowerCase());
      Object.assign(b.style, { left: `${s.x * g}px`, top: `${s.y * g}px`, width: `${s.w * g}px`, height: `${s.h * g}px` });
      const tag = plaque(LABEL[s.id]);
      tag.className = 'barn-tag';
      tag.setAttribute('aria-hidden', 'true');
      b.append(tag);
      b.addEventListener('click', () => pickUp(s.id, b));
      return b;
    }));
    sizeFaces([things, plates], o.uiPx());
  }
  layout();
  addEventListener('resize', layout);
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
    removeEventListener('resize', layout);
    removeEventListener('keydown', keys, true);
    room.remove();
    if (notify) o.onClose();
  }
  (plates.firstElementChild as HTMLElement | null)?.focus();
  return { isOpen: () => open, close: () => shut(false) };
}
