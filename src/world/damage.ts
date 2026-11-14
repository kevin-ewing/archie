// Live damage: marks left on the world as the game goes on (shell craters, scorching). Nothing causes
// damage yet; this is the store and the stamping, ready for artillery, crashes and bombs.
//
// The store is plain data on the main thread: marks indexed by the tiles they touch, with a version per
// tile. A ground tile that has marks is (re)generated with them stamped in (in the worker, like the rest
// of the terrain), so damage persists as you fly away and come back, gets real heights (crater rims
// throw shadows), and costs nothing per frame. Adding a mark bumps the versions of the tiles it touches,
// which re-generates just those.

import { hash } from '../core/noise.ts';
import type { RGB } from './ground.ts';
import type { Stamp } from './military.ts';

export type DamageMark = { x: number; y: number; r: number; kind: 'crater' | 'scorch'; seed: number };
export type Damage = { byTile: Map<string, DamageMark[]>; version: Map<string, number> };

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const D = { bowl: rgb(0x3a3024), rim: rgb(0x7d6c52), spoil: rgb(0x6a5a44), soot: [rgb(0x2a2520), rgb(0x3a332b)] };
const NONE: readonly DamageMark[] = [];

export const createDamage = (): Damage => ({ byTile: new Map(), version: new Map() });

/** Record a mark; returns the keys of the tiles it touches (their versions are bumped). */
export function addDamage(dmg: Damage, mark: DamageMark, chunk: number): string[] {
  const reach = mark.r * 1.6; // rims and thrown spoil reach past the crater itself
  const keys: string[] = [];
  for (let cy = Math.floor((mark.y - reach) / chunk); cy <= Math.floor((mark.y + reach) / chunk); cy++) {
    for (let cx = Math.floor((mark.x - reach) / chunk); cx <= Math.floor((mark.x + reach) / chunk); cx++) {
      const key = `${cx},${cy}`;
      const list = dmg.byTile.get(key) ?? [];
      list.push(mark);
      dmg.byTile.set(key, list);
      dmg.version.set(key, (dmg.version.get(key) ?? 0) + 1);
      keys.push(key);
    }
  }
  return keys;
}

export const marksFor = (dmg: Damage, cx: number, cy: number): readonly DamageMark[] => dmg.byTile.get(`${cx},${cy}`) ?? NONE;
export const damageVersion = (dmg: Damage, cx: number, cy: number): number => dmg.version.get(`${cx},${cy}`) ?? 0;

/** The damage stamp at a world pixel from a tile's marks (later marks on top), or null. Pure. */
export function damageAt(marks: readonly DamageMark[], x: number, y: number): Stamp | null {
  for (let k = marks.length - 1; k >= 0; k--) {
    const m = marks[k];
    const d = Math.hypot(x - m.x, y - m.y);
    const n = hash(m.seed, Math.round(x), Math.round(y));
    const ragged = m.r * (0.85 + 0.3 * n); // a torn edge, not a circle
    if (m.kind === 'crater') {
      if (d < ragged * 0.6) return [D.bowl, 0.2];
      if (d < ragged) return [D.rim, 1.4];
      if (d < m.r * 1.6 && n < 0.35 * (1 - (d - m.r) / (0.6 * m.r))) return [D.spoil, 0.5]; // thrown earth
    } else if (d < ragged && n < 0.85 - (0.6 * d) / m.r) return [D.soot[n < 0.3 ? 0 : 1], 0];
  }
  return null;
}
