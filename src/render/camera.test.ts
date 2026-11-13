import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlane, updatePlane } from '../sim/flight.ts';
import { createCamera, updateCamera, planeOffset, CAMERA } from './camera.ts';

function rig() {
  const plane = createPlane();
  const cam = createCamera(plane);
  const step = (steer: number, boost: boolean, seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      updatePlane(plane, { steer, boost }, 1 / 60);
      updateCamera(cam, plane, 1 / 60);
      each?.();
    }
  };
  return { plane, cam, step };
}

test('opening the throttle: the ground never scrolls slower, the plane pulls ahead up the screen', () => {
  const { plane, cam, step } = rig();
  step(0, false, 2);
  let last = Math.hypot(cam.vx, cam.vy);
  step(0, true, 4, () => {
    const speed = Math.hypot(cam.vx, cam.vy);
    assert.ok(speed >= last - 1e-9, 'camera (ground scroll) speed only ever rises while accelerating');
    last = speed;
  });
  assert.ok(planeOffset(cam, plane).y < -5, 'plane has moved up the screen');
});

test('turns swing the plane out and the camera lags the heading; everything settles home', () => {
  const { plane, cam, step } = rig();
  step(1, true, 3);
  const swing = plane.heading - cam.angle;
  assert.ok(swing > 0.05 && swing < 0.5, `plane visibly swings ahead of the camera (${swing})`);
  const o = planeOffset(cam, plane);
  assert.ok(o.x > 2 && Math.hypot(o.x, o.y) <= CAMERA.maxOffset + 1e-9, 'swung out toward the turn');

  step(0, false, 25);
  assert.ok(Math.abs(plane.heading - cam.angle) < 0.01, 'camera caught up');
  const home = planeOffset(cam, plane);
  assert.ok(Math.hypot(home.x, home.y) < 0.5, 'plane back home');
});
