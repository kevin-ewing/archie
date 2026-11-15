// A console API for development and `?debug` builds, so agents (and people) can drive the game and read
// it back as data instead of scraping the overlay or faking key presses: `archie.help()` in the console.
// The full guide to the agent tools (when to use which, recipes, gotchas): docs/AGENT_TOOLS.md.
//
//   archie.state()                 seed, phase, time, plane, sun, features, toggles
//   await archie.stats(1000)       frame timings over the next second: fps, work mean/p95/max, per-stage means, drops
//   archie.time(18.8)              set the solar time (hours)
//   archie.speed(40) / speed(0)    clock speed override (0 freezes time); speed(null) back to the toggles
//   archie.goto(x, y, deg?)        move the plane (and camera) to a world point, optionally a heading in degrees
//   archie.toggle('structures')    flip a debug toggle (or toggle(id, true/false)); ids in state().toggles
//   await archie.ready()           wait until every visible tile has been generated (true), or 10 s pass (false)
//   archie.snapshot()              the frame as a PNG data URL (game + HUD), at device resolution
//
// The same scenarios from the URL (see main.ts): ?seed= ?time= ?x= ?y= ?heading= ?speed= ?off=a,b ?on=a,b

import type { FrameTimes, Profiler } from './core/profile.ts';

export type DevHooks = {
  state: () => Record<string, unknown>;
  setHours: (hours: number) => void;
  pause: () => void;
  resume: () => void;
  session: () => unknown;
  setSpeed: (speed: number | null) => void;
  goto: (x: number, y: number, headingDeg?: number) => void;
  toggles: { id: string; on: boolean }[];
  onToggle?: (id: string, on: boolean) => void;
  /** Whether the last frame had every visible tile. */
  complete: () => boolean;
  canvases: readonly HTMLCanvasElement[];
  prof: Profiler;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Summary of frames: fps, work (the game's own time per frame) and each stage, in ms. Pure. */
export function summarise(frames: readonly FrameTimes[]) {
  const work = frames.map((f) => f.work).sort((a, b) => a - b);
  const gaps = frames.map((f) => f.gap).filter((g) => g > 0 && g < 1000);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const period = sortedGaps[gaps.length >> 1] ?? 1000 / 60;
  const stages: Record<string, number> = {};
  for (const f of frames) for (const [k, v] of f.stages) stages[k] = (stages[k] ?? 0) + v / frames.length;
  for (const k in stages) stages[k] = round(stages[k]);
  return {
    frames: frames.length,
    fps: Math.round(1000 / Math.max(1, mean(gaps))),
    interval: { median: round(period), p95: round(sortedGaps[Math.floor(sortedGaps.length * 0.95)] ?? 0), max: round(sortedGaps.at(-1) ?? 0) },
    work: { mean: round(mean(work)), p95: round(work[Math.floor(work.length * 0.95)] ?? 0), max: round(work[work.length - 1] ?? 0) },
    stages,
    drops: gaps.filter((g) => g > period * 1.5).length,
  };
}

export function installDevApi(h: DevHooks): void {
  const api = {
    help: () => console.log(HELP),
    state: h.state,
    pause: h.pause,
    resume: h.resume,
    session: h.session,
    async stats(ms = 1000) {
      const from = performance.now();
      await sleep(ms);
      return summarise(h.prof.history().filter((f) => f.at >= from));
    },
    time: (hours: number) => h.setHours(((hours % 24) + 24) % 24),
    speed(k: number | null) {
      if (k !== null && (!Number.isFinite(k) || k < 0 || k > 1000)) throw new Error('Clock speed must be null or a number from 0 to 1000.');
      h.setSpeed(k);
    },
    goto: (x: number, y: number, headingDeg?: number) => h.goto(x, y, headingDeg),
    toggle(id: string, on?: boolean) {
      const t = h.toggles.find((g) => g.id === id);
      if (!t) throw new Error(`No toggle '${id}': ${h.toggles.map((g) => g.id).join(', ')}`);
      const next = on ?? !t.on;
      if (typeof next !== 'boolean') throw new Error('Toggle state must be boolean.');
      h.onToggle?.(id, next);
      t.on = next;
      return t.on;
    },
    async ready(timeoutMs = 10000) {
      const until = performance.now() + timeoutMs;
      let run = 0;
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame);
        run = h.complete() ? run + 1 : 0;
        if (run >= 10) return true; // ten whole frames in a row: settled
      }
      return false;
    },
    snapshot() {

      const out = document.createElement('canvas');
      out.width = Math.max(...h.canvases.map((c) => c.width));
      out.height = Math.max(...h.canvases.map((c) => c.height));
      const ctx = out.getContext('2d')!;
      for (const c of h.canvases) ctx.drawImage(c, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  };
  (window as unknown as { archie: typeof api }).archie = api;
  console.info('Dev API: archie.help()');
}

const HELP = `archie: development console API
  archie.state()               seed, phase, time, plane, sun, features, toggles
  await archie.stats(ms)       frame timings over the next ms: fps, work mean/p95/max, per-stage means, drops
  archie.pause() / resume()    pause/resume explicitly (returning to a tab never clears a user pause)
  archie.session()             detached, versioned campaign/session metadata (not a full aircraft/world save)
  archie.time(hours)           set the solar time
  archie.speed(k)              clock speed override (0 freezes time; null = back to the toggles)
  archie.goto(x, y, deg?)      move the plane to a world point (and heading, degrees)
  archie.toggle(id, on?)       flip a debug toggle
  await archie.ready()         wait until every visible tile is generated
  archie.snapshot()            PNG data URL of the frame (game + HUD)
URL: ?seed= ?time= ?x= ?y= ?heading= ?speed= ?off=id,id ?on=id,id ?debug`;
