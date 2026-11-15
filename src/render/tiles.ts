// Cached tiles, generated asynchronously (see tilegen.ts), composed axis-aligned into ONE layer image that
// the scene then draws rotated. (Drawing many adjacent tiles rotated would leave hairline seams: Canvas
// antialiases image edges.) Ground tiles also keep their heights, for shadows.
//
// Layers whose content depends on something that changes (the sun for the shading layer; toggles and
// damage for the ground) pass a `version`, per tile: tiles from an older version keep being drawn while their replacement is generated, so
// there's never a gap; with `fadeMs`, the new version cross-fades in over the old, so changes are gradual.

import { HEIGHT_STEPS, type TileData } from '../world/ground.ts';

type Entry = { canvas: HTMLCanvasElement; heights?: Uint8Array; glints?: Uint32Array; version: string; prev?: HTMLCanvasElement; at: number };

export type TileLayer = {
  /**
   * An image covering at least the square [x0, x0+side) × [y0, y0+side), whose top-left is at (x, y) in
   * layer coordinates (tile-aligned). It's only redrawn when the set of tiles under it changes, so most
   * frames cost nothing here. `complete` = every tile was ready.
   */
  compose: (x0: number, y0: number, side: number) => { canvas: HTMLCanvasElement; x: number; y: number; complete: boolean };
  /** Warm the cache without composing an image (for a temporarily invisible layer). */
  prefetch: (x0: number, y0: number, side: number) => void;
  /** Height at a world pixel, from the cached tile (0 if that tile isn't ready). */
  heightAt: (x: number, y: number) => number;
  /** A cached tile's height map (CHUNK×CHUNK, ×HEIGHT_STEPS), if it's ready. */
  heights: (cx: number, cy: number) => Uint8Array | undefined;
  /** A cached ground tile's sparkle points (tile-local pixel indexes), if it's ready. */
  glints: (cx: number, cy: number) => Uint32Array | undefined;
  /** True if the tile is cached and up to date with its version. */
  isCurrent: (cx: number, cy: number) => boolean;
};

const RETRY_MS = 1000; // after a failed tile, wait this long before asking again
const NOT_READY_MS = 100; // after a tile that can't be made yet (its inputs aren't ready), wait this long: not every frame

export const fadeProgress = (at: number, now: number, duration: number): number => Math.min(1, Math.max(0, (now - at) / duration));

export function createTileLayer(
  /** Generate a tile; return null if it can't be made yet (e.g. its inputs aren't ready) to try again later. */
  request: (cx: number, cy: number) => Promise<TileData> | null,
  tile: number,
  opts: { maxInFlight?: number; version?: (cx: number, cy: number) => string; fadeMs?: number; prefetchTiles?: number } = {},
): TileLayer {
  const maxInFlight = opts.maxInFlight ?? 32;
  const ring = opts.prefetchTiles ?? 1;
  const version = opts.version ?? (() => '');
  const cache = new Map<string, Entry>(); // insertion order = least recently used first
  const pending = new Set<string>();
  const failedAt = new Map<string, number>();
  // Memory cap: keep about twice what the current view (plus prefetch ring) needs. Set by compose().
  let maxCached = 64;
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d')!;
  let dirty = true; // a tile arrived or changed since the composite was drawn
  let lastRange = '';

  function fetch(key: string, cx: number, cy: number) {
    if (pending.has(key) || pending.size >= maxInFlight) return;
    if (performance.now() - (failedAt.get(key) ?? -Infinity) < RETRY_MS) return;
    const v = version(cx, cy);
    const job = request(cx, cy);
    if (!job) {
      failedAt.set(key, performance.now() - RETRY_MS + NOT_READY_MS); // asked again in NOT_READY_MS
      return;
    }
    pending.add(key);
    job.then(
      (data) => {
        pending.delete(key);
        const now = performance.now();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = tile;
        canvas.getContext('2d')!.putImageData(new ImageData(data.rgba, tile, tile), 0, 0);
        const old = cache.get(key);
        let prev = opts.fadeMs ? old?.canvas : undefined;
        // A new sun bake can arrive before the previous cross-fade finishes. Preserve the exact image
        // currently on screen, rather than jumping back to the last completed bake before fading again.
        if (old?.prev && opts.fadeMs) {
          const k = fadeProgress(old.at, now, opts.fadeMs);
          if (k < 1) {
            prev = document.createElement('canvas');
            prev.width = prev.height = tile;
            const pctx = prev.getContext('2d')!;
            pctx.globalAlpha = 1 - k;
            pctx.drawImage(old.prev, 0, 0);
            pctx.globalAlpha = k;
            pctx.drawImage(old.canvas, 0, 0);
          }
        }
        cache.delete(key);
        cache.set(key, { canvas, heights: data.heights, glints: data.glints, version: v, prev, at: now });
        dirty = true;
        failedAt.delete(key);
        while (cache.size > maxCached) cache.delete(cache.keys().next().value!);
      },
      () => {
        pending.delete(key);
        failedAt.set(key, performance.now()); // retried after RETRY_MS
      },
    );
  }

  function get(cx: number, cy: number): Entry | undefined {
    const key = `${cx},${cy}`;
    const e = cache.get(key);
    if (e) {
      cache.delete(key); // refresh LRU position
      cache.set(key, e);
      if (e.version !== version(cx, cy)) fetch(key, cx, cy); // stale: keep drawing it, refresh in the background
      return e;
    }
    fetch(key, cx, cy);
    return undefined;
  }

  function prefetch(cx0: number, cy0: number, cx1: number, cy1: number, visible: boolean) {
    maxCached = Math.max(64, 2 * (cx1 - cx0 + 1 + 2 * ring) * (cy1 - cy0 + 1 + 2 * ring));
    // Nearest tiles first: distant preloads must not take the whole in-flight budget.
    for (let distance = visible ? 0 : 1; distance <= ring; distance++) {
      for (let cy = cy0 - distance; cy <= cy1 + distance; cy++) {
        for (let cx = cx0 - distance; cx <= cx1 + distance; cx++) {
          if (distance === 0 || cx === cx0 - distance || cx === cx1 + distance || cy === cy0 - distance || cy === cy1 + distance) get(cx, cy);
        }
      }
    }
  }

  return {
    prefetch(x0, y0, side) {
      prefetch(Math.floor(x0 / tile), Math.floor(y0 / tile), Math.floor((x0 + side - 1) / tile), Math.floor((y0 + side - 1) / tile), true);
    },
    compose(x0, y0, side) {
      const cx0 = Math.floor(x0 / tile);
      const cy0 = Math.floor(y0 / tile);
      const cx1 = Math.floor((x0 + side - 1) / tile);
      const cy1 = Math.floor((y0 + side - 1) / tile);
      // Bookkeeping every frame (cheap): keep tiles fresh in the cache, refresh stale ones, note fades.
      let complete = true;
      let fading = false;
      const now = performance.now();
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const e = get(cx, cy);
          if (!e) complete = false;
          else if (e.prev) fading = true;
        }
      }
      // Prefetch outside the view without enlarging the drawn composite.
      prefetch(cx0, cy0, cx1, cy1, false);

      // Redraw the composite only when something under it changed.
      const range = `${cx0},${cy0},${cx1},${cy1}`;
      if (range !== lastRange || dirty || fading) {
        lastRange = range;
        dirty = false;
        const w = (cx1 - cx0 + 1) * tile;
        const h = (cy1 - cy0 + 1) * tile;
        if (layer.width !== w || layer.height !== h) {
          layer.width = w;
          layer.height = h;
        } else lctx.clearRect(0, 0, w, h);
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const e = cache.get(`${cx},${cy}`);
            if (!e) continue;
            const k = e.prev && opts.fadeMs ? fadeProgress(e.at, now, opts.fadeMs) : 1;
            if (k < 1) {
              lctx.globalAlpha = 1 - k; // cross-fade from the previous version
              lctx.drawImage(e.prev!, (cx - cx0) * tile, (cy - cy0) * tile);
              lctx.globalAlpha = k;
            } else if (e.prev) {
              e.prev = undefined;
              dirty = true; // one more redraw, now fully the new version
            }
            lctx.drawImage(e.canvas, (cx - cx0) * tile, (cy - cy0) * tile);
            lctx.globalAlpha = 1;
          }
        }
      }
      return { canvas: layer, x: cx0 * tile, y: cy0 * tile, complete };
    },
    heightAt(x, y) {
      const cx = Math.floor(x / tile);
      const cy = Math.floor(y / tile);
      const h = cache.get(`${cx},${cy}`)?.heights; // no LRU refresh: the tile is on screen anyway
      return h ? h[(y - cy * tile) * tile + (x - cx * tile)] / HEIGHT_STEPS : 0;
    },
    heights: (cx, cy) => cache.get(`${cx},${cy}`)?.heights,
    glints: (cx, cy) => cache.get(`${cx},${cy}`)?.glints,
    isCurrent: (cx, cy) => cache.get(`${cx},${cy}`)?.version === version(cx, cy),
  };
}
