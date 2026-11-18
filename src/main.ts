import { blend, startLoop, type RenderTiming } from './core/loop.ts';
import { createAudio } from './audio/audio.ts';
import { progressionFor } from './audio/music.ts';
import { hash } from './core/noise.ts';
import { createProfiler } from './core/profile.ts';
import { createControls } from './input/controls.ts';
import { createCamera, updateCamera } from './render/camera.ts';
import { createDisplay } from './render/display.ts';
import { PROP, propWidth } from './render/plane.ts';
import { createScene, drawScene, drawTerrain } from './render/scene.ts';
import { applyAids, createAids } from './sim/aids.ts';
import { dateOf, dayNumber, fromDayNumber, formatISO, REFERENCE, setCampaignStart, type CalDate } from './sim/calendar.ts';
import { sunNow, sunsetHour } from './sim/daylight.ts';
import { legalHours, sunDay } from './sim/sun.ts';
import { applyOverrides, parseOverrides, seasonAt, seasonKey, SEASON_DATES, type Overrides } from './sim/seasons.ts';
import { createPlane, FLIGHT, updatePlane } from './sim/flight.ts';
import { createClockFace, drawClock } from './ui/clock.ts';
import { label } from './ui/gauges.ts';
import { createHud, drawHud, gradeMatrix, radiumGlow } from './ui/hud.ts';
import { controlsAnchor, createToggles, drawToggles, drawTumbler, toggleAt } from './ui/toggles.ts';
import { createInstruments, engineWarning, updateInstruments } from './ui/instruments.ts';
import { createSmoke, updateSmoke } from './render/smoke.ts';
import { trenchBearing } from './world/military.ts';
import { DEV, TRENCH_STYLES, type TrenchStyle } from './world/settings.ts';
import { installDevApi } from './devtools.ts';
import { createPauseUi, createSettings, drawVolumePlate, GAME_URL, MENU_W } from './ui/pause.ts';
import { wireLanding } from './ui/landing.ts';
import { openBarn, prepareBarn } from './story/barn.ts';
import { createVoices } from './game/voices.ts';
import { createVoiceBox } from './ui/voice.ts';
import { createTooltips, type Tip } from './ui/tooltip.ts';
import type { BarnInfo } from './story/barn-art.ts';
import { LOGBOOK_START } from './story/desk-items.ts';
import { createSave } from './game/save.ts';
import { hudLight } from './ui/light.ts';
import { campaignDate, createGame, worldFeatures } from './game/state.ts';

export const IS_DEV = import.meta.env.DEV;

/** A number from the URL (`?seed=123`, `?time=19.5`), if it's valid; anything else is ignored. */
function numberFromUrl(name: string, ok: (n: number) => boolean): number | undefined {
  const raw = new URLSearchParams(location.search).get(name);
  const n = raw === null ? NaN : Number(raw);
  return ok(n) ? n : undefined;
}
// The player's save (settings, story progress): kept in their browser, but never in development or with
// `?debug`, where every visit starts fresh (see game/save.ts).
const save = createSave(!import.meta.env.DEV && !new URLSearchParams(location.search).has('debug'));
// Season overrides (`?date= ?season= ?snow= ...`): development and `?debug` only, never saved. `?date=` is the
// date at which clock.day is 0; archie.date() later makes the current day that date.
let overrides: Overrides = {};
if (IS_DEV || new URLSearchParams(location.search).has('debug')) {
  const parsed = parseOverrides(location.search);
  for (const p of parsed.problems) console.warn(`Season override ignored: ${p}`);
  overrides = parsed.overrides;
}
const overrideDate = (o: Overrides): CalDate | undefined => o.date ?? (o.season ? SEASON_DATES[o.season] : undefined);
const startFor = (o: Overrides, atDay: number): CalDate => {
  const d = overrideDate(o);
  return d ? fromDayNumber(dayNumber(d) - atDay) : REFERENCE;
};
setCampaignStart(startFor(overrides, 0));
const SEED = numberFromUrl('seed', (n) => Number.isInteger(n) && n >= 0 && n < 2 ** 31) ?? save.data.story?.seed ?? Math.floor(Math.random() * 2 ** 31); // which world: `?seed=`, else the story's world (so its tiles load behind the landing page), else random
// Solar time to start at: `?time=19.5`; else a random time before sunset (drawn through the seeded hash, fed
// with the session's start time, so each visit differs).
const randomStart = hash(SEED, Math.floor(Date.now() / 1000), 77);
const TIME_PARAM = numberFromUrl('time', (n) => n >= 0 && n < 24);
const RANDOM_HOUR = sunsetHour(sunDay(dateOf(0))) - (1.75 + randomStart * 0.5); // 1h45–2h15 before sunset (sun ~15–20° up), just before the golden light builds
const START_HOUR = TIME_PARAM ?? RANDOM_HOUR;

const trenchParam = new URLSearchParams(location.search).get('trench');
const TRENCH_STYLE: TrenchStyle = (TRENCH_STYLES as readonly string[]).includes(trenchParam ?? '') ? (trenchParam as TrenchStyle) : 'hasty';

// Development aids. Debug toggles (bottom-right corner, stacked upward, right-aligned): FAST TIME runs the clock 3× (on for now);
// BUILDINGS and FRONT switch the farms / the military works on and off (the visible ground tiles regenerate
// over a second or so; flying costs nothing either way). Hold ] to run the clock 40× faster still.
const toggles = createToggles([
  { id: 'fastPlane', text: 'FAST PLANE', on: IS_DEV }, // twice the speed, to cover ground faster (bottom of the stack: under FAST TIME)
  { id: 'fastTime', text: 'FAST TIME', on: IS_DEV },
  { id: 'structures', text: 'BUILDINGS', on: true },
  { id: 'military', text: 'FRONT', on: true },
  { id: 'frontLines', text: 'FRONT LINES', on: IS_DEV }, // the front's own line (red) and each side's (blue British, yellow German)
]);
// Scenario from the URL (development and tools): `?off=structures,frontLines` / `?on=…` set toggles.
for (const [param, on] of [['off', false], ['on', true]] as const) {
  for (const id of new URLSearchParams(location.search).get(param)?.split(',') ?? []) {
    const t = toggles.items.find((g) => g.id === id);
    if (t) t.on = on;
  }
}
const toggleOn = (id: string) => toggles.items.find((t) => t.id === id)?.on ?? true;
const game = createGame({ mode: 'free-play', seed: SEED, startHour: START_HOUR, world: {
  farms: toggleOn('structures'), fronts: toggleOn('military'), frontLines: toggleOn('frontLines'),
  frontAtStart: IS_DEV, density: IS_DEV ? 10 : 2.5, onlyTrenches: true, trenchStyle: TRENCH_STYLE,
} });
const state = game.state;
const worldToggleKeys = { structures: 'farms', military: 'fronts', frontLines: 'frontLines' } as const;
const worldToggles = toggles.items.filter((t) => t.id in worldToggleKeys);
const onToggle = (id: string, on: boolean) => {
  const key = worldToggleKeys[id as keyof typeof worldToggleKeys];
  if (key) game.setWorldFeatures({ [key]: on });
};
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
function dateText(day: number): string {
  const [year, month, date] = campaignDate(day).split('-').map(Number);
  return `${date} ${MONTHS[month - 1]} ${year}`;
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
    const width = MENU_W; // the volume plates live in the pause menu
    if (volumeFace instanceof HTMLCanvasElement && width) drawVolumePlate(volumeFace, width, value, 'ENGINE');
  };
  volumeSlider.valueAsNumber = Math.round(save.data.settings.engine * 100);
  volumeSlider.addEventListener('input', () => {
    updateVolume();
    save.settings({ engine: volumeSlider.valueAsNumber / 100 });
  });
  updateVolume();
}
if (musicSlider instanceof HTMLInputElement) {
  const updateVolume = () => {
    const value = musicSlider.valueAsNumber / 100;
    audio.setMusicVolume(value);
    const width = MENU_W; // the volume plates live in the pause menu
    if (musicFace instanceof HTMLCanvasElement && width) drawVolumePlate(musicFace, width, value, 'MUSIC');
  };
  musicSlider.valueAsNumber = Math.round(save.data.settings.music * 100);
  musicSlider.addEventListener('input', () => {
    updateVolume();
    save.settings({ music: musicSlider.valueAsNumber / 100 });
  });
  updateVolume();
}
const unlockAudio = () => void audio.unlock().catch((e) => console.warn('Audio could not start.', e));
window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
window.addEventListener('keydown', unlockAudio, { once: true, capture: true });
const controls = createControls(canvas, window, () => window.innerWidth, () => state.phase === 'playing');
const holdButton = document.getElementById('hands-off');
// Session transitions own state; this adapter applies their effects to browser/audio/UI systems.
const syncSession = () => {
  audio.setPaused(state.phase === 'paused' || state.phase === 'debrief');
  if (state.phase !== 'playing') controls.read(); // discard held inputs even when the paused loop isn't ticking
  for (const button of [holdButton, document.getElementById('map-bearing')]) {
    if (button instanceof HTMLButtonElement) button.disabled = state.phase !== 'playing';
  }
};
const setPhase = (next: 'handoff' | 'playing') => {
  game.transition(next);
  syncSession();
};
if (document.hidden) game.pause('visibility');
syncSession();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause('visibility');
  else game.resume('visibility');
  syncSession();
});
// Settings (volumes, full screen, controls): one panel, opened from the landing page and the pause menu.
const settings = createSettings([audioControl, musicControl]);
// The pause button (top-right) and menu, P to open; photo mode inside it (src/ui/pause.ts).
const pauseUi = createPauseUi({
  // Back to the landing page (it shows at once).
  mainMenu: () => {
    logStoryFlight();
    leaving = true;
    const url = new URL(location.href);
    url.searchParams.delete('play');
    location.replace(url);
  },
  canPause: () => state.phase === 'playing' || state.phase === 'paused',
  onPause: () => {
    game.pause('user');
    syncSession();
  },
  onResume: () => {
    game.resume('user');
    syncSession();
  },
  settings,
  hideForPhoto: () => [voices.el, display.hud.canvas, display.glow.canvas, holdButton, document.getElementById('map-bearing'), document.getElementById('debug')],
  photo: () => {
    // The frame at device resolution, with a small Archie mark and the game's address, bottom-right.
    const view = display.view();
    const out = document.createElement('canvas');
    out.width = view.devW;
    out.height = view.devH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(display.ctx.canvas, 0, 0);
    const k = view.uiScale;
    const name = label('ARCHIE', [0xe8, 0xdf, 0xc4, 255]);
    const link = label(GAME_URL.replace('https://', '').replace(/\/$/, '').toUpperCase(), [0xb8, 0xb5, 0xa6, 255]);
    const plane = scene.sprites.frames[Math.floor(scene.sprites.frames.length / 2)];
    const w = Math.max(name.width + plane.width / 2 + 3, link.width) + 6;
    const h = 5 + 2 + 5 + 6;
    const x0 = Math.floor(view.devW / k) - w - 6;
    const y0 = Math.floor(view.devH / k) - h - 6;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = 'rgb(20 19 15 / 0.7)';
    ctx.fillRect(x0, y0, w, h);
    ctx.drawImage(plane, 0, 0, plane.width, plane.height, x0 + 3, y0 + 2, plane.width / 2, plane.height / 2);
    ctx.drawImage(name, x0 + 3 + plane.width / 2 + 3, y0 + 3);
    ctx.drawImage(link, x0 + w - 3 - link.width, y0 + 3 + 5 + 2 + 2);
    return out;
  },
});

// A press that lands on a debug toggle flips it and goes no further (it must not steer the plane).
window.addEventListener(
  'pointerdown',
  (e) => {
    if (!IS_DEV || state.phase !== 'playing') return;
    const hit = toggleAt(toggles, display.view(), e.clientX, e.clientY);
    if (!hit) return;
    hit.on = !hit.on;
    onToggle(hit.id, hit.on);
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
const plane = createPlane(numberFromUrl('x', Number.isFinite) ?? 0, numberFromUrl('y', Number.isFinite) ?? 0, startHeading !== undefined ? (startHeading * Math.PI) / 180 : hash(state.seed, 41, 7) * 2 * Math.PI);
const cam = createCamera(plane);
/** Put the plane (and the camera, and the previous tick used for smoothing) at a world point. */
const placePlane = (x: number, y: number, heading?: number) => {
  plane.x = x;
  plane.y = y;
  if (heading !== undefined) plane.heading = heading;
  Object.assign(cam, createCamera(plane));
  Object.assign(prevPlane, plane);
  Object.assign(prevCam, cam);
};
const aids = createAids(plane, IS_DEV ? 'hold' : 'off');
// Previous sim tick, for smooth rendering between ticks on high-refresh screens.
const prevPlane = { ...plane };
const prevCam = { ...cam };
const STEP = 1 / 60;
const scene = createScene(state.seed, state.world.density); // farms 2.5× the base rate in play; development packs them 4× closer still
// Development only: a front always runs through the plane's start. In production fronts fall where they fall.
// (Set here for the main thread, which places lamps from the farms, and in every tile request for the workers.)
DEV.atStart = state.world.frontAtStart;
Object.assign(scene.features, worldFeatures(state.world));

/** The date's look: recomputed only when the calendar day changes, then handed to the scene (tiles, grade). */
let seasonDay = NaN;
const currentSeason = () => {
  if (state.clock.day === seasonDay) return;
  seasonDay = state.clock.day;
  const s = applyOverrides(seasonAt(dateOf(seasonDay), state.seed), overrides);
  scene.season = { state: s, key: seasonKey(s) };
};
// The front is being built one part at a time: for now only its trench lines, in one style (being
// worked on: hasty; `?trench=traversed` shows the original).
console.log(`Trench style: ${TRENCH_STYLE} (pin one with ?trench=${TRENCH_STYLES.join('|')})`);
const loading = document.getElementById('loading');
const loadingPlane = document.getElementById('loading-plane');
const loadingText = document.getElementById('loading-text');
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
// Tooltips (ui/tooltip.ts): the instruments are drawn, so they're areas of the screen, hit-tested against the
// board's last layout; the compass and the Hold switch are controls of their own.
const uiPxNow = () => display.view().uiScale / (window.devicePixelRatio || 1);
const tips = createTooltips(uiPxNow);
let boardSlots: readonly { x: number; y: number; w: number; h: number }[] = [];
// In the board's order (ui/hud.ts createHud): compass, altimeter, MPH, petrol, RPM, temp, pressure, clinometer.
const INSTRUMENT_TIPS: readonly Tip[] = [
  { title: 'COMPASS', body: 'YOUR HEADING. THE GOLD WEDGE IS THE TRENCH BEARING FROM THE MAP. TAP IT FOR A FRESH ONE.' },
  { title: 'ALTIMETER', body: 'HEIGHT IN THOUSANDS OF FEET.' },
  { title: 'AIRSPEED', body: 'MILES AN HOUR.' },
  { title: 'PETROL', body: 'EMPTY TO FULL. LOW IN THE RED.' },
  { title: 'REV COUNTER', body: 'ENGINE SPEED. KEEP HER OUT OF THE RED.' },
  { title: 'ENGINE TEMPERATURE', body: 'TOO HOT AND SHE LOSES POWER UNTIL SHE COOLS.' },
  { title: 'PRESSURE', body: 'THE PETROL TANK. AT ZERO THE ENGINE STARVES.' },
  { title: 'CLINOMETER', body: 'HOW FAR SHE IS BANKED.' },
];
tips.area(canvas, (cx, cy) => {
  const u = uiPxNow(), x = cx / u, y = cy / u;
  const i = boardSlots.findIndex((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
  return i > 0 ? INSTRUMENT_TIPS[i] ?? null : null; // (the compass has its own control, over it)
});
if (mapButton) tips.attach(mapButton, () => INSTRUMENT_TIPS[0]);
if (holdButton) tips.attach(holdButton, { title: 'HOLD STEADY', body: 'LET GO OF THE STICK: SHE FLIES STRAIGHT AND LEVEL. T' });
// Offscreen voices (game/voices.ts, ui/voice.ts): the observer in flight, the squadron at base, as text.
const voices = createVoiceBox(createVoices('base'), {
  uiPx: uiPxNow,
  paused: () => state.phase === 'paused',
  place: (scene) => (scene === 'flight' && boardSlots.length ? Math.round((display.view().uiH - Math.min(...boardSlots.map((r) => r.y)) + 8) * uiPxNow()) : 16),
});
const refreshMapBearing = () => {
  DEV.density = scene.features.density ?? 1;
  DEV.fronts = scene.features.military;
  DEV.onlyTrenches = scene.features.onlyTrenches ?? false;
  DEV.trenchStyle = state.world.trenchStyle;
  mapBearing = trenchBearing(state.seed, plane.x, plane.y);
  if (!mapButton) return;
  const fix = mapBearing === null ? 'No trench found on this map' : `Trench bearing ${String(Math.round((mapBearing * 180 / Math.PI + 360) % 360) % 360).padStart(3, '0')} degrees saved`;
  mapButton.setAttribute('aria-label', `${fix}. Tap compass to consult map again.`); // (no title: the game's own tooltip shows instead)
};
refreshMapBearing();
mapButton?.addEventListener('click', () => {
  if (state.phase === 'playing') refreshMapBearing();
});
const clockFace = createClockFace();
const smoke = createSmoke();
// Development always shows the full diagnostic panel; `?debug` exposes performance timings in a production build.
const debugPanel = document.getElementById('debug');
const debugSong = `song      ${progression.id}`;
const debugRequested = new URLSearchParams(location.search).has('debug');
let screen = 'loading'; // which screen is up, for the debug panel (set each frame, in render)
const debugDetails = () => {
  const view = display.view();
  const sun = sunNow(state.clock);
  if (view.mobile) return `seed      ${state.seed}\nposition  x ${plane.x.toFixed(1)}  y ${plane.y.toFixed(1)}`;
  const heading = ((plane.heading * 180) / Math.PI + 360) % 360;
  if (!screen.startsWith('flight')) return `screen    ${screen}\nviewport  ${innerWidth}x${innerHeight} css  dpr ${devicePixelRatio || 1}`;
  return [
    `screen    ${screen}`,
    ...(IS_DEV ? [debugSong] : []),
    `seed      ${state.seed}`,
    `position  x ${plane.x.toFixed(1)}  y ${plane.y.toFixed(1)} world px`,
    `mode      ${state.mode}`,
    `level     ${state.level}  sortie ${state.sortie.number}  mission ${state.mission?.id ?? 'free flight'}`,
    `phase     ${state.phase}${document.hidden ? ' (hidden)' : ''}`,
    `date      ${dateText(state.clock.day)}  ${state.clock.hours.toFixed(2)} h  x${timeSpeed()}`,
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
let debugPanelBottom = 0;
const prof = createProfiler(IS_DEV || debugRequested, (text) => {
  if (!debugPanel) return;
  debugPanel.hidden = false;
  const view = display.view();
  const mobile = view.mobile;
  debugPanel.style.fontSize = mobile ? '9px' : '';
  // Bottom-left on an upright phone, and off the flight (the menu's and the desk's plates are top-right).
  const portrait = (mobile && view.uiH > view.uiW) || !screen.startsWith('flight');
  debugPanel.style.top = portrait ? 'auto' : '';
  debugPanel.style.bottom = portrait ? '8px' : '';
  debugPanel.style.left = portrait ? '8px' : '';
  debugPanel.style.right = portrait ? 'auto' : '';
  const timings = mobile ? text.split('\n').filter((s, i) => i === 0 || s.startsWith('frame ')).map((s) => s.split(' (')[0]).join('\n') : text;
  debugPanel.textContent = `${debugDetails()}\n${timings}`;
  debugPanelBottom = debugPanel.getBoundingClientRect().bottom;
});

let controlsLayoutKey = '';
let hudLightNow = '';
const hudGrade = document.getElementById('hud-grade-matrix');
if (holdButton) holdButton.style.filter = 'url(#hud-grade)'; // the HUD's DOM control takes the light of the hour (the volume sliders, in the settings panel, don't)
let radiumNow = -1;
let glowDrawn = false;
let lastComplete = false; // every visible tile ready in the last frame (for archie.ready())
if (IS_DEV || debugRequested) {
  installDevApi({
    say: (speaker, text, scene) => voices.say({ speaker: speaker as Parameters<typeof voices.say>[0]['speaker'], text: text.toUpperCase(), scene }),
    state: () => ({
      seed: state.seed,
      phase: state.phase,
      mode: state.mode,
      world: { ...state.world },
      levelProgress: structuredClone(state.levelProgress),
      level: state.level,
      mission: structuredClone(state.mission),
      sortie: structuredClone(state.sortie),
      elapsedSeconds: state.elapsedSeconds,
      day: state.clock.day,
      hours: +state.clock.hours.toFixed(3),
      speed: timeSpeed(),
      plane: { x: +plane.x.toFixed(1), y: +plane.y.toFixed(1), headingDeg: +(((plane.heading * 180) / Math.PI + 360) % 360).toFixed(1), speed: +plane.speed.toFixed(1), bank: +plane.bank.toFixed(2) },
      sun: (({ elevation, azimuth, strength }) => ({ elevationDeg: +((elevation * 180) / Math.PI).toFixed(2), azimuthDeg: +((azimuth * 180) / Math.PI).toFixed(2), strength: +strength.toFixed(2) }))(sunNow(state.clock)),
      features: { ...scene.features },
      toggles: Object.fromEntries(toggles.items.map((g) => [g.id, g.on])),
      raster: { width: canvas.width, height: canvas.height, scale: display.view().scale },
      view: (({ w, h, scale, devW, devH }) => ({ w, h, scale, devW, devH }))(display.view()),
    }),
    setHours: (hours) => game.setTime(hours),
    pause: () => { game.pause(); syncSession(); },
    resume: () => { game.resume(); syncSession(); },
    session: () => game.snapshot(),
    setSpeed: (k) => (speedOverride = k),
    overrides: () => overrides,
    setOverrides: (o) => {
      overrides = o;
      setCampaignStart(startFor(o, state.clock.day));
      seasonDay = NaN;
      currentSeason();
    },
    date: () => formatISO(dateOf(state.clock.day)),
    goto: (x, y, headingDeg) => placePlane(x, y, headingDeg === undefined ? undefined : (headingDeg * Math.PI) / 180),
    toggles: toggles.items,
    onToggle,
    complete: () => lastComplete,
    canvases: [canvas, display.hud.canvas, display.glow.canvas],
    prof,
  });
}

let shown = false;
let loadingFrame = 0;
const drawLoading = () => {
  if (!(loadingPlane instanceof HTMLCanvasElement) || !loading?.isConnected) return;
  const ctx = loadingPlane.getContext('2d')!;
  const tick = Math.floor(performance.now() * 0.06);
  const prop = scene.sprites.props[propWidth(hash(state.seed, tick, 7), 0)];
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
// The browser's back button (or a back swipe) mid-flight: the first press opens the pause menu instead of
// leaving (a history entry is held for it); pressing back from there asks the browser to confirm, since
// leaving ends the flight. Closing or reloading the tab asks too. Not in
// development, where every save reloads the page.
let guarded = false;
let leaving = false; // MAIN MENU: leave without asking
const guardBack = () => {
  if (guarded) return;
  guarded = true;
  history.pushState({ archie: 'flight' }, '');
  window.addEventListener('popstate', () => {
    if (state.phase !== 'playing' && state.phase !== 'paused') return;
    history.pushState({ archie: 'flight' }, ''); // hold the page again
    if (!pauseUi.isOpen()) pauseUi.open();
  });
  if (!IS_DEV) {
    window.addEventListener('beforeunload', (e) => {
      if (leaving || (state.phase !== 'playing' && state.phase !== 'paused')) return;
      e.preventDefault();
    });
  }
};
const launch = () => {
  voices.setScene('flight');
  if (!loading?.isConnected) return;
  if (navigator.userActivation?.isActive) enterGameMode(); // only straight after a click (the landing page's)
  audio.start();
  unlockAudio();
  setPhase('handoff'); // audio and flight begin together; steering waits for the reveal
  guardBack();
  cancelAnimationFrame(loadingFrame);
  loading.classList.add('done');
  loading.setAttribute('aria-hidden', 'true');
  const fadeMs = 900;
  setTimeout(() => {
    loading.remove();
    setPhase('playing');
  }, fadeMs);
};
// The landing page's choice is the press that starts the flight (and unlocks the audio): once the world is
// ready the plane settles to its place and the flight begins, with no second press.
const show = () => {
  shown = true;
  window.removeEventListener('resize', sizeLoading);
  if (IS_DEV) return launch(); // development goes straight in once everything has loaded
  loading?.classList.add('settling');
  setTimeout(launch, 900);
};

// The landing page comes first (static, already on screen): STORY, FREE FLY or SETTINGS. The world loads
// behind it; take-off waits for a choice. `?play` skips it (tools and agents go straight to flight).
let chosen = false;
// STORY opens the barn (src/story/barn.ts): its TAKE OFF / CONTINUE starts a story flight from where the
// last one left off. Story flights keep their place (every 10 s, and on leaving) and each one is written
// into the logbook when you go back to the main menu. `?story` opens the barn straight away; `?day=N`
// sets the campaign day (the desk's calendar and orders) for a look.
let barn: { close: () => void; isOpen: () => boolean } | undefined;
let storyFlight = false;
const storyProgress = () => ({ seed: state.seed, day: state.clock.day, hours: state.clock.hours, level: state.level, sortie: state.sortie.number, plane: { x: plane.x, y: plane.y, heading: plane.heading } });
const keepStory = () => {
  if (storyFlight && (state.phase === 'playing' || state.phase === 'paused')) save.story(storyProgress());
};
setInterval(keepStory, 10_000);
window.addEventListener('pagehide', keepStory);
document.addEventListener('visibilitychange', () => document.hidden && keepStory());
const logStoryFlight = () => {
  if (!storyFlight) return;
  keepStory();
  const minutes = Math.round(state.sortie.elapsedSeconds / 60);
  if (minutes >= 1) {
    save.log({ sortie: save.data.log.length + 1, date: dateText(state.clock.day), minutes });
  }
};
const DAY_PARAM = numberFromUrl('day', (n) => Number.isInteger(n) && n >= 0 && n < 4000);
if (DAY_PARAM !== undefined) game.setTime(state.clock.hours, DAY_PARAM);
/** The desk as the story stands: the date, the next sortie, the log book (its rank and number as he
 * arrived, for now; it wears with every flight logged). */
const storyInfo = (): BarnInfo => {
  const day = DAY_PARAM ?? save.data.story?.day ?? state.clock.day;
  const [year, month, date] = campaignDate(day).split('-').map(Number);
  const now = new Date();
  return {
    day: date, month: MONTHS[month - 1], year, sortie: save.data.log.length + 1, date: dateText(day),
    hours: now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600, sunset: sunsetHour(sunDay(dateOf(day))),
    logbook: { ...LOGBOOK_START, wear: Math.min(1, LOGBOOK_START.wear + save.data.log.length * 0.02) },
  };
};
const storyGamePx = () => display.view().scale / (window.devicePixelRatio || 1);
const storyUiPx = () => display.view().uiScale / (window.devicePixelRatio || 1);
let warmDesk: ReturnType<typeof prepareBarn> | undefined;
const openStory = () => {
  const page = document.getElementById('landing');
  if (page) page.inert = true;
  const saved = save.data.story;
  voices.setScene('base');
  barn = openBarn({
    tips,
    info: storyInfo(),
    prepared: warmDesk,
    resuming: !!saved,
    log: save.data.log,
    uiPx: storyUiPx,
    gamePx: storyGamePx, // flight's pixel size
    measure: IS_DEV || debugRequested ? (name, ms) => prof.add(name, ms) : undefined,
    onSettings: (back) => settings.open(back),
    onFly: () => {
      barn?.close();
      barn = undefined;
      landing.dismiss();
      // For now every take-off from the desk (the goggles, the orders, the log book, the plates) is a Free Fly:
      // story flights (resuming `saved`, keeping their place, the log book) come back with the missions.
      chosen = true;
    },
    onClose: () => {
      barn = undefined;
      if (page) page.inert = false;
      document.getElementById('landing-story')?.focus();
    },
  });
  warmDesk = undefined; // the desk now owns the pending preparation
};
const landing = wireLanding({
  skip: new URLSearchParams(location.search).has('play'),
  onSettings: (back) => settings.open(back),
  onStory: openStory,
  onReady: () => {
    if (!barn?.isOpen()) warmDesk = prepareBarn(storyInfo(), storyGamePx(), storyUiPx());
  },
  onFreeFly: () => {
    warmDesk?.cancel();
    warmDesk = undefined;
    chosen = true;
  },
});
if (new URLSearchParams(location.search).has('story') && !chosen) openStory();

// While the landing page is up, its window shows the landscape and its clouds (no plane), drifting slowly
// south (the view creeps north from the start), and the game itself isn't drawn: it's hidden beneath. The page
// shows only a loading mark until that view is fully loaded.
const LANDING_DRIFT = 8; // game px / s
let landingCtx: CanvasRenderingContext2D | null = null;
let landingT0 = -1;
function drawLanding(c: HTMLCanvasElement, at: number) {
  const view = display.view();
  pauseUi.layout(view); // the UI pixel size (--ui-px), which the landing page is sized in too
  const dpr = window.devicePixelRatio || 1;
  const box = c.parentElement!.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width * dpr));
  const h = Math.max(1, Math.round(box.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
    c.style.width = `${w / dpr}px`;
    c.style.height = `${h / dpr}px`;
  }
  landingCtx ??= c.getContext('2d', { alpha: false })!;
  landingCtx.imageSmoothingEnabled = false; // (resizing resets it)
  if (landingT0 < 0) landingT0 = at;
  const y = plane.y - ((at - landingT0) / 1000) * LANDING_DRIFT;
  // The bare landscape: no farms or buildings of any kind, no front (the game's own render sets these back).
  currentSeason();
  scene.features.structures = false;
  scene.features.military = false;
  scene.features.frontLine = false;
  if (drawTerrain(landingCtx, view, scene, plane.x, y, sunNow(state.clock), state.clock.day, (at - landingT0) / 1000)) landing.ready();
}

function render(alpha: number, timing: RenderTiming) {
    screen = barn?.isOpen() ? 'story desk' : landing.terrain() ? 'main menu' : state.phase === 'paused' ? 'flight (paused)' : 'flight';
    // The frame profiler (development, ?debug) measures every screen, so dropped frames show wherever they
    // happen: at the desk the frame itself does nothing (the desk paints on its own: its work is counted in
    // through `prof.add`); on the main menu it's the terrain window.
    if (barn?.isOpen()) {
      pauseUi.layout(display.view()); // the UI pixel size, for the settings panel over the desk (cheap: only on a change)
      prof.start(timing);
      prof.end();
      return;
    }
    const terrain = landing.terrain();
    if (terrain) {
      prof.start(timing);
      drawLanding(terrain, timing.at);
      prof.mark('menu view');
      prof.end();
      return;
    }
    // Tiles are generated in Web Workers and appear when ready (see render/tilegen.ts).
    prof.start(timing);
    const p = blend(prevPlane, plane, alpha, ['heading']);
    const c = blend(prevCam, cam, alpha, ['angle']);
    const view = display.view();
    const warning = engineWarning(plane);
    const sun = sunNow(state.clock);
    currentSeason();
    for (const toggle of worldToggles) toggle.on = state.world[worldToggleKeys[toggle.id as keyof typeof worldToggleKeys]];
    scene.features.structures = state.world.farms;
    scene.features.military = state.world.fronts;
    scene.features.frontLine = state.world.frontLines;
    const complete = drawScene(display.ctx, view, scene, p, c, { t: state.elapsedSeconds - STEP * (1 - alpha), smoke, warning, sun, day: state.clock.day, prof });
    lastComplete = complete;
    // The HUD has its own canvas, stacked over the game's, so the world canvas ends on the light of the hour
    // (drawing anything on it after the grade forces the browser to render the frame early: ~0.5 ms at dusk).
    const hudCtx = display.hud;
    pauseUi.layout(view);
    hudCtx.setTransform(1, 0, 0, 1, 0, 0);
    hudCtx.clearRect(0, 0, view.devW, view.devH);
    // Radium glow (dusk to dawn only): its own layer, faded in by CSS opacity, so it isn't dimmed with the HUD.
    const radium = radiumGlow(sun.elevation);
    const glowCtx = display.glow;
    if (radium !== radiumNow) glowCtx.canvas.style.opacity = String((radiumNow = radium) * 0.9);
    if (radium > 0 || glowDrawn) {
      glowCtx.setTransform(1, 0, 0, 1, 0, 0);
      glowCtx.clearRect(0, 0, view.devW, view.devH);
      glowDrawn = radium > 0;
    }
    const glow = radium > 0 ? glowCtx : undefined;
    const light = gradeMatrix(scene.hourLight);
    const instrumentLight = hudLight(light);
    const board = drawHud(hudCtx, view, hud, instruments, warning, state.elapsedSeconds, glow, instrumentLight);
    boardSlots = board.slots;
    const layoutKey = `${view.devW}:${view.devH}:${view.uiScale}`;
    const layoutChanged = layoutKey !== controlsLayoutKey;
    controlsLayoutKey = layoutKey;
    if (layoutChanged && mapButton instanceof HTMLButtonElement) {
      const px = view.uiScale / (window.devicePixelRatio || 1);
      const { x, y, w: size } = board.slots[0];
      const target = Math.max(size * px, 44);
      const pad = (target - size * px) / 2;
      mapButton.style.left = `${x * px - pad}px`;
      mapButton.style.top = `${y * px - pad}px`;
      mapButton.style.width = mapButton.style.height = `${target}px`;
      mapButton.style.visibility = 'visible';
    }
    // Development toggles: just below the debug panel, top-right.
    const panel = debugPanel && !debugPanel.hidden ? debugPanelBottom : 0;
    drawToggles(hudCtx, view, toggles, IS_DEV, undefined, undefined, Math.ceil((panel * view.devW) / window.innerWidth / view.uiScale) + 4);
    const fastTime = controlsAnchor(board.banks[1], 'engine'); // the volume plates above the engine clump; Hold above the flight clump
    if (fastTime) {
      const px = view.uiScale / (window.devicePixelRatio || 1);
      const holdAnchor = controlsAnchor(board.banks[0], 'hold');
      if (holdButton instanceof HTMLButtonElement && holdFace instanceof HTMLCanvasElement) {
        const holding = holdButton.getAttribute('aria-pressed') === 'true';
        if (holdFace.dataset.on !== String(holding)) {
          drawTumbler(holdFace, holding); // the HOLD tumbler switch: lever up when holding
          holdFace.dataset.on = String(holding);
        }
        if (layoutChanged) {
          holdButton.style.left = `${holdAnchor.x * px}px`;
          holdButton.style.top = `${holdAnchor.y * px}px`;
          holdButton.style.width = `${holdAnchor.w * px}px`;
          holdButton.style.height = `${holdFace.height * px}px`;
          holdFace.style.width = `${holdAnchor.w * px}px`;
          holdFace.style.height = `${holdFace.height * px}px`;
          holdButton.style.visibility = 'visible';
        }
      }
    }
    const today = sunDay(dateOf(state.clock.day)); // the watch shows legal time; the clock and saves stay solar
    drawClock(hudCtx, view, clockFace, {
      hours: legalHours(today, state.clock.hours),
      day: state.clock.day,
      sunset: legalHours(today, sunsetHour(today)),
      dateText: dateText(state.clock.day),
    }, glow, instrumentLight);
    // The HUD takes the light of the hour: the world's own grade, as a colour matrix the browser applies.
    if (light !== hudLightNow) {
      hudLightNow = light;
      hudGrade?.setAttribute('values', light);
      if (holdButton) holdButton.style.filter = instrumentLight ? 'url(#hud-grade)' : 'none';
    }
    prof.mark('hud');
    prof.end();
    if (complete && !shown && chosen) show(); // take-off once the world is ready and a mode is chosen
}
// Resizing (full screen in or out, rotating a phone, dragging the window) clears the canvases. While the
// game runs the next frame repaints them; paused, the loop draws nothing, so repaint once here, after the
// display has re-fitted, so the world, the HUD and its controls are right behind the menu.
const repaintIfPaused = () => requestAnimationFrame(() => {
  if (state.phase === 'paused') render(1, { at: performance.now(), gap: 0, simulationMs: 0 });
});
window.addEventListener('resize', repaintIfPaused);
document.addEventListener('fullscreenchange', repaintIfPaused);
startLoop(
  (dt) => {
    if (!game.simulating) {
      controls.read(); // discard anything held before or pressed during an inactive phase
      return;
    }
    Object.assign(prevPlane, plane);
    Object.assign(prevCam, cam);
    applyFastPlane();
    updatePlane(plane, applyAids(aids, plane, controls.read()), dt);
    const holding = String(aids.mode === 'hold');
    if (holdButton && holdButton.getAttribute('aria-pressed') !== holding) holdButton.setAttribute('aria-pressed', holding);
    updateCamera(cam, plane, dt);
    updateInstruments(instruments, plane, dt);
    const warning = engineWarning(plane);
    audio.updateEngine({ rpm: instruments.rpm * 2000, rough: warning / 2, bank: plane.bank, heat: plane.heat, boosting: plane.boosting, overheated: plane.overheated });
    updateSmoke(smoke, plane, warning, dt);
    game.advance(dt, timeSpeed());
  },
  render,
  60,
  () => state.phase !== 'paused',
);
