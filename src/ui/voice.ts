// What an offscreen voice says, popped up as text (game/voices.ts decides who and when): a riveted name plate
// for who's speaking over a slip with the words typed out at speaking pace, in the game's lettering, sized
// in whole UI pixels. In flight it's the observer, shouting over the engine: a dark slip above the
// instruments. At base it's the squadron: a paper slip at the foot of the screen. Text only, for now.

import { createPx, plot, text, textWidth, type RGBA } from '../core/pixels.ts';
import { C, plaque } from './gauges.ts';
import type { Scene, Showing, Voices } from '../game/voices.ts';

const STYLE: Record<Scene, { face: RGBA; edge: RGBA; ink: RGBA }> = {
  flight: { face: [20, 19, 15, 230], edge: C.metal, ink: C.ink }, // dark, like the instrument faces
  base: { face: [236, 224, 186, 255], edge: [188, 170, 126, 255], ink: [40, 34, 30, 255] }, // a slip of paper
};

/** `s` wrapped to `w` px in the game's lettering. */
export function wrapWords(s: string, w: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of s.split(' ').filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && textWidth(next) > w) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The pop-up: runs its own frame loop while anything is said or waiting (so it works over the flight and over
 * the barn alike), and pauses with `paused()`. `place(scene)` says where its bottom edge sits, in CSS px from
 * the bottom of the window (above the instruments in flight, say).
 */
export function createVoiceBox(voices: Voices, opts: { uiPx: () => number; paused?: () => boolean; place?: (scene: Scene) => number }) {
  const el = document.createElement('div');
  el.className = 'voice';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  const tag = document.createElement('div');
  tag.className = 'voice-tag';
  const slip = document.createElement('canvas');
  slip.className = 'voice-slip';
  el.append(tag, slip);
  document.body.append(el);

  let key = '';
  function draw(s: Showing, scene: Scene) {
    const u = opts.uiPx();
    const k = `${s.speaker.name}|${s.line.text}|${s.shown}|${scene}|${u}`;
    if (k === key) return;
    key = k;
    const st = STYLE[scene];
    const width = Math.min(200, Math.floor(innerWidth / u) - 16);
    const lines = wrapWords(s.line.text, width - 12);
    const w = Math.max(...lines.map(textWidth), 40) + 12;
    const h = lines.length * 7 + 9;
    const px = createPx(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(px, x, y, x === 0 || y === 0 || x === w - 1 || y === h - 1 ? st.edge : st.face);
    // Typed out as it's said: whole lines laid out first, so words don't jump about as they arrive.
    let left = s.shown;
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      if (part) text(px, 6, 5 + i * 7, part, st.ink);
    });
    slip.width = w;
    slip.height = h;
    slip.getContext('2d')!.putImageData(new ImageData(px.data, w, h), 0, 0);
    slip.style.width = `${w * u}px`;
    slip.style.height = `${h * u}px`;
    if (tag.dataset.name !== s.speaker.name || tag.dataset.u !== String(u)) {
      const plate = plaque(s.speaker.name);
      plate.style.width = `${plate.width * u}px`;
      plate.style.height = `${plate.height * u}px`;
      tag.replaceChildren(plate);
      tag.dataset.name = s.speaker.name;
      tag.dataset.u = String(u);
    }
    el.dataset.scene = scene;
    el.style.bottom = `${opts.place?.(scene) ?? 16}px`;
    el.setAttribute('aria-label', `${s.speaker.name.toLowerCase()}: ${s.line.text.toLowerCase()}`);
  }

  let frame = 0, last = 0;
  const loop = (t: number) => {
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    if (!opts.paused?.()) voices.tick(dt);
    const s = voices.showing();
    if (s) draw(s, voices.scene());
    el.hidden = !s;
    if (!s) key = '';
    frame = voices.busy() ? requestAnimationFrame(loop) : 0;
    if (!frame) last = 0;
  };
  const wake = () => { if (!frame) frame = requestAnimationFrame(loop); };
  return {
    el,
    /** Say something (see game/voices.ts Line). */
    say(...args: Parameters<Voices['say']>) { voices.say(...args); wake(); },
    /** Where you are now: flight or base. */
    setScene(scene: Scene) { voices.setScene(scene); wake(); },
    wake,
  };
}
