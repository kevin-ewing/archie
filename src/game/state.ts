// Session / campaign ownership. Pure TypeScript: no DOM, audio, rendering or storage side effects.
// Missions are references to future content; level/day progression is explicit, not inferred from midnight.
import { TRENCH_STYLES, type TrenchStyle } from '../world/settings.ts';
import type { Features } from '../world/generate.ts';
import { dateOf, formatISO } from '../sim/calendar.ts';
import { readWeatherSeed, readWeatherSetting, type WeatherSetting } from '../sim/weatherset.ts';
import { advanceClock, DAYLIGHT, type Clock } from '../sim/daylight.ts';

export const GAME_MODES = ['free-play'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export type WorldConfig = {
  fronts: boolean; farms: boolean; frontLines: boolean; frontAtStart: boolean;
  onlyTrenches: boolean; density: number; trenchStyle: TrenchStyle;
};
export const DEFAULT_WORLD: Readonly<WorldConfig> = Object.freeze({ fronts: true, farms: true, frontLines: false, frontAtStart: false, onlyTrenches: true, density: 2.5, trenchStyle: 'hasty' });
type LevelProgress = { id: string | null; objectives: { id: string; completed: boolean }[] };
export type SortieSetup = { day: number; startHour: number; level: number; seed?: number; weatherSeed?: number | null; weather?: WeatherSetting | null; world?: Partial<WorldConfig>; levelId?: string; objectives?: readonly string[] };

/** Adapt game terminology to the existing renderer/worker contract in one place. */
export function worldFeatures(world: Readonly<WorldConfig>): Features {
  return { military: world.fronts, structures: world.farms, frontLine: world.frontLines, atStart: world.frontAtStart, onlyTrenches: world.onlyTrenches, density: world.density, trenchStyle: world.trenchStyle };
}

export type RunPhase = 'loading' | 'handoff' | 'playing' | 'debrief';
export type GamePhase = RunPhase | 'paused';
export type PauseReason = 'user' | 'visibility';
export type MissionOutcome = 'completed' | 'failed';
type Mission = { id: string; status: 'active' | MissionOutcome; startedAt: Clock; endedAt: Clock | null };
type MissionRecord = Mission & { level: number; sortie: number };
type Sortie = { number: number; startedAt: Clock; elapsedSeconds: number };
type Data = {
  version: 2;
  mode: GameMode;
  world: WorldConfig;
  levelProgress: LevelProgress;
  seed: number;
  weatherSeed: number | null; // null = follow the world seed
  weather: WeatherSetting | null; // null = generated weather
  level: number;
  phase: GamePhase;
  resumePhase: RunPhase | null;
  pauseReasons: PauseReason[];
  clock: Clock;
  sortie: Sortie;
  mission: Mission | null;
  missionHistory: MissionRecord[];
  elapsedSeconds: number; // active simulation seconds, independent of accelerated solar time
};
type MissionView = Readonly<Omit<Mission, 'startedAt' | 'endedAt'>> & { readonly startedAt: Readonly<Clock>; readonly endedAt: Readonly<Clock> | null };
export type GameState = Readonly<Omit<Data, 'clock' | 'sortie' | 'mission' | 'missionHistory' | 'pauseReasons' | 'world' | 'levelProgress'>> & {
  readonly world: Readonly<WorldConfig>;
  readonly levelProgress: { readonly id: string | null; readonly objectives: readonly Readonly<LevelProgress['objectives'][number]>[] };
  readonly clock: Readonly<Clock>;
  readonly sortie: Readonly<Omit<Sortie, 'startedAt'>> & { readonly startedAt: Readonly<Clock> };
  readonly mission: MissionView | null;
  readonly missionHistory: readonly (MissionView & { readonly level: number; readonly sortie: number })[];
  readonly pauseReasons: readonly PauseReason[];
};

const RUN_PHASES: readonly RunPhase[] = ['loading', 'handoff', 'playing', 'debrief'];
const PAUSE_REASONS: readonly PauseReason[] = ['user', 'visibility'];
const transitions: Record<RunPhase, readonly RunPhase[]> = { loading: ['handoff'], handoff: ['playing'], playing: ['debrief'], debrief: ['loading'] };
const requireValue = (ok: boolean, message: string): void => { if (!ok) throw new Error(message); };
const natural = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
const validHour = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 24;
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && id.trim() === id;
const record = (v: unknown): Record<string, unknown> => {
  requireValue(!!v && typeof v === 'object' && !Array.isArray(v), 'Expected a game-state object.');
  return v as Record<string, unknown>;
};
function readClock(v: unknown): Clock {
  const c = record(v);
  requireValue(natural(c.day) && validHour(c.hours), 'Invalid campaign day or solar hour.');
  return { day: c.day as number, hours: c.hours as number };
}

function readMode(value: unknown): GameMode {
  requireValue(GAME_MODES.includes(value as GameMode), 'Unsupported game mode.');
  return value as GameMode;
}
function readWorld(value: unknown): WorldConfig {
  const w = record(value);
  for (const key of ['fronts', 'farms', 'frontLines', 'frontAtStart', 'onlyTrenches']) requireValue(typeof w[key] === 'boolean', `Invalid world flag: ${key}.`);
  requireValue(typeof w.density === 'number' && Number.isFinite(w.density) && w.density > 0 && w.density <= 1000, 'Invalid world density.');
  requireValue(TRENCH_STYLES.includes(w.trenchStyle as TrenchStyle), 'Invalid trench style.');
  return { fronts: w.fronts as boolean, farms: w.farms as boolean, frontLines: w.frontLines as boolean, frontAtStart: w.frontAtStart as boolean, onlyTrenches: w.onlyTrenches as boolean, density: w.density as number, trenchStyle: w.trenchStyle as TrenchStyle };
}
function readLevel(value: unknown): LevelProgress {
  const v = record(value);
  requireValue(v.id === null || validId(v.id), 'Invalid level ID.');
  requireValue(Array.isArray(v.objectives), 'Invalid objectives.');
  const objectives = (v.objectives as unknown[]).map((value) => {
    const o = record(value);
    requireValue(validId(o.id) && typeof o.completed === 'boolean', 'Invalid objective.');
    return { id: o.id as string, completed: o.completed as boolean };
  });
  requireValue(new Set(objectives.map((o) => o.id)).size === objectives.length, 'Duplicate objective IDs.');
  return { id: v.id as string | null, objectives };
}

/** Day zero is 10 May 1915. UTC arithmetic keeps campaign dates independent of the player's timezone/DST. */
export function campaignDate(day: number): string {
  requireValue(natural(day), 'Invalid campaign day.');
  return formatISO(dateOf(day));
}

export function createGame(options: { mode?: GameMode; seed?: number; weatherSeed?: number | null; weather?: WeatherSetting | null; startHour?: number; day?: number; level?: number; world?: Partial<WorldConfig>; levelId?: string; objectives?: readonly string[] } = {}) {
  const mode = readMode(options.mode ?? 'free-play');
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const world = readWorld({ ...DEFAULT_WORLD, ...options.world });
  const levelProgress = readLevel({ id: options.levelId ?? null, objectives: (options.objectives ?? []).map((id) => ({ id, completed: false })) });
  const weatherSeed = options.weatherSeed == null ? null : readWeatherSeed(options.weatherSeed);
  const weather = options.weather == null ? null : readWeatherSetting(options.weather);
  const clock = readClock({ day: options.day ?? 0, hours: options.startHour ?? DAYLIGHT.startHour });
  requireValue(natural(seed) && seed < 2 ** 31, 'Invalid world seed.');
  const level = options.level ?? 1;
  requireValue(natural(level) && level > 0, 'Level must be a positive integer.');
  campaignDate(clock.day);
  return manage({ version: 2, mode, world, levelProgress, seed, weatherSeed, weather, level, phase: 'loading', resumePhase: null, pauseReasons: [], clock,
    sortie: { number: 1, startedAt: { ...clock }, elapsedSeconds: 0 }, mission: null, missionHistory: [], elapsedSeconds: 0 });
}

function manage(data: Data) {
  const basePhase = (): RunPhase => data.resumePhase ?? data.phase as RunPhase;
  const simulating = () => data.phase === 'handoff' || data.phase === 'playing';
  function transition(next: RunPhase) {
    const from = basePhase();
    if (next === from) return;
    requireValue(transitions[from].includes(next), `Cannot change game phase from ${from} to ${next}.`);
    if (data.phase === 'paused') data.resumePhase = next;
    else data.phase = next;
  }
  return {
    get state(): GameState { return data; },
    get simulating(): boolean { return simulating(); },
    transition(next: 'handoff' | 'playing') {
      requireValue(next === 'handoff' || next === 'playing', 'Use sortie transitions for loading and debrief.');
      transition(next);
    },
    pause(reason: PauseReason = 'user') {
      requireValue(PAUSE_REASONS.includes(reason), 'Unknown pause reason.');
      if (data.pauseReasons.includes(reason)) return;
      if (data.phase !== 'paused') { data.resumePhase = data.phase; data.phase = 'paused'; }
      data.pauseReasons.push(reason);
    },
    resume(reason: PauseReason = 'user') {
      requireValue(PAUSE_REASONS.includes(reason), 'Unknown pause reason.');
      data.pauseReasons = data.pauseReasons.filter((r) => r !== reason);
      if (data.phase === 'paused' && data.pauseReasons.length === 0) {
        data.phase = data.resumePhase!;
        data.resumePhase = null;
      }
    },
    /** Call at the simulation timestep. Loading, debrief and all pause reasons freeze both clocks. */
    advance(dt: number, speed = 1) {
      requireValue(nonnegative(dt) && dt <= 1 && nonnegative(speed) && speed <= 1000, 'Invalid simulation timestep or clock speed.');
      if (!simulating()) return;
      advanceClock(data.clock, dt, speed);
      data.elapsedSeconds += dt;
      data.sortie.elapsedSeconds += dt;
    },
    /** Time adjustment for developer tools; it does not rewrite when the sortie began. */
    setTime(hours: number, day = data.clock.day) {
      const next = readClock({ day, hours });
      campaignDate(next.day);
      Object.assign(data.clock, next);
    },
    /** These three flags can safely change live; geometry/seed changes belong to the next sortie. */
    setWorldFeatures(patch: Partial<Pick<WorldConfig, 'fronts' | 'farms' | 'frontLines'>>) {
      requireValue(Object.keys(patch).every((k) => ['fronts', 'farms', 'frontLines'].includes(k)), 'Change world geometry through the next sortie setup.');
      data.world = readWorld({ ...data.world, ...patch });
    },
    completeObjective(id: string) {
      requireValue(basePhase() === 'playing', 'Objectives can only complete during a flight.');
      const objective = data.levelProgress.objectives.find((o) => o.id === id);
      requireValue(!!objective, 'Unknown level objective.');
      objective!.completed = true;
    },
    startMission(id: string) {
      requireValue(basePhase() === 'playing' && data.mission?.status !== 'active', 'Finish the active mission before starting another during flight.');
      requireValue(validId(id), 'Invalid mission ID.');
      data.mission = { id, status: 'active', startedAt: { ...data.clock }, endedAt: null };
    },
    finishMission(outcome: MissionOutcome) {
      requireValue(outcome === 'completed' || outcome === 'failed', 'Invalid mission outcome.');
      requireValue(basePhase() === 'playing' && data.mission?.status === 'active', 'No active mission to finish.');
      data.mission!.status = outcome;
      data.mission!.endedAt = { ...data.clock };
      data.missionHistory.push({ ...structuredClone(data.mission!), level: data.level, sortie: data.sortie.number });
    },
    endSortie() {
      requireValue(basePhase() === 'playing' && data.mission?.status !== 'active', 'Resolve the active mission before ending the sortie.');
      transition('debrief');
    },
    /** Mission selection and the next day/level are chosen by campaign logic, never by this clock. */
    beginSortie(options: SortieSetup) {
      requireValue(basePhase() === 'debrief', 'The previous sortie must end before beginning another.');
      const clock = readClock({ day: options.day, hours: options.startHour });
      campaignDate(clock.day);
      requireValue(natural(options.level) && options.level > 0, 'Level must be a positive integer.');
      const nextSeed = options.seed ?? data.seed;
      requireValue(natural(nextSeed) && nextSeed < 2 ** 31, 'Invalid world seed.');
      const nextWeatherSeed = options.weatherSeed === undefined ? data.weatherSeed : options.weatherSeed === null ? null : readWeatherSeed(options.weatherSeed);
      const nextWeather = options.weather === undefined ? data.weather : options.weather === null ? null : readWeatherSetting(options.weather);
      const nextWorld = readWorld({ ...data.world, ...options.world });
      if (options.level !== data.level) requireValue(data.levelProgress.objectives.every((o) => o.completed), 'Complete the current level objectives before advancing.');
      const nextLevel = options.level === data.level && options.levelId === undefined && options.objectives === undefined ? data.levelProgress :
        readLevel({ id: options.levelId ?? null, objectives: (options.objectives ?? []).map((id) => ({ id, completed: false })) });
      transition('loading');
      data.seed = nextSeed;
      data.weatherSeed = nextWeatherSeed;
      data.weather = nextWeather;
      data.world = nextWorld;
      data.levelProgress = nextLevel;
      data.level = options.level;
      Object.assign(data.clock, clock);
      data.sortie = { number: data.sortie.number + 1, startedAt: { ...clock }, elapsedSeconds: 0 };
      data.mission = null;
    },
    /** Detached, versioned session metadata. Plane/world changes belong in a future full save alongside it. */
    snapshot(): GameState { return structuredClone(data); },
  };
}
export type Game = ReturnType<typeof createGame>;

/** The seed the weather uses: its own when set, otherwise the world seed. */
export const weatherSeedOf = (s: Pick<GameState, 'seed' | 'weatherSeed'>): number => s.weatherSeed ?? s.seed;

/** Read untrusted JSON after parsing, validating it before creating a session. No storage is touched. */
export function restoreGame(value: unknown): Game {
  const s = record(value);
  requireValue(s.version === 1 || s.version === 2, 'Unsupported game-state version.');
  const mode = readMode(s.version === 1 ? 'free-play' : s.mode);
  const world = readWorld(s.version === 1 ? DEFAULT_WORLD : s.world);
  const levelProgress = readLevel(s.version === 1 ? { id: null, objectives: [] } : s.levelProgress);
  requireValue(natural(s.seed) && s.seed < 2 ** 31 && natural(s.level) && s.level > 0, 'Invalid seed or level.');
  requireValue(nonnegative(s.elapsedSeconds), 'Invalid session duration.');
  requireValue(s.phase === 'paused' || RUN_PHASES.includes(s.phase as RunPhase), 'Invalid game phase.');
  requireValue(Array.isArray(s.pauseReasons) && s.pauseReasons.every((r: unknown) => PAUSE_REASONS.includes(r as PauseReason)) && new Set(s.pauseReasons).size === s.pauseReasons.length, 'Invalid pause reasons.');
  const paused = s.phase === 'paused';
  const reasons = s.pauseReasons as PauseReason[];
  requireValue(paused ? RUN_PHASES.includes(s.resumePhase as RunPhase) && reasons.length > 0 : s.resumePhase === null && reasons.length === 0, 'Inconsistent pause state.');
  const weatherSeed = s.weatherSeed == null ? null : readWeatherSeed(s.weatherSeed);
  const weather = s.weather == null ? null : readWeatherSetting(s.weather);
  const clock = readClock(s.clock);
  campaignDate(clock.day);
  const sortie = record(s.sortie);
  requireValue(natural(sortie.number) && sortie.number > 0 && nonnegative(sortie.elapsedSeconds) && sortie.elapsedSeconds <= (s.elapsedSeconds as number), 'Invalid sortie.');
  const startedAt = readClock(sortie.startedAt);
  campaignDate(startedAt.day);
  const readMission = (value: unknown): Mission => {
    const m = record(value);
    requireValue(validId(m.id) && ['active', 'completed', 'failed'].includes(m.status as string), 'Invalid mission.');
    requireValue(m.status === 'active' ? m.endedAt === null : m.endedAt !== null, 'Invalid mission completion.');
    const result = { id: m.id as string, status: m.status as Mission['status'], startedAt: readClock(m.startedAt), endedAt: m.endedAt === null ? null : readClock(m.endedAt) };
    campaignDate(result.startedAt.day);
    if (result.endedAt) campaignDate(result.endedAt.day);
    return result;
  };
  const mission = s.mission === null ? null : readMission(s.mission);
  requireValue(Array.isArray(s.missionHistory), 'Invalid mission history.');
  const missionHistory = (s.missionHistory as unknown[]).map((value): MissionRecord => {
    const row = record(value);
    const result = readMission(row);
    requireValue(result.status !== 'active' && natural(row.level) && row.level > 0 && natural(row.sortie) && row.sortie > 0 && row.sortie <= (sortie.number as number), 'Invalid mission history entry.');
    return { ...result, level: row.level as number, sortie: row.sortie as number };
  });
  const phase = (paused ? s.resumePhase : s.phase) as RunPhase;
  requireValue(mission?.status !== 'active' || phase === 'playing', 'An active mission requires a flight in progress.');
  const game = manage({ version: 2, mode, world, levelProgress, seed: s.seed as number, weatherSeed, weather, level: s.level as number, phase, resumePhase: null, pauseReasons: [], clock,
    sortie: { number: sortie.number as number, startedAt, elapsedSeconds: sortie.elapsedSeconds as number }, mission, missionHistory, elapsedSeconds: s.elapsedSeconds as number });
  // Visibility belongs to the new browser tab. A restored active flight waits for explicit resumption.
  if (reasons.includes('user') || phase === 'playing' || phase === 'handoff') game.pause();
  return game;
}
