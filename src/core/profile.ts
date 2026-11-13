// A tiny frame profiler for development: `?debug` in the URL shows fps and where each frame's time goes.
// Off by default, and then free (every call is a no-op).

export type Profiler = { start: () => void; mark: (name: string) => void; end: () => void };

export function createProfiler(enabled: boolean, show: (text: string) => void): Profiler {
  if (!enabled) return { start: () => {}, mark: () => {}, end: () => {} };
  const totals = new Map<string, number>();
  let frames = 0;
  let last = 0;
  let windowStart = performance.now();
  let frameStart = 0;
  return {
    start() {
      frameStart = last = performance.now();
    },
    mark(name) {
      const now = performance.now();
      totals.set(name, (totals.get(name) ?? 0) + now - last);
      last = now;
    },
    end() {
      const now = performance.now();
      totals.set('frame', (totals.get('frame') ?? 0) + now - frameStart);
      frames++;
      if (now - windowStart < 500) return;
      const fps = (frames * 1000) / (now - windowStart);
      const rows = [...totals].map(([k, v]) => `${k.padEnd(9)} ${(v / frames).toFixed(2)} ms`);
      show(`${fps.toFixed(0)} fps\n${rows.join('\n')}`);
      totals.clear();
      frames = 0;
      windowStart = now;
    },
  };
}
