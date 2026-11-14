import { blend, startLoop } from './core/loop.ts';
import { createAudio } from './audio/audio.ts';
import { progressionFor } from './audio/music.ts';
import { hash } from './core/noise.ts';
import { createProfiler } from './core/profile.ts';
import { createControls } from './input/controls.ts';
import { createCamera, updateCamera } from './render/camera.ts';
import { createDisplay } from './render/display.ts';
import { PROP, propWidth } from './render/plane.ts';
import { createScene, drawScene } from './render/scene.ts';
import { applyAids, createAids } from './sim/aids.ts';
import { advanceClock, createClock, DAYLIGHT, dayOfYear, sunNow, sunsetHour } from './sim/daylight.ts';
import { createPlane, updatePlane } from './sim/flight.ts';
import { createClockFace, drawClock } from './ui/clock.ts';
import { label } from './ui/gauges.ts';
import { createHud, drawHud } from './ui/hud.ts';
import { createToggles, drawButtonPlate, drawToggles, drawVolumePlate, toggleAt } from './ui/toggles.ts';
import { createInstruments, engineWarning, updateInstruments } from './ui/instruments.ts';
import { createSmoke, updateSmoke } from './render/smoke.ts';

export const IS_DEV = import.meta.env.DEV;

/** A number from the URL (`?seed=123`, `?time=19.5`), if it's valid; anything else is ignored. */
function numberFromUrl(name: string, ok: (n: number) => boolean): number | undefined {
  const raw = new URLSearchParams(location.search).get(name);
  const n = raw === null ? NaN : Number(raw);
  return ok(n) ? n : undefined;
}
const SEED = numberFromUrl('seed', (n) => Number.isInteger(n) && n >= 0 && n < 2 ** 31) ?? Math.floor(Math.random() * 2 ** 31); // which world: random each run unless `?seed=` pins it
// Solar time to start at: `?time=19.5`, or a random hour of the 24 (drawn through the seeded hash,
// fed with the session's start time, so each visit differs).
const randomStart = hash(SEED, Math.floor(Date.now() / 1000), 77);
const START_HOUR =
  numberFromUrl('time', (n) => n >= 0 && n < 24) ??
  (IS_DEV ? randomStart * 24 : sunsetHour(DAYLIGHT.startDayOfYear) - (0.25 + randomStart * 0.75)); // production: 15–60 minutes before sunset

// Development aids. Debug toggles (bottom-left, above the gauges): FAST TIME runs the clock 3× (on for now).
// Hold ] to run it 40× faster still (to see sunsets without waiting).
const toggles = createToggles([{ id: 'fastTime', text: 'FAST TIME', on: IS_DEV }]);
const FAST_TIME = 3;
const FAST_FORWARD = 40;
let forward = false;
window.addEventListener('keydown', (e) => e.code === 'BracketRight' && (forward = true));
window.addEventListener('keyup', (e) => e.code === 'BracketRight' && (forward = false));
window.addEventListener('blur', () => (forward = false));
const timeSpeed = () => (IS_DEV ? (forward ? FAST_FORWARD : toggles.items[0].on ? FAST_TIME : 1) : 1);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CAMPAIGN_START = new Date(1915, 4, 10); // 10 May 1915; matches DAYLIGHT.startDayOfYear
function dateText(day: number): string {
  const d = new Date(CAMPAIGN_START.getFullYear(), CAMPAIGN_START.getMonth(), CAMPAIGN_START.getDate() + day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.');

const display = createDisplay(canvas);
const progression = progressionFor(IS_DEV);
const audio = createAudio(undefined, undefined, progression);
const audioControl = document.getElementById('audio-control');
const volumeFace = document.getElementById('engine-volume-label');
const volumeSlider = document.getElementById('engine-volume');
const musicControl = document.getElementById('music-control');
const musicFace = document.getElementById('music-volume-label');
const musicSlider = document.getElementById('music-volume');
const holdFace = document.getElementById('hold-steady-label');
if (volumeSlider instanceof HTMLInputElement) {
  const updateVolume = () => {
    const value = volumeSlider.valueAsNumber / 100;
    audio.setVolume(value);
    const width = toggles.rects[0]?.w;
    if (volumeFace instanceof HTMLCanvasElement && width) drawVolumePlate(volumeFace, width, value, 'ENGINE');
  };
  volumeSlider.addEventListener('input', updateVolume);
  updateVolume();
}
if (musicSlider instanceof HTMLInputElement) {
  const updateVolume = () => {
    const value = musicSlider.valueAsNumber / 100;
    audio.setMusicVolume(value);
    const width = toggles.rects[0]?.w;
    if (musicFace instanceof HTMLCanvasElement && width) drawVolumePlate(musicFace, width, value, 'MUSIC');
  };
  musicSlider.addEventListener('input', updateVolume);
  updateVolume();
}
const placeVolume = (
  control: HTMLElement | null,
  face: HTMLElement | null,
  slider: HTMLElement | null,
  label: string,
  row: number,
  anchor: { x: number; y: number; w: number },
  px: number,
) => {
  if (!control || !(face instanceof HTMLCanvasElement)) return;
  if (face.width !== anchor.w) drawVolumePlate(face, anchor.w, slider instanceof HTMLInputElement ? slider.valueAsNumber / 100 : 0, label);
  control.style.left = `${anchor.x * px}px`;
  control.style.top = `${(anchor.y - row * (face.height + 2)) * px}px`;
  control.style.width = `${anchor.w * px}px`;
  control.style.height = `${face.height * px}px`;
  face.style.width = `${anchor.w * px}px`;
  face.style.height = `${face.height * px}px`;
  control.style.visibility = 'visible';
};
const unlockAudio = () => void audio.unlock().catch((e) => console.warn('Audio could not start.', e));
window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
window.addEventListener('keydown', unlockAudio, { once: true, capture: true });
type GamePhase = 'loading' | 'handoff' | 'playing' | 'paused';
let phase: GamePhase = 'loading';
let hiddenPhase: GamePhase | null = null;
const holdButton = document.getElementById('hands-off');
const setPhase = (next: GamePhase) => {
  if (document.hidden && next !== 'paused') {
    hiddenPhase = next;
    return;
  }
  phase = next;
  audio.setPaused(next === 'paused');
  if (holdButton instanceof HTMLButtonElement) holdButton.disabled = next !== 'playing';
};
setPhase('loading');
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase !== 'paused') hiddenPhase = phase;
    setPhase('paused');
  } else if (hiddenPhase) {
    const next = hiddenPhase;
    hiddenPhase = null;
    setPhase(next);
  }
});
const controls = createControls(canvas, window, () => window.innerWidth, () => phase === 'playing');
// A press that lands on a debug toggle flips it and goes no further (it must not steer the plane).
window.addEventListener(
  'pointerdown',
  (e) => {
    if (!IS_DEV || phase !== 'playing') return;
    const hit = toggleAt(toggles, display.view(), e.clientX, e.clientY);
    if (!hit) return;
    hit.on = !hit.on;
    e.stopPropagation();
    e.preventDefault();
  },
  { capture: true },
);
holdButton?.addEventListener('click', (e) => {
  controls.requestToggleHold();
  if (e.detail > 0) holdButton.blur(); // a mouse/touch click mustn't leave focus here, or Space would toggle it
});
const plane = createPlane();
const cam = createCamera(plane);
const aids = createAids(plane, IS_DEV ? 'hold' : 'off');
// Previous sim tick, for smooth rendering between ticks on high-refresh screens.
const prevPlane = { ...plane };
const prevCam = { ...cam };
const STEP = 1 / 60;
const scene = createScene(SEED);
const loading = document.getElementById('loading');
const loadingPlane = document.getElementById('loading-plane');
const loadingText = document.getElementById('loading-text');
const launchButton = document.getElementById('launch');
const LOADING_MESSAGES = [
  'CLEAR PROP',
  'ALL CLEAR',
  'ENGINE READY',
  'STAND CLEAR',
  'WINGS READY',
  'PATROL READY',
  'INTO THE BLUE',
  'GOOD HUNTING',
  'FLYING WEATHER',
  'UP AND AWAY',
  'HOLD HER STEADY',
  'CLEAR THE FIELD',
  'READY TO FLY',
] as const;
const loadingBody = scene.sprites.frames[Math.floor(scene.sprites.frames.length / 2)];
if (loadingPlane instanceof HTMLCanvasElement) {
  loadingPlane.width = loadingBody.width;
  loadingPlane.height = loadingBody.height;
}
if (loadingText instanceof HTMLCanvasElement) {
  const message = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
  const img = label(message, [0x14, 0x13, 0x0f, 255]);
  loadingText.width = img.width;
  loadingText.height = img.height;
  loadingText.getContext('2d')!.drawImage(img, 0, 0);
}
const sizeLoading = () => {
  const view = display.view();
  const cssPixel = view.scale * (window.innerWidth / view.devW);
  for (const c of [loadingPlane, loadingText]) {
    if (!(c instanceof HTMLCanvasElement)) continue;
    c.style.width = `${c.width * cssPixel}px`;
    c.style.height = `${c.height * cssPixel}px`;
  }
};
sizeLoading();
window.addEventListener('resize', sizeLoading);
const instruments = createInstruments(plane);
const hud = createHud();
const clockFace = createClockFace();
const smoke = createSmoke();
const clock = createClock(START_HOUR);
// Development always shows the full diagnostic panel; `?debug` exposes performance timings in a production build.
const debugPanel = document.getElementById('debug');
const debugSong = `song      ${progression.id}`;
const debugRequested = new URLSearchParams(location.search).has('debug');
const debugDetails = () => {
  const view = display.view();
  const sun = sunNow(clock);
  const heading = ((plane.heading * 180) / Math.PI + 360) % 360;
  return [
    ...(IS_DEV ? [debugSong] : []),
    `seed      ${SEED}`,
    `phase     ${phase}${document.hidden ? ' (hidden)' : ''}`,
    `date      ${dateText(clock.day)}  ${clock.hours.toFixed(2)} h  x${timeSpeed()}`,
    `viewport  ${innerWidth}x${innerHeight} css  ${view.devW}x${view.devH} device  dpr ${devicePixelRatio || 1}`,
    `render    ${view.w.toFixed(0)}x${view.h.toFixed(0)} game px  scale ${view.scale}  ${view.compact ? 'compact' : 'regular'}`,
    `flight    ${plane.speed.toFixed(1)} px/s  hdg ${heading.toFixed(1)}°  bank ${plane.bank.toFixed(2)}`,
    `engine    heat ${(plane.heat * 100).toFixed(0)}%  fuel ${(plane.fuel * 100).toFixed(0)}%  ${plane.overheated ? 'OVERHEATED' : plane.boosting ? 'BOOST' : 'CRUISE'}`,
    `sun       elev ${((sun.elevation * 180) / Math.PI).toFixed(1)}°  light ${(sun.strength * 100).toFixed(0)}%  shadows ${(sun.shadowStrength * 100).toFixed(0)}%`,
  ].join('\n');
};
if (IS_DEV && debugPanel) {
  debugPanel.hidden = false;
  debugPanel.textContent = `${debugDetails()}\ncollecting frame timings…`;
}
const prof = createProfiler(IS_DEV || debugRequested, (text) => {
  if (!debugPanel) return;
  debugPanel.hidden = false;
  debugPanel.textContent = `${debugDetails()}\n${text}`;
});

let t = 0;
let shown = false;
let loadingFrame = 0;
const drawLoading = () => {
  if (!(loadingPlane instanceof HTMLCanvasElement) || !loading?.isConnected) return;
  const ctx = loadingPlane.getContext('2d')!;
  const tick = Math.floor(performance.now() * 0.06);
  const prop = scene.sprites.props[propWidth(hash(SEED, tick, 7), 0)];
  ctx.clearRect(0, 0, loadingPlane.width, loadingPlane.height);
  ctx.drawImage(loadingBody, 0, 0);
  ctx.drawImage(prop, (loadingPlane.width - prop.width) / 2, PROP.row);
  loadingFrame = requestAnimationFrame(drawLoading);
};
drawLoading();
const show = () => {
  shown = true;
  window.removeEventListener('resize', sizeLoading);
  loading?.classList.add('settling');
  const settleMs = 900;
  setTimeout(() => {
    loading?.classList.add('ready-to-launch'); // the whole white screen works as soon as settling ends
    setTimeout(() => {
      if (!loading?.classList.contains('ready-to-launch')) return;
      loading?.classList.add('awaiting-launch');
      launchButton?.focus();
    }, 1000);
  }, settleMs);
};

loading?.addEventListener('click', () => {
  if (!loading?.classList.contains('ready-to-launch')) return;
  loading.classList.remove('ready-to-launch', 'awaiting-launch');
  audio.start();
  unlockAudio();
  setPhase('handoff'); // audio and flight begin together; steering waits for the reveal
  cancelAnimationFrame(loadingFrame);
  loading.classList.add('done');
  loading.setAttribute('aria-hidden', 'true');
  const fadeMs = 900;
  setTimeout(() => {
    loading.remove();
    setPhase('playing');
  }, fadeMs);
});

startLoop(
  (dt) => {
    if (phase === 'loading' || phase === 'paused') {
      controls.read(); // discard anything held before or pressed during an inactive phase
      return;
    }
    Object.assign(prevPlane, plane);
    Object.assign(prevCam, cam);
    t += dt;
    updatePlane(plane, applyAids(aids, plane, controls.read()), dt);
    const holding = String(aids.mode === 'hold');
    if (holdButton && holdButton.getAttribute('aria-pressed') !== holding) holdButton.setAttribute('aria-pressed', holding);
    updateCamera(cam, plane, dt);
    updateInstruments(instruments, plane, dt);
    const warning = engineWarning(plane);
    audio.updateEngine({ rpm: instruments.rpm * 2000, rough: warning / 2, bank: plane.bank, heat: plane.heat, boosting: plane.boosting, overheated: plane.overheated });
    updateSmoke(smoke, plane, warning, dt);
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
    drawToggles(display.ctx, view, toggles, IS_DEV);
    const fastTime = toggles.rects[0];
    if (fastTime) {
      const px = view.scale / (window.devicePixelRatio || 1);
      const firstRow = IS_DEV ? 1 : 0;
      placeVolume(audioControl, volumeFace, volumeSlider, 'ENGINE', firstRow, fastTime, px);
      placeVolume(musicControl, musicFace, musicSlider, 'MUSIC', firstRow + 1, fastTime, px);
      if (holdButton instanceof HTMLButtonElement && holdFace instanceof HTMLCanvasElement) {
        const holding = holdButton.getAttribute('aria-pressed') === 'true';
        if (holdFace.width !== fastTime.w || holdFace.dataset.on !== String(holding)) {
          drawButtonPlate(holdFace, fastTime.w, 'HOLD  T', holding);
          holdFace.dataset.on = String(holding);
        }
        holdButton.style.left = `${fastTime.x * px}px`;
        holdButton.style.top = `${(fastTime.y - (firstRow + 2) * (holdFace.height + 2)) * px}px`;
        holdButton.style.width = `${fastTime.w * px}px`;
        holdButton.style.height = `${holdFace.height * px}px`;
        holdFace.style.width = `${fastTime.w * px}px`;
        holdFace.style.height = `${holdFace.height * px}px`;
        holdButton.style.visibility = 'visible';
      }
    }
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
  60,
  () => phase !== 'paused',
);
