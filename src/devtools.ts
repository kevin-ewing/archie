// A console API for development and `?debug` builds, so agents (and people) can drive the game and read
// it back as data instead of scraping the overlay or faking key presses: `archie.help()` in the console.
// The full guide to the agent tools (when to use which, recipes, gotchas): docs/AGENT_TOOLS.md.
//
//   archie.state()                 seed, phase, time, plane, sun, features, toggles
//   await archie.stats(1000)       frame timings over the next second: fps, work mean/p95/max, per-stage means, drops
//   archie.time(18.8)              set the solar time (hours)
//   archie.speed(40) / speed(0)    clock speed override (0 freezes time); speed(null) back to the toggles
//   archie.date('1915-12-25')      use that calendar date (null clears every season override); returns the date
//   archie.season('winter')        jump to the middle of a season (winter|spring|summer|autumn; no name = current)
//   archie.seasonParam('snow', .8) force snow|frost|mud|water|ice|foliage|haze (0 to 1; no value = current)
//   archie.goto(x, y, deg?)        move the plane (and camera) to a world point, optionally a heading in degrees
//   archie.toggle('structures')    flip a debug toggle (or toggle(id, true/false)); ids in state().toggles
//   await archie.ready()           wait until every visible tile has been generated (true), or 10 s pass (false)
//   archie.snapshot()              the frame as a PNG data URL (game + HUD), at device resolution
//   archie.photo(path)             save it into the project (dev server only; see vite.config.ts)
//
// The same scenarios from the URL (see main.ts): ?seed= ?time= ?x= ?y= ?heading= ?speed= ?off=a,b ?on=a,b

import type { FrameTimes, Profiler } from './core/profile.ts';
import { parseISO } from './sim/calendar.ts';
import { parseOverrides, SEASON_DATES, type OverrideParam, type Overrides, type SeasonName } from './sim/seasons.ts';

export type DevHooks = {
  state: () => Record<string, unknown>;
  setHours: (hours: number) => void;
  pause: () => void;
  resume: () => void;
  session: () => unknown;
  setSpeed: (speed: number | null) => void;
  goto: (x: number, y: number, headingDeg?: number) => void;
  /** Season overrides in force, replace them (the game recomputes the look), and the current date as ISO. */
  overrides: () => Overrides;
  setOverrides: (o: Overrides) => void;
  date: () => string;
  /** Pop up an offscreen voice's line (game/voices.ts): speaker id, the words, and optionally the scene. */
  say?: (speaker: string, text: string, scene?: 'flight' | 'base') => void;
  toggles: { id: string; on: boolean }[];
  onToggle?: (id: string, on: boolean) => boolean | void;
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
    drops: gaps.filter((g) => g > Math.min(period, 1000 / 60) * 1.5).length,
  };
}

export function installDevApi(h: DevHooks): void {
  const api = {
    help: () => console.log(HELP),
    state() {
      const o = h.overrides();
      return { ...h.state(), date: h.date(), season: o.season ?? null, overridden: !!(o.date || o.season || (o.params && Object.keys(o.params).length)) };
    },
    pause: h.pause,
    resume: h.resume,
    session: h.session,
    frames: (since = -Infinity) => h.prof.history().filter((f) => f.at > since).map((f) => ({ ...f, stages: Object.fromEntries(f.stages) })),
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
    async date(iso?: string | null) {
      if (iso === null) h.setOverrides({});
      else if (iso !== undefined) h.setOverrides({ ...h.overrides(), season: undefined, date: parseISO(iso) });
      else return h.date();
      await api.ready();
      return h.date();
    },
    async season(name?: SeasonName) {
      if (name === undefined) return h.overrides().season ?? null;
      if (!Object.hasOwn(SEASON_DATES, name)) throw new Error(`Season must be one of ${Object.keys(SEASON_DATES).join(', ')}.`);
      h.setOverrides({ ...h.overrides(), date: undefined, season: name });
      await api.ready();
      return name;
    },
    async seasonParam(name: string, value?: number | null) {
      const key = ({ snow: 'snow', frost: 'frost', mud: 'mud', water: 'standingWater', ice: 'ice', foliage: 'foliage', haze: 'haze' } as Record<string, OverrideParam>)[name];
      if (!key) throw new Error('Parameter must be one of snow, frost, mud, water, ice, foliage, haze.');
      const o = h.overrides();
      if (value === undefined) return o.params?.[key] ?? null;
      const params = { ...o.params };
      if (value === null) delete params[key];
      else if (parseOverrides(`${name}=${value}`).problems.length) throw new Error(`${name} must be a number from 0 to 1.`);
      else params[key] = value;
      h.setOverrides({ ...o, params });
      await api.ready();
      return value;
    },
    say: (speaker: string, text: string, scene?: 'flight' | 'base') => h.say?.(speaker, text, scene),
    toggle(id: string, on?: boolean) {
      const t = h.toggles.find((g) => g.id === id);
      if (!t) throw new Error(`No toggle '${id}': ${h.toggles.map((g) => g.id).join(', ')}`);
      const next = on ?? !t.on;
      if (typeof next !== 'boolean') throw new Error('Toggle state must be boolean.');
      if (h.onToggle?.(id, next) === false) return t.on;
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
    /** Development server only: save the frame (or `canvas`) as a PNG at `path`, inside the project. */
    async photo(path = 'debug/photo.png', canvas?: HTMLCanvasElement) {
      const blob = await (await fetch(canvas ? canvas.toDataURL('image/png') : api.snapshot())).blob();
      const r = await fetch(`/__archie/photo?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob });
      if (!r.ok) throw new Error(await r.text());
      return r.text();
    },
  };
  (window as unknown as { archie: typeof api }).archie = api;
  console.info('Dev API: archie.help()');
}

const HELP = `archie: development console API
  archie.state()               seed, phase, time, plane, sun, features, toggles
  archie.frames()             recent raw frame timings and stage costs
  await archie.stats(ms)       frame timings over the next ms: fps, work mean/p95/max, per-stage means, drops
  archie.pause() / resume()    pause/resume explicitly (returning to a tab never clears a user pause)
  archie.session()             detached, versioned campaign/session metadata (not a full aircraft/world save)
  archie.time(hours)           set the solar time
  archie.speed(k)              clock speed override (0 freezes time; null = back to the toggles)
  archie.date(iso?)            use a calendar date, e.g. '1915-12-25' (null clears all season overrides)
  archie.season(name?)         winter | spring | summer | autumn: that season's middle date
  archie.seasonParam(n, v?)    force snow|frost|mud|water|ice|foliage|haze, 0 to 1 (null clears it)
  archie.goto(x, y, deg?)      move the plane to a world point (and heading, degrees)
  archie.say(who, text, scene?) pop up a voice: observer, major, recording, rigger, mechanic, pilot
  archie.toggle(id, on?)       flip a debug toggle
  await archie.ready()         wait until every visible tile is generated
  archie.snapshot()            PNG data URL of the frame (game + HUD)
  await archie.photo(path)     save the frame as a PNG at path, in the project (dev server only)
URL: ?seed= ?time= ?x= ?y= ?heading= ?speed= ?off=id,id ?on=id,id ?debug ?date= ?season= ?snow= ?frost= ?mud= ?water= ?ice= ?foliage= ?haze=`;
