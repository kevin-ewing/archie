// Tile generation: a small pool of Web Workers, with a main-thread fallback if workers can't start
// (very old browsers, strict sandboxes). Either way each tile arrives as a promise.

import type { TileData } from '../world/ground.ts';
import { generateTile, requestTransfer, type TileRequest } from '../world/generate.ts';
import type { TileJob, TileResult } from '../world/worker.ts';

export type TileGen = (req: TileRequest) => Promise<TileData>;

type Waiting = { resolve: (t: TileData) => void; reject: (e: unknown) => void };

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
      queue.push(() => resolve(generateTile(req)));
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
        waiting.get(data.id)?.resolve(data.tile);
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
      waiting.set(id, { resolve, reject });
      workers[id % count].postMessage({ id, req } satisfies TileJob, requestTransfer(req));
    });
  };
}
