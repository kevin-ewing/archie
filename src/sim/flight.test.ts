import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlane, updatePlane, FLIGHT } from './flight.ts';

const fly = (p: ReturnType<typeof createPlane>, steer: number, boost: boolean, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) updatePlane(p, { steer, boost }, 1 / 60);
};

test('steering right banks, turns clockwise and moves east', () => {
  const p = createPlane();
  fly(p, 1, false, 2);
  assert.ok(p.bank > 0.99 && p.heading > 0.15, 'banked and turned right');
  assert.ok(p.x > 0, 'moved east');
  fly(p, 0, false, 2);
  assert.ok(Math.abs(p.bank) < 1e-9, 'levels off when input centres');
});

test('full power is faster, burns more fuel, and overheating locks it out until cooled', () => {
  const p = createPlane();
  fly(p, 0, true, 3);
  assert.ok(p.speed > FLIGHT.cruise && p.boosting);
  fly(p, 0, true, 10);
  assert.ok(p.overheated && !p.boosting, 'locked out at max heat');
  fly(p, 0, true, 5);
  assert.ok(p.overheated, 'still locked while cooling, even if held');
  fly(p, 0, false, 10);
  assert.ok(!p.overheated, 'recovers once cool');

  const cruise = createPlane();
  const full = createPlane();
  fly(cruise, 0, false, 5);
  fly(full, 0, true, 5);
  assert.ok(1 - full.fuel > 2 * (1 - cruise.fuel), 'full power burns faster');
});
