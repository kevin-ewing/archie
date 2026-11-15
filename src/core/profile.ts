// A tiny frame profiler: development enables it automatically; `?debug` enables it in production.
// Off by default, and then free (every call is a no-op).
//
// It also says why frames drop. A dropped frame took over 1.5× the display's frame time (the median gap
// lately, with at least a 60 Hz target so sustained slow delivery is not learned away). If the game's own work in that frame was most of the gap, the cause is its slowest stage
// ("js: clouds"); if not, the time went elsewhere: the GPU / compositor, garbage collection, or another
// thread ("external"). Keep measurements in the bounded history instead of logging every dropped frame.

import type { RenderTiming } from './loop.ts';

/** One frame's timings: when it ended, the game's work in it, the gap since the last, and each stage. */
export type FrameTimes = { at: number; work: number; gap: number; stages: ReadonlyMap<string, number> };
export type Profiler = {
  start: (timing?: RenderTiming) => void;
  mark: (name: string) => void;
  end: () => void;
  /** The last few hundred frames, oldest first (for tools: see src/devtools.ts). Empty when disabled. */
  history: () => readonly FrameTimes[];
};
const HISTORY = 600; // ~5–10 s of frames

export function createProfiler(enabled: boolean, show: (text: string) => void): Profiler {
  if (!enabled) return { start: () => {}, mark: () => {}, end: () => {}, history: () => [] };
  const history: FrameTimes[] = [];
  const totals = new Map<string, number>();
  let cur = new Map<string, number>(); // this frame's stage times
  let frames = 0;
  let last = 0;
  let windowStart = performance.now();
  let frameStart = 0;
  let timing: RenderTiming | undefined;
  let prevEnd = 0;
  let period = 1000 / 60; // the display's frame time: median gap of the previous window
  let drops = 0;
  let allDrops = 0;
  let allFrames = 0;
  let worst = 0;
  const causes = new Map<string, number>(); // "js: clouds" / "external" → drops
  const gaps: number[] = []; // time between frame ends, this window
  return {
    start(next) {
      timing = next;
      last = performance.now();
      frameStart = last - (timing?.simulationMs ?? 0);
      cur = new Map();
      if (timing) {
        cur.set('simulation', timing.simulationMs);
        totals.set('simulation', (totals.get('simulation') ?? 0) + timing.simulationMs);
      }
    },
    mark(name) {
      const now = performance.now();
      const ms = now - last;
      totals.set(name, (totals.get(name) ?? 0) + ms);
      cur.set(name, ms);
      last = now;
    },
    end() {
      const now = performance.now();
      const work = now - frameStart;
      totals.set('frame', (totals.get('frame') ?? 0) + work);
      frames++;
      const frameGap = timing?.gap ?? (prevEnd ? now - prevEnd : 0);
      if (frameGap > 0 && frameGap < 1000) {
        // longer = tab hidden / paused, not a drop
        const gap = frameGap;
        gaps.push(gap);
        allFrames++;
        worst = Math.max(worst, gap);
        if (gap > Math.min(period, 1000 / 60) * 1.5) {
          allDrops++;
          drops++;
          const top = [...cur].sort((a, b) => b[1] - a[1])[0];
          const cause = work > gap * 0.6 && top ? `js: ${top[0]}` : 'external';
          causes.set(cause, (causes.get(cause) ?? 0) + 1);
        }
      }
      history.push({ at: now, work, gap: frameGap, stages: cur });
      if (history.length > HISTORY) history.shift();
      prevEnd = now;
      if (now - windowStart < 500) return;
      const fps = (frames * 1000) / (now - windowStart);
      const rows = [...totals].map(([k, v]) => `${k.padEnd(9)} ${(v / frames).toFixed(2)} ms`);
      const sorted = [...gaps].sort((a, b) => a - b);
      period = sorted[sorted.length >> 1] ?? period;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      const avgWork = (totals.get('frame') ?? 0) / frames;
      const why = [...causes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
      show(
        `${fps.toFixed(0)} fps | interval p95 ${p95.toFixed(1)} ms | JS ${avgWork.toFixed(2)} ms\n${rows.join('\n')}\n` +
          `drops     ${drops} now, ${allDrops}/${allFrames} total (${((100 * allDrops) / Math.max(1, allFrames)).toFixed(1)}%)\nworst     ${worst.toFixed(1)} ms` +
          (why ? `\ncauses    ${why}` : ''),
      );
      totals.clear();
      gaps.length = 0;
      drops = 0;
      worst = 0;
      frames = 0;
      windowStart = now;
    },
    history: () => history,
  };
}
