// Heading-up camera. The world rotates so the plane points up the screen, lagging a little so turns
// read as "plane swings, then the world turns".
//
// The camera's position *follows* the plane with a critically damped lag. When the plane speeds up,
// the camera (and so the ground's scroll speed) can only speed up after it, never slow down, so the
// plane visibly pulls ahead up the screen, then the camera catches up and it settles back home.
// In a turn, the lag swings the plane out toward the turn.

import { wrapAngle, type Plane } from '../sim/flight.ts';

export const CAMERA = {
  lag: 0.6, // seconds for the camera's rotation to catch most of the way up to the heading
  forwardStiffness: 0.12, // follow spring along the camera heading (lower = plane pulls further ahead)
  lateralStiffness: 0.3, // follow spring sideways (lower = plane swings further out in turns)
  maxOffset: 80, // game px the plane can get from its home spot
};

export type Camera = { angle: number; x: number; y: number; vx: number; vy: number };

const planeVelocity = (p: Plane) => ({ x: Math.sin(p.heading) * p.speed, y: -Math.cos(p.heading) * p.speed });

export function createCamera(plane: Plane): Camera {
  const v = planeVelocity(plane);
  return { angle: plane.heading, x: plane.x, y: plane.y, vx: v.x, vy: v.y };
}

export function updateCamera(cam: Camera, plane: Plane, dt: number): void {
  const c = CAMERA;
  cam.angle = wrapAngle(cam.angle + wrapAngle(plane.heading - cam.angle) * (1 - Math.exp(-dt / c.lag)));

  // Move first, then correct: measuring the error after both plane and camera have moved this tick
  // means there's no one-frame lag at steady speed.
  cam.x += cam.vx * dt;
  cam.y += cam.vy * dt;

  // Position and velocity error, split into camera-forward and camera-right components.
  const fx = Math.sin(cam.angle);
  const fy = -Math.cos(cam.angle);
  const v = planeVelocity(plane);
  const ex = plane.x - cam.x;
  const ey = plane.y - cam.y;
  const evx = v.x - cam.vx;
  const evy = v.y - cam.vy;
  const kf = c.forwardStiffness;
  const kr = c.lateralStiffness;
  // Critically damped on each axis (damping = 2√k): no wobble, and no slowing of the ground's scroll.
  const af = kf * (ex * fx + ey * fy) + 2 * Math.sqrt(kf) * (evx * fx + evy * fy);
  const ar = kr * (ex * -fy + ey * fx) + 2 * Math.sqrt(kr) * (evx * -fy + evy * fx); // right = (−fy, fx)
  cam.vx += (af * fx - ar * fy) * dt;
  cam.vy += (af * fy + ar * fx) * dt;

  // Never let the plane get too far from home.
  const len = Math.hypot(plane.x - cam.x, plane.y - cam.y);
  if (len > c.maxOffset) {
    cam.x = plane.x - ((plane.x - cam.x) * c.maxOffset) / len;
    cam.y = plane.y - ((plane.y - cam.y) * c.maxOffset) / len;
  }
}

/** The plane's offset from its home spot, in screen space (game px; −y = up the screen). */
export function planeOffset(cam: Camera, plane: Plane): { x: number; y: number } {
  const ex = plane.x - cam.x;
  const ey = plane.y - cam.y;
  const cos = Math.cos(cam.angle);
  const sin = Math.sin(cam.angle);
  return { x: ex * cos + ey * sin, y: -ex * sin + ey * cos };
}

/**
 * A world offset moved (by under half a device pixel) so that, seen on the rotated screen, it is a whole number of
 * device pixels across and down. Every world layer's camera goes through this: in straight flight each frame is
 * then an exact pixel shift of the last. Otherwise the slightly rotated ground, moved a fraction of a pixel each
 * frame, is sampled afresh, and rows of pixels hop a pixel sideways as they scroll down the screen.
 */
export function onDevicePixels(scale: number, angle: number, x: number, y: number): { x: number; y: number } {
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  const u = Math.round((cs * x + sn * y) * scale) / scale; // across the screen
  const v = Math.round((cs * y - sn * x) * scale) / scale; // down the screen
  return { x: cs * u - sn * v, y: sn * u + cs * v };
}
