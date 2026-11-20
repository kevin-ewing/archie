// Tile generation: a small pool of Web Workers, with a main-thread fallback if workers can't start
// (very old browsers, strict sandboxes). Either way each tile arrives as a promise.

import type { TileData } from '../world/ground.ts';
import { generateTile, type TileRequest } from '../world/generate.ts';
import type { TileJob, TileResult } from '../world/worker.ts';

export type TileGen = (req: TileRequest) => Promise<TileData>;

/** Tiles made since the last look, per kind (ground, shade, clouds…): how many, and the time making them took (in the
 * workers). For the debug panel: `takeTileStats()` reads and resets. */
const made = new Map<string, { n: number; ms: number }>();
const tally = (kind: string, ms: number) => { const m = made.get(kind) ?? { n: 0, ms: 0 }; m.n++; m.ms += ms; made.set(kind, m); };
export function takeTileStats(): Map<string, { n: number; ms: number }> {
  const out = new Map(made);
  made.clear();
  return out;
}

type Waiting = { resolve: (t: TileData) => void; reject: (e: unknown) => void; kind: string };

/** One tile at a time on the main thread, yielding between tiles. Slower, but always works. */
function mainThreadGen(): TileGen {
  const queue: (() => void)[] = [];
  let busy = false;
  const pump = () => {
    const job = queue.shift();
    busy = !!job;
    if (job) {
      job();
      setTimeout(pump, 0);
    }
  };
  return (req) =>
    new Promise((resolve) => {
      queue.push(() => { const t0 = performance.now(); const t = generateTile(req); tally(req.kind, performance.now() - t0); resolve(t); });
      if (!busy) {
        busy = true;
        setTimeout(pump, 0);
      }
    });
}

export function createTileGen(): TileGen {
  const fallback = mainThreadGen();
  const count = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  const waiting = new Map<number, Waiting>();
  let broken = false;
  let workers: Worker[] = [];

  const giveUp = (why: unknown) => {
    if (broken) return;
    broken = true;
    console.warn('Tile workers unavailable; generating on the main thread instead.', why);
    for (const w of workers) w.terminate();
    for (const job of waiting.values()) job.reject(why); // the tile layer re-requests them
    waiting.clear();
  };

  try {
    workers = Array.from({ length: count }, () => {
      const w = new Worker(new URL('../world/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }: MessageEvent<TileResult>) => {
        const w = waiting.get(data.id);
        if (w) tally(w.kind, data.ms);
        w?.resolve(data.tile);
        waiting.delete(data.id);
      };
      w.onerror = (e) => giveUp(e.message || 'worker error');
      return w;
    });
  } catch (e) {
    giveUp(e);
  }

  let next = 0;
  return (req) => {
    if (broken) return fallback(req);
    return new Promise((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject, kind: req.kind });
      workers[id % count].postMessage({ id, req } satisfies TileJob);
    });
  };
}
