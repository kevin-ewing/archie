import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { frontPoint, frontsNear } from './fronts.ts';
import { generateTile } from './generate.ts';
import { CHUNK } from './ground.ts';
import { MAY_LOOK, seasonAt, seasonKey } from '../sim/seasons.ts';
import { readSave } from '../game/save.ts';
const SEED = 1915;
const hashOf = (t: ReturnType<typeof generateTile>) => createHash('sha1').update(t.rgba).update(t.heights!).digest('hex');
const features = { structures: true, military: true, density: 2.5, atStart: true };
function places(): [number, number][] {
  const out: [number, number][] = [];
  const f = frontsNear(SEED, -1, -1, 1, 1)[0];
  if (f) for (const s of [-3000, 0, 4000]) for (const u of [-300, 0, 300]) {
    const p = frontPoint(SEED, f, s, u);
    out.push([Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK)]);
  }
  for (let k = 0; k < 6; k++) out.push([k * 13 - 30, k * 7 - 20]);
  return out;
}
test('the Reference_Date look hashes identically to no season at all', () => {
  for (const [cx, cy] of places()) {
    const bare = generateTile({ kind: 'ground', seed: SEED, cx, cy, features });
    const may = generateTile({ kind: 'ground', seed: SEED, cx, cy, features, season: MAY_LOOK });
    assert.equal(hashOf(may), hashOf(bare), `tile ${cx},${cy}`);
  }
});
test('a save stores no season or override field', () => {
  const save = readSave(JSON.stringify({ season: 1, date: '1916-01-21', overrides: { snow: 1 }, settings: { engine: 0.5 } }));
  assert.deepEqual(Object.keys(save).sort(), ['log', 'settings', 'story', 'version']);
  assert.ok(!/season|override|date/i.test(JSON.stringify(save)));
});
test('the ground tile version includes the season key', () => {
  const src = readFileSync(new URL('../render/scene.ts', import.meta.url), 'utf8');
  assert.match(src, /const groundVersion = [^\n]*scene\.season\.key/);
  const keys = new Set([seasonAt({ year: 1915, month: 1, day: 21 }, SEED), seasonAt({ year: 1915, month: 7, day: 21 }, SEED), MAY_LOOK].map(seasonKey));
  assert.equal(keys.size, 3, 'different seasons give different keys');
});
