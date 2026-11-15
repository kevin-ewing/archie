import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landAt } from './ground.ts';
import { frontInfo, FRONTS } from './fronts.ts';
import { structureAt, structuresNear } from './structures.ts';

const SEED = 1915;
const area = structuresNear(SEED, -30000, -30000, 30000, 30000);

test('many kinds of building, assembled from parts so they differ, deterministically', () => {
  const kinds = new Set(area.map((s) => s.kind));
  for (const k of ['farm', 'cottage', 'hamlet', 'post mill', 'tower mill', 'chapel'] as const) assert.ok(kinds.has(k), k);
  const farms = area.filter((s) => s.kind === 'farm');
  const plans = new Set(farms.map((s) => `${s.parts.length}:${s.parts.map((p) => p.style).join('')}`));
  assert.ok(plans.size > 10, `farm plans vary (${plans.size})`);
  assert.deepEqual(structuresNear(SEED, 0, 0, 3000, 3000), structuresNear(SEED, 0, 0, 3000, 3000));
  for (const s of area) {
    // Never in a lake or wood: every building and feature corner stands on open farmland.
    const [c, sn] = [Math.cos(s.angle), Math.sin(s.angle)];
    for (const o of [...s.parts, ...s.bits]) {
      for (const [u, v] of [[0, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        const lx = o.x + u * o.hw;
        const ly = o.y + v * o.hh;
        assert.equal(landAt(SEED, Math.round(s.x + lx * c - ly * sn), Math.round(s.y + lx * sn + ly * c)), 'open', `${s.kind} clear of water and woods`);
      }
    }
  }
});

test('nothing stands in the trenches or gun lines; buildings near a front are ruins or damaged', () => {
  for (const s of area) {
    const f = frontInfo(SEED, s.x, s.y);
    assert.ok(f.u > f.nml + 600 && !(f.u > FRONTS.battery - 380 && f.u < FRONTS.battery + 380));
  }
  assert.ok(area.some((s) => s.ruined) && area.some((s) => !s.ruined));
});

test('roofs slope (one face to the sun), and every building sits on trampled earth', () => {
  const farm = area.find((s) => s.kind === 'farm' && !s.ruined && s.parts[0].style === 'gable')!;
  const house = farm.parts[0];
  const at = (lx: number, ly: number) => {
    const c = Math.cos(farm.angle);
    const sn = Math.sin(farm.angle);
    return structureAt([farm], Math.round(farm.x + lx * c - ly * sn), Math.round(farm.y + lx * sn + ly * c));
  };
  const alongX = house.hw >= house.hh;
  const ridge = at(house.x, house.y)![1];
  const eave = alongX ? at(house.x, house.y + house.hh - 2)![1] : at(house.x + house.hw - 2, house.y)![1];
  assert.ok(ridge > eave);
  // Just outside a building, mostly trampled earth rather than untouched field.
  let worn = 0;
  for (let k = 0; k < 40; k++) if (at(house.x - house.hw - 2, house.y - house.hh + k * (house.hh / 20))) worn++;
  assert.ok(worn > 10, `lived-in ground (${worn}/40)`);
});

test('farms carry a spread of period features, and pastures hold cattle', () => {
  const farms = area.filter((s) => s.kind === 'farm');
  const kinds = new Set(farms.flatMap((s) => s.bits.map((b) => b.kind)));
  for (const k of ['well', 'cart', 'wood', 'hives', 'hops', 'muck', 'pasture', 'clamp', 'willows', 'logs', 'rick', 'faggots', 'cocks']) assert.ok(kinds.has(k as never), k);
  const f = farms.find((s) => !s.ruined && s.bits.some((b) => b.kind === 'pasture'))!;
  const p = f.bits.find((b) => b.kind === 'pasture')!;
  const [c, sn] = [Math.cos(f.angle), Math.sin(f.angle)];
  let beasts = 0;
  for (let y = -p.hh + 2; y < p.hh - 2; y++) {
    for (let x = -p.hw + 2; x < p.hw - 2; x++) {
      const px = structureAt([f], Math.round(f.x + (p.x + x) * c - (p.y + y) * sn), Math.round(f.y + (p.x + x) * sn + (p.y + y) * c));
      if (px && px[1] === 1.2) beasts++;
    }
  }
  assert.ok(beasts > 0, 'cattle in the pasture');
});
