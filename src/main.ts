import { blend, startLoop } from './core/loop.ts';
import { hash } from './core/noise.ts';
import { createProfiler } from './core/profile.ts';
import { createControls } from './input/controls.ts';
import { createCamera, updateCamera } from './render/camera.ts';
import { createDisplay } from './render/display.ts';
import { createScene, drawScene } from './render/scene.ts';
import { applyAids, createAids } from './sim/aids.ts';
import { advanceClock, createClock, dayOfYear, sunNow, sunsetHour } from './sim/daylight.ts';
import { createPlane, updatePlane } from './sim/flight.ts';
import { createClockFace, drawClock } from './ui/clock.ts';
import { createHud, drawHud } from './ui/hud.ts';
import { createToggles, drawToggles, toggleAt } from './ui/toggles.ts';
import { createInstruments, engineWarning, updateInstruments } from './ui/instruments.ts';
import { createSmoke, updateSmoke } from './render/smoke.ts';

/** A number from the URL (`?seed=123`, `?time=19.5`), if it's valid; anything else is ignored. */
function numberFromUrl(name: string, ok: (n: number) => boolean): number | undefined {
  const raw = new URLSearchParams(location.search).get(name);
  const n = raw === null ? NaN : Number(raw);
  return ok(n) ? n : undefined;
}
const SEED = numberFromUrl('seed', (n) => Number.isInteger(n) && n >= 0 && n < 2 ** 31) ?? Math.floor(Math.random() * 2 ** 31); // which world: random each run unless `?seed=` pins it
// Solar time to start at: `?time=19.5`, or a random hour of the 24 (drawn through the seeded hash,
// fed with the session's start time, so each visit differs).
const START_HOUR = numberFromUrl('time', (n) => n >= 0 && n < 24) ?? hash(SEED, Math.floor(Date.now() / 1000), 77) * 24;

// Development aids. Debug toggles (bottom-left, above the gauges): FAST TIME runs the clock 3× (on for now).
// Hold ] to run it 40× faster still (to see sunsets without waiting).
const toggles = createToggles([{ id: 'fastTime', text: 'FAST TIME', on: true }]);
const FAST_TIME = 3;
const FAST_FORWARD = 40;
let forward = false;
window.addEventListener('keydown', (e) => e.code === 'BracketRight' && (forward = true));
window.addEventListener('keyup', (e) => e.code === 'BracketRight' && (forward = false));
window.addEventListener('blur', () => (forward = false));
const timeSpeed = () => (forward ? FAST_FORWARD : toggles.items[0].on ? FAST_TIME : 1);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CAMPAIGN_START = new Date(1915, 4, 10); // 10 May 1915; matches DAYLIGHT.startDayOfYear
function dateText(day: number): string {
  const d = new Date(CAMPAIGN_START.getFullYear(), CAMPAIGN_START.getMonth(), CAMPAIGN_START.getDate() + day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.');

const display = createDisplay(canvas);
const controls = createControls(canvas, window, () => window.innerWidth);
// A press that lands on a debug toggle flips it and goes no further (it must not steer the plane).
window.addEventListener(
  'pointerdown',
  (e) => {
    const hit = toggleAt(toggles, display.view(), e.clientX, e.clientY);
    if (!hit) return;
    hit.on = !hit.on;
    e.stopPropagation();
    e.preventDefault();
  },
  { capture: true },
);
const holdButton = document.getElementById('hands-off');
holdButton?.addEventListener('click', (e) => {
  controls.requestToggleHold();
  if (e.detail > 0) holdButton.blur(); // a mouse/touch click mustn't leave focus here, or Space would toggle it
});
const plane = createPlane();
const cam = createCamera(plane);
const aids = createAids(plane); // starts in Hold
// Previous sim tick, for smooth rendering between ticks on high-refresh screens.
const prevPlane = { ...plane };
const prevCam = { ...cam };
const STEP = 1 / 60;
const scene = createScene(SEED);
const instruments = createInstruments(plane);
const hud = createHud();
const clockFace = createClockFace();
const smoke = createSmoke();
const clock = createClock(START_HOUR);
// `?debug`: fps and per-stage frame times, top-right.
const debugPanel = document.getElementById('debug');
const prof = createProfiler(new URLSearchParams(location.search).has('debug'), (text) => {
  if (!debugPanel) return;
  debugPanel.hidden = false;
  debugPanel.textContent = text;
});

let t = 0;
let shown = false;
const show = () => {
  shown = true;
  canvas.classList.add('ready'); // fade in once the first view is fully generated
};
setTimeout(show, 3000); // …or after a moment regardless, so a slow device never sits on a blank screen

startLoop(
  (dt) => {
    Object.assign(prevPlane, plane);
    Object.assign(prevCam, cam);
    t += dt;
    updatePlane(plane, applyAids(aids, plane, controls.read()), dt);
    const holding = String(aids.mode === 'hold');
    if (holdButton && holdButton.getAttribute('aria-pressed') !== holding) holdButton.setAttribute('aria-pressed', holding);
    updateCamera(cam, plane, dt);
    updateInstruments(instruments, plane, dt);
    updateSmoke(smoke, plane, engineWarning(plane), dt);
    advanceClock(clock, dt, timeSpeed());
  },
  (alpha) => {
    // Tiles are generated in Web Workers and appear when ready (see render/tilegen.ts).
    prof.start();
    const p = blend(prevPlane, plane, alpha, ['heading']);
    const c = blend(prevCam, cam, alpha, ['angle']);
    const view = display.view();
    const warning = engineWarning(plane);
    const sun = sunNow(clock);
    const complete = drawScene(display.ctx, view, scene, p, c, { t: t - STEP * (1 - alpha), smoke, warning, sun, day: clock.day, prof });
    drawHud(display.ctx, view, hud, instruments, warning, t);
    drawToggles(display.ctx, view, toggles);
    drawClock(display.ctx, view, clockFace, {
      hours: clock.hours,
      day: clock.day,
      sunset: sunsetHour(dayOfYear(clock)),
      dateText: dateText(clock.day),
    });
    prof.mark('hud');
    prof.end();
    if (complete && !shown) show();
  },
);
