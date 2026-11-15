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
import { createPlane, FLIGHT, updatePlane } from './sim/flight.ts';
import { createClockFace, drawClock } from './ui/clock.ts';
import { label } from './ui/gauges.ts';
import { createHud, drawHud } from './ui/hud.ts';
import { CONTROL_W, controlsAnchor, createToggles, drawButtonPlate, drawToggles, drawVolumePlate, toggleAt } from './ui/toggles.ts';
import { createInstruments, engineWarning, updateInstruments } from './ui/instruments.ts';
import { createSmoke, updateSmoke } from './render/smoke.ts';
import { trenchBearing } from './world/military.ts';
import { DEV, TRENCH_STYLES, type TrenchStyle } from './world/settings.ts';
import { installDevApi } from './devtools.ts';

export const IS_DEV = import.meta.env.DEV;

/** A number from the URL (`?seed=123`, `?time=19.5`), if it's valid; anything else is ignored. */
function numberFromUrl(name: string, ok: (n: number) => boolean): number | undefined {
  const raw = new URLSearchParams(location.search).get(name);
  const n = raw === null ? NaN : Number(raw);
  return ok(n) ? n : undefined;
}
const SEED = numberFromUrl('seed', (n) => Number.isInteger(n) && n >= 0 && n < 2 ** 31) ?? Math.floor(Math.random() * 2 ** 31); // which world: random each run unless `?seed=` pins it
// Solar time to start at: `?time=19.5`, else 7:00 in development (for now) or, in production, a random
// time before sunset (drawn through the seeded hash, fed with the session's start time, so each visit differs).
const randomStart = hash(SEED, Math.floor(Date.now() / 1000), 77);
const START_HOUR =
  numberFromUrl('time', (n) => n >= 0 && n < 24) ??
  (IS_DEV ? 7 : sunsetHour(DAYLIGHT.startDayOfYear) - (1.75 + randomStart * 0.5)); // development (for now): always 7:00 am; production: 1h45–2h15 before sunset (sun ~15–20° up), just before the golden light builds

// Development aids. Debug toggles (bottom-right corner, stacked upward, right-aligned): FAST TIME runs the clock 3× (on for now);
// BUILDINGS and FRONT switch the farms / the military works on and off (the visible ground tiles regenerate
// over a second or so; flying costs nothing either way). Hold ] to run the clock 40× faster still.
const toggles = createToggles([
  { id: 'fastPlane', text: 'FAST PLANE', on: IS_DEV }, // twice the speed, to cover ground faster (bottom of the stack: under FAST TIME)
  { id: 'fastTime', text: 'FAST TIME', on: IS_DEV },
  { id: 'structures', text: 'BUILDINGS', on: true },
  { id: 'military', text: 'FRONT', on: true },
  { id: 'frontLines', text: 'FRONT LINES', on: true }, // the front's own line (red) and each side's (blue British, yellow German)
]);
// Scenario from the URL (development and tools): `?off=structures,frontLines` / `?on=…` set toggles.
for (const [param, on] of [['off', false], ['on', true]] as const) {
  for (const id of new URLSearchParams(location.search).get(param)?.split(',') ?? []) {
    const t = toggles.items.find((g) => g.id === id);
    if (t) t.on = on;
  }
}
const toggleOn = (id: string) => toggles.items.find((t) => t.id === id)?.on ?? true;
const FAST_TIME = 3;
const FAST_FORWARD = 40;
let forward = false;
window.addEventListener('keydown', (e) => e.code === 'BracketRight' && (forward = true));
window.addEventListener('keyup', (e) => e.code === 'BracketRight' && (forward = false));
window.addEventListener('blur', () => (forward = false));
// `?speed=` or archie.speed() override the clock speed (0 freezes time), for looking at one moment.
let speedOverride: number | null = numberFromUrl('speed', (n) => n >= 0 && n <= 1000) ?? null;
const timeSpeed = () => speedOverride ?? (IS_DEV ? (forward ? FAST_FORWARD : toggleOn('fastTime') ? FAST_TIME : 1) : 1);

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
    const width = CONTROL_W;
    if (volumeFace instanceof HTMLCanvasElement && width) drawVolumePlate(volumeFace, width, value, 'ENGINE');
  };
  volumeSlider.addEventListener('input', updateVolume);
  updateVolume();
}
if (musicSlider instanceof HTMLInputElement) {
  const updateVolume = () => {
    const value = musicSlider.valueAsNumber / 100;
    audio.setMusicVolume(value);
    const width = CONTROL_W;
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
  const mapButton = document.getElementById('map-bearing');
  if (mapButton instanceof HTMLButtonElement) mapButton.disabled = next !== 'playing';
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
// FAST PLANE (development only): twice the cruise and full-power speeds while it's on.
const BASE_SPEED = { cruise: FLIGHT.cruise, full: FLIGHT.full };
const applyFastPlane = () => {
  const k = IS_DEV && toggleOn('fastPlane') ? 2 : 1;
  FLIGHT.cruise = BASE_SPEED.cruise * k;
  FLIGHT.full = BASE_SPEED.full * k;
};
applyFastPlane();
// Start on a random heading (from the seed, so `?seed=` repeats it), not lined up with the world's pixels.
// `?x= &y= &heading=` (degrees) start the plane somewhere else, for revisiting a spot.
const startHeading = numberFromUrl('heading', Number.isFinite);
const plane = createPlane(numberFromUrl('x', Number.isFinite) ?? 0, numberFromUrl('y', Number.isFinite) ?? 0, startHeading !== undefined ? (startHeading * Math.PI) / 180 : hash(SEED, 41, 7) * 2 * Math.PI);
const cam = createCamera(plane);
const aids = createAids(plane, IS_DEV ? 'hold' : 'off');
// Previous sim tick, for smooth rendering between ticks on high-refresh screens.
const prevPlane = { ...plane };
const prevCam = { ...cam };
const STEP = 1 / 60;
const scene = createScene(SEED, IS_DEV ? 10 : 2.5); // farms 2.5× the base rate in play; development packs them 4× closer still
// Development only: a front always runs through the plane's start. In production fronts fall where they fall.
// (Set here for the main thread, which places lamps from the farms, and in every tile request for the workers.)
DEV.atStart = IS_DEV;
scene.features.atStart = IS_DEV;
// The front is being built one part at a time: for now only its trench lines, in one style (being
// worked on: hasty; `?trench=traversed` shows the original).
const trenchParam = new URLSearchParams(location.search).get('trench');
const TRENCH_STYLE: TrenchStyle = (TRENCH_STYLES as readonly string[]).includes(trenchParam ?? '') ? (trenchParam as TrenchStyle) : 'hasty';
scene.features.onlyTrenches = true;
scene.features.frontLine = false; // development only, with the FRONT LINES toggle (set each frame below); never in production
scene.features.trenchStyle = TRENCH_STYLE;
console.log(`Trench style: ${TRENCH_STYLE} (pin one with ?trench=${TRENCH_STYLES.join('|')})`);
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
let mapBearing: number | null = null;
const hud = createHud(() => mapBearing);
const mapButton = document.getElementById('map-bearing');
const refreshMapBearing = () => {
  DEV.density = scene.features.density ?? 1;
  DEV.fronts = scene.features.military;
  DEV.onlyTrenches = scene.features.onlyTrenches ?? false;
  DEV.trenchStyle = TRENCH_STYLE;
  mapBearing = trenchBearing(SEED, plane.x, plane.y);
  if (!mapButton) return;
  const fix = mapBearing === null ? 'No trench found on this map' : `Trench bearing ${String(Math.round((mapBearing * 180 / Math.PI + 360) % 360) % 360).padStart(3, '0')} degrees saved`;
  mapButton.title = `${fix}. Tap compass to consult map again.`;
  mapButton.setAttribute('aria-label', mapButton.title);
};
refreshMapBearing();
mapButton?.addEventListener('click', () => {
  if (phase === 'playing') refreshMapBearing();
});
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
    `render    ${view.w.toFixed(0)}x${view.h.toFixed(0)} game px  scale ${view.scale}  ui ${view.uiScale}  ${view.mobile ?? (view.compact ? 'compact' : 'desktop')}`,
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

let lastComplete = false; // every visible tile ready in the last frame (for archie.ready())
if (IS_DEV || debugRequested) {
  installDevApi({
    state: () => ({
      seed: SEED,
      phase,
      day: clock.day,
      hours: +clock.hours.toFixed(3),
      speed: timeSpeed(),
      plane: { x: +plane.x.toFixed(1), y: +plane.y.toFixed(1), headingDeg: +(((plane.heading * 180) / Math.PI + 360) % 360).toFixed(1), speed: +plane.speed.toFixed(1), bank: +plane.bank.toFixed(2) },
      sun: (({ elevation, azimuth, strength }) => ({ elevationDeg: +((elevation * 180) / Math.PI).toFixed(2), azimuthDeg: +((azimuth * 180) / Math.PI).toFixed(2), strength: +strength.toFixed(2) }))(sunNow(clock)),
      features: { ...scene.features },
      toggles: Object.fromEntries(toggles.items.map((g) => [g.id, g.on])),
      view: (({ w, h, scale, devW, devH }) => ({ w, h, scale, devW, devH }))(display.view()),
    }),
    setHours: (hours) => (clock.hours = hours),
    setSpeed: (k) => (speedOverride = k),
    goto: (x, y, headingDeg) => {
      plane.x = x;
      plane.y = y;
      if (headingDeg !== undefined) plane.heading = (headingDeg * Math.PI) / 180;
      Object.assign(cam, createCamera(plane));
      Object.assign(prevPlane, plane);
      Object.assign(prevCam, cam);
    },
    toggles: toggles.items,
    complete: () => lastComplete,
    canvases: [canvas, display.hud.canvas],
    prof,
  });
}

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
// "Game mode": fullscreen, the screen kept awake, Esc and friends captured, landscape on phones. Browsers
// can't ask the OS for its own game mode; these are the closest things a page can do. All need a user
// gesture (the launch click) and every one is optional, so failures are ignored.
let wakeLock: WakeLockSentinel | undefined;
const keepAwake = () => void navigator.wakeLock?.request('screen').then((l) => (wakeLock = l), () => {});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wakeLock?.released) keepAwake(); // the browser drops the lock whenever the tab is hidden
});
const enterGameMode = () => {
  keepAwake();
  // Fullscreen disabled for now (and with it the Esc and landscape locks, which only work in fullscreen).
  // document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(
  //   () => {
  //     void (navigator as any).keyboard?.lock?.(['Escape']).catch(() => {}); // Chromium: hold Esc to leave fullscreen
  //     void (screen.orientation as any)?.lock?.('landscape').catch(() => {}); // Android
  //   },
  //   () => {},
  // );
};
/** Take off: the loading screen fades, audio starts, steering unlocks once it has cleared. */
const launch = () => {
  if (!loading?.isConnected) return;
  if (navigator.userActivation?.isActive) enterGameMode(); // not in dev's automatic launch: there's no click to allow it
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
};
const show = () => {
  shown = true;
  window.removeEventListener('resize', sizeLoading);
  if (IS_DEV) return launch(); // development goes straight in once everything has loaded
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
  if (loading.classList.contains('ready-to-launch')) launch();
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
    applyFastPlane();
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
    scene.features.structures = !IS_DEV || toggleOn('structures'); // (production: always both)
    scene.features.military = !IS_DEV || toggleOn('military');
    scene.features.frontLine = IS_DEV && toggleOn('frontLines');
    const complete = drawScene(display.ctx, view, scene, p, c, { t: t - STEP * (1 - alpha), smoke, warning, sun, day: clock.day, prof });
    lastComplete = complete;
    // The HUD has its own canvas, stacked over the game's, so the world canvas ends on the light of the hour
    // (drawing anything on it after the grade forces the browser to render the frame early: ~0.5 ms at dusk).
    const hudCtx = display.hud;
    hudCtx.setTransform(1, 0, 0, 1, 0, 0);
    hudCtx.clearRect(0, 0, view.devW, view.devH);
    drawHud(hudCtx, view, hud, instruments, warning, t);
    if (mapButton instanceof HTMLButtonElement) {
      const px = view.uiScale / (window.devicePixelRatio || 1);
      const size = hud.slots[0].inst.size;
      mapButton.style.left = `${(view.compact ? 14 : 10) * px}px`;
      mapButton.style.top = `${(Math.floor(view.uiH) - (view.compact ? 40 : 12) - size) * px}px`;
      mapButton.style.width = mapButton.style.height = `${size * px}px`;
      mapButton.style.visibility = 'visible';
    }
    drawToggles(hudCtx, view, toggles, IS_DEV);
    const fastTime = controlsAnchor(view); // the player's own controls stack up on the left, just above the gauges
    if (fastTime) {
      const px = view.uiScale / (window.devicePixelRatio || 1);
      const firstRow = 0;
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
    drawClock(hudCtx, view, clockFace, {
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
