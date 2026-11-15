// What a player keeps between visits, in their own browser (localStorage): their settings and where they
// are in the story (the world, the day and hour, where the plane was). Never in development or with
// `?debug` (`enabled` false): there every visit starts fresh, so testing can't be skewed by an old save.
// Storage can be missing or full (private browsing, quotas): every read and write fails quietly.

export type Settings = { engine: number; music: number; localTime: boolean }; // volumes, 0 … 1; start at the browser's own time of day
export type StoryProgress = { seed: number; day: number; hours: number; level: number; sortie: number; plane: { x: number; y: number; heading: number } };
export type LogEntry = { sortie: number; date: string; minutes: number }; // a story flight, written up in the logbook
export type SaveData = { version: 1; settings: Settings; story: StoryProgress | null; log: LogEntry[] };

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ engine: 0.4, music: 0.4, localTime: false });
const KEY = 'archie.save';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const unit = (v: unknown, d: number) => (finite(v) ? Math.min(1, Math.max(0, v)) : d);

/** A save read back, checked field by field: anything missing or malformed falls back to the default. Pure. */
export function readSave(raw: string | null): SaveData {
  let v: Record<string, unknown> = {};
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    v = {};
  }
  const s = (v.settings ?? {}) as Record<string, unknown>;
  const st = v.story as Record<string, unknown> | null | undefined;
  const p = (st?.plane ?? {}) as Record<string, unknown>;
  const story =
    st && finite(st.seed) && finite(st.day) && finite(st.hours) && finite(st.level) && finite(st.sortie) && finite(p.x) && finite(p.y) && finite(p.heading)
      ? { seed: st.seed, day: st.day, hours: st.hours, level: st.level, sortie: st.sortie, plane: { x: p.x, y: p.y, heading: p.heading } }
      : null;
  const log = Array.isArray(v.log)
    ? (v.log as Record<string, unknown>[]).filter((e) => e && finite(e.sortie) && typeof e.date === 'string' && finite(e.minutes)).map((e) => ({ sortie: e.sortie as number, date: (e.date as string).slice(0, 24), minutes: e.minutes as number }))
    : [];
  return { version: 1, log, settings: { engine: unit(s.engine, DEFAULT_SETTINGS.engine), music: unit(s.music, DEFAULT_SETTINGS.music), localTime: s.localTime === true }, story };
}

export type Save = { data: SaveData; settings: (patch: Partial<Settings>) => void; story: (progress: StoryProgress | null) => void; log: (entry: LogEntry) => void };

/** The player's save. `enabled` false (development, ?debug): defaults, and nothing is ever written. */
export function createSave(enabled: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage): Save {
  let data = readSave(null);
  if (enabled) {
    try {
      data = readSave(storage?.getItem(KEY) ?? null);
    } catch {
      /* no storage: defaults */
    }
  }
  const write = () => {
    if (!enabled) return;
    try {
      storage?.setItem(KEY, JSON.stringify(data));
    } catch {
      /* full or unavailable: keep playing */
    }
  };
  return {
    get data() {
      return data;
    },
    settings(patch) {
      data = { ...data, settings: { ...data.settings, ...patch } };
      write();
    },
    story(progress) {
      data = { ...data, story: progress };
      write();
    },
    log(entry) {
      data = { ...data, log: [...data.log, entry] };
      write();
    },
  };
}
