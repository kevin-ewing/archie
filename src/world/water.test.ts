import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontPoint, frontsNear, territoryAt } from './fronts.ts';
import { tileStamp } from './generate.ts';
import { CHUNK, groundAt, landAt, WATER, type RGB } from './ground.ts';

test('nothing of the front is ever drawn on water: trenches run up to a lake and stop', () => {
  const features = { structures: false, military: true, density: 10, onlyTrenches: true, trenchStyle: 'hasty', frontLine: true } as const;
  let lakeTiles = 0;
  let stampedNearWater = 0;
  for (const seed of [11, 33, 55]) {
    tileStamp(seed, 0, 0, features, []); // (sets the world's settings, so the front plan below matches)
    const f = frontsNear(seed, -1, -1, 1, 1).find((g) => g.territory === territoryAt(seed, 0, 0).id);
    if (!f) continue;
    const tiles = new Set<string>();
    for (let s = -f.half; s < f.half; s += 48) for (let u = -500; u <= 500; u += 48) {
      const p = frontPoint(seed, f, s, u);
      if (landAt(seed, p.x, p.y) === 'water') tiles.add(`${Math.floor(p.x / CHUNK)},${Math.floor(p.y / CHUNK)}`);
    }
    for (const key of [...tiles].slice(0, 25)) {
      const [cx, cy] = key.split(',').map(Number);
      const stamp = tileStamp(seed, cx, cy, features, []);
      if (!stamp) continue;
      lakeTiles++;
      for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y += 2) for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x += 2) {
        if (!stamp(x, y)) continue;
        const g: RGB = groundAt(seed, x, y)[0];
        assert.ok(g !== WATER.deep && g !== WATER.shallow, `seed ${seed}: the front stamps water at ${x},${y}`);
        if (landAt(seed, x, y) === 'water') stampedNearWater++;
      }
    }
  }
  assert.ok(lakeTiles > 10, `checked plenty of lake tiles on the fronts (${lakeTiles})`);
  assert.ok(stampedNearWater > 0, 'works do run up close to the water (onto the shore), not stop far short');
});

test('tracks never run over water: a link across a lake is left out, a free end stops short of it', async () => {
  const { tracksNear, trackAt } = await import('./structures.ts');
  const { isWater } = await import('./ground.ts');
  const features = { structures: true, military: false, density: 10 } as const;
  let wet = 0;
  let tracks = 0;
  for (const seed of [11, 33]) {
    tileStamp(seed, 0, 0, features, []); // (sets the world's settings)
    // Look round a few lakes: wherever water is, any track near it must stay off it.
    for (let y = -20000; y < 20000 && wet < 40; y += 400) for (let x = -20000; x < 20000 && wet < 40; x += 400) {
      if (!isWater(seed, x, y)) continue;
      wet++;
      const near = tracksNear(seed, x - 300, y - 300, x + 300, y + 300);
      tracks += near.length;
      for (let py = y - 300; py < y + 300; py += 3) for (let px = x - 300; px < x + 300; px += 3) {
        if (isWater(seed, px, py)) assert.equal(trackAt(near, px, py), null, `seed ${seed}: a track over water at ${px},${py}`);
      }
    }
  }
  assert.ok(wet >= 20 && tracks > 0, `checked water near tracks (${wet} lake spots, ${tracks} tracks)`);
});
