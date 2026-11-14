import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlane, updatePlane, wrapAngle } from './flight.ts';
import { applyAids, createAids, type PilotInput } from './aids.ts';

const idle: PilotInput = { steer: 0, boost: false, toggleHold: false, takeControl: false, pressing: false };
function fly(plane = createPlane(), aids = createAids(plane), input: Partial<PilotInput> = {}, seconds = 1) {
  for (let t = 0; t < seconds; t += 1 / 60) updatePlane(plane, applyAids(aids, plane, { ...idle, ...input }), 1 / 60);
  return { plane, aids };
}
const tick = (plane: ReturnType<typeof createPlane>, aids: ReturnType<typeof createAids>, input: Partial<PilotInput>) =>
  updatePlane(plane, applyAids(aids, plane, { ...idle, ...input }), 1 / 60);

test('the game starts in Hold, flying straight', () => {
  const plane = createPlane(0, 0, 1);
  const aids = createAids(plane);
  assert.equal(aids.mode, 'hold');
  fly(plane, aids, { steer: 1 }, 3); // a hand resting on the mouse is ignored
  assert.ok(Math.abs(wrapAngle(plane.heading - 1)) < 0.01);
});

test('Hold can be disabled for the production start', () => {
  assert.equal(createAids(createPlane(), 'off').mode, 'off');
});

test('engaged mid-turn at full power: rolls out, drops to cruise, holds the heading it rolled out on', () => {
  const plane = createPlane();
  const aids = createAids(plane);
  aids.mode = 'off';
  fly(plane, aids, { steer: 1, boost: true }, 3);
  tick(plane, aids, { steer: 1, boost: true, toggleHold: true });
  assert.equal(aids.mode, 'hold');
  const target = aids.heading;
  fly(plane, aids, { steer: 1, boost: true }, 8);
  assert.ok(Math.abs(plane.bank) < 0.01, 'wings level');
  assert.ok(Math.abs(wrapAngle(plane.heading - target)) < 0.01, 'heading held');
  assert.ok(!plane.boosting, 'engine back to cruise');
});

test('holds steady across the ±180° wrap', () => {
  const plane = createPlane(0, 0, Math.PI - 0.01);
  fly(plane, createAids(plane), {}, 10);
  assert.ok(Math.abs(wrapAngle(plane.heading - (Math.PI - 0.01))) < 0.01);
});

test('a click or tap that takes the stick also opens the throttle, for as long as it is held', () => {
  const { plane, aids } = fly();
  tick(plane, aids, { takeControl: true, pressing: true });
  assert.equal(aids.mode, 'off');
  fly(plane, aids, { pressing: true }, 2);
  assert.ok(plane.boosting, 'full power while the press is held');
  fly(plane, aids, {}, 1 / 60);
  fly(plane, aids, {}, 0.5);
  assert.ok(!plane.boosting, 'released: back to cruise');

  tick(plane, aids, { toggleHold: true });
  tick(plane, aids, { takeControl: true, steer: -1 }); // a steer key: takes control, no power
  fly(plane, aids, { steer: -1 }, 1);
  assert.ok(aids.mode === 'off' && !plane.boosting && plane.bank < 0);
});
