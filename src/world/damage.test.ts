import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDamage, createDamage, damageAt, damageVersion, marksFor } from './damage.ts';
import { groundChunk } from './ground.ts';
import { tileStamp } from './generate.ts';

test('damage is recorded on every tile it touches, bumping just their versions', () => {
  const dmg = createDamage();
  const keys = addDamage(dmg, { x: 128, y: 64, r: 10, kind: 'crater', seed: 1 }, 128);
  assert.deepEqual(keys.sort(), ['0,0', '1,0']);
  assert.equal(damageVersion(dmg, 0, 0), 1);
  assert.equal(damageVersion(dmg, 5, 5), 0);
  assert.equal(marksFor(dmg, 1, 0).length, 1);
});

test('a crater: low bowl, raised rim; and it lands in the regenerated ground tile', () => {
  const m = { x: 64, y: 64, r: 10, kind: 'crater' as const, seed: 3 };
  assert.ok(damageAt([m], 64, 64)![1] < damageAt([m], 72, 64)![1], 'rim higher than bowl');
  assert.equal(damageAt([m], 100, 64), null);
  const stamp = tileStamp(1915, 0, 0, { structures: false, military: false }, [m]);
  const tile = groundChunk(1915, 0, 0, stamp);
  const plain = groundChunk(1915, 0, 0);
  assert.notDeepEqual(tile.rgba, plain.rgba);
  assert.ok(tile.heights![64 * 128 + 72] > 0, 'the rim has height (it casts a shadow)');
});
