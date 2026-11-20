// One entry point for generating any tile, used by the worker and by the main-thread fallback.
//
// A ground tile is built in layers, each reading only the layers before it (never a later one):
//   1. Front plan (world/fronts.ts): where the fronts run, from the seed alone.
//   2. Landscape (world/ground.ts): fields, woods and lakes, kept clear of each front's core.
//   3. Farms (world/structures.ts): placed on open land, clear of each front's core.
//   4. Stamping, per pixel, in priority order: live damage → farms and buildings → the front's works
//      (trenches, wire, craters, batteries; world/military.ts) → tracks → the landscape itself.
// Flat additions (tracks, worn earth, yards) lie on the ground, so anything standing on it (a tree crown,
// a hedge, scrub) stays on top of them.

import { CHUNK, groundAt, noDigMask, treeAt, type RGB, groundChunk, type GroundStamp, type TileData } from './ground.ts';
import { cloudChunk, cloudShadowChunk } from './clouds.ts';
import { damageAt, type DamageMark } from './damage.ts';
import { frontsNear } from './fronts.ts';
import { militaryTile } from './military.ts';
import { DEV, type TrenchStyle } from './settings.ts';
import { shadeTile, type ShadeSun } from './shading.ts';
import { structureAt, structuresNear, trackAt, tracksNear } from './structures.ts';
import { MAY_LOOK, type SeasonState } from '../sim/seasons.ts';
import { setLook } from './season.ts';

/** Which additions to stamp into ground tiles (development toggles; both on in play). `density` > 1
 *  packs them closer for local debugging (see DEV in world/settings.ts). */
export type Features = {
  structures: boolean;
  military: boolean;
  density?: number;
  onlyTrenches?: boolean; // development: of the front, draw only the trench lines
  frontLine?: boolean; // development: draw the front's own line (its centre) in red
  trenchStyle?: TrenchStyle;
  atStart?: boolean; // development: a front through the plane's start (see DEV in world/settings.ts)
};
export const ALL_FEATURES: Features = { structures: true, military: true };

export type TileRequest =
  | { kind: 'ground'; seed: number; cx: number; cy: number; features?: Features; damage?: readonly DamageMark[]; season?: SeasonState }
  | { kind: 'clouds' | 'cloudShadow'; seed: number; cx: number; cy: number }
  // `tiles`: the heights of the tile and its 8 neighbours, row by row (dy −1…1, dx −1…1). Sent as they are and
  // joined here, in the worker: joining them on the main thread cost more than the request itself.
  | { kind: 'shade'; cx: number; cy: number; tiles: readonly Uint8Array[]; sun: ShadeSun };

/** Apply a request's features to the shared world settings (read by every layer). */
function applySettings(features: Features) {
  DEV.density = features.density ?? 1;
  DEV.fronts = features.military; // with the front off, the landscape and farms ignore it entirely
  DEV.onlyTrenches = features.onlyTrenches ?? false;
  DEV.trenchStyle = features.trenchStyle ?? 'traversed';
  DEV.frontLine = features.frontLine ?? false;
  DEV.atStart = features.atStart ?? true;
}

/** The stamp for one ground tile (layers 1, 3 and 4), or undefined when it has nothing on it (the common case: free). */
export function tileStamp(seed: number, cx: number, cy: number, features: Features, damage: readonly DamageMark[]): GroundStamp | undefined {
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  applySettings(features);
  // 1. The front plan for this tile.
  const fronts = features.military ? frontsNear(seed, x0, y0, x0 + CHUNK, y0 + CHUNK) : [];
  // 3. Farms and their tracks (placed from the plan and the landscape; none in a front's core).
  const structures = features.structures ? structuresNear(seed, x0, y0, x0 + CHUNK, y0 + CHUNK) : [];
  const tracks = features.structures ? tracksNear(seed, x0, y0, x0 + CHUNK, y0 + CHUNK) : [];
  if (!structures.length && !tracks.length && !fronts.length && !damage.length) return undefined;
  // 4. Stamping. The front's works for the whole tile are prepared once (coordinates, craters, cells).
  const noDig = fronts.length ? noDigMask(seed, x0, y0, x0 + CHUNK, y0 + CHUNK) : null; // the front keeps out of water: < 0 is water
  const military = noDig ? militaryTile(seed, fronts, x0, y0, x0 + CHUNK, y0 + CHUNK, noDig) : null;
  // A flat stamp gives way to whatever stands on the landscape there (trees, hedges, scrub).
  const under = (x: number, y: number, px: readonly [RGB, number]): readonly [RGB, number] => {
    if (px[1] > 0) return px;
    const g = groundAt(seed, x, y);
    return g[1] > 0 ? g : px;
  };
  return (x, y) => {
    if (damage.length) {
      const d = damageAt(damage, x, y);
      if (d) return d;
    }
    if (structures.length) {
      const s = structureAt(structures, x, y);
      if (s) return under(x, y, s);
    }
    const m = military ? military(x, y) : null;
    if (m && noDig!(x, y) >= 0) {
      // The front runs on through the woods: only the tree crowns themselves are drawn over its works
      // (not the forest floor, glades or scrub between them).
      return treeAt(seed, x, y) ? groundAt(seed, x, y) : m;
    }
    if (tracks.length) {
      const t = trackAt(tracks, x, y);
      if (t) return under(x, y, [t, 0]);
    }
    return null;
  };
}

export function generateTile(req: TileRequest): TileData {
  switch (req.kind) {
    case 'ground':
      setLook({ ...MAY_LOOK, ...req.season }); // before tileStamp: structures and military read the look too
      // Layer 2 (the landscape) is drawn by groundChunk under the stamp, only where nothing covers it.
      return groundChunk(req.seed, req.cx, req.cy, tileStamp(req.seed, req.cx, req.cy, req.features ?? ALL_FEATURES, req.damage ?? []));
    case 'clouds':
      return { rgba: cloudChunk(req.seed, req.cx, req.cy) };
    case 'cloudShadow':
      return { rgba: cloudShadowChunk(req.seed, req.cx, req.cy) };
    case 'shade':
      return { rgba: shadeTile(joinHeights(req.tiles), req.sun, req.cx, req.cy) };
  }
}

/** Nine tiles' heights (row by row, 3 × 3) as one (3·CHUNK)² grid, for shadeTile. */
export function joinHeights(tiles: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(9 * CHUNK * CHUNK);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const h = tiles[j * 3 + i];
      for (let row = 0; row < CHUNK; row++) out.set(h.subarray(row * CHUNK, row * CHUNK + CHUNK), (j * CHUNK + row) * 3 * CHUNK + i * CHUNK);
    }
  }
  return out;
}
