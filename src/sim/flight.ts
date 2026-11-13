// Flight model: a slow, stable BE.2c. Input sets a bank target; bank sets the turn rate.
// Units: world pixels and seconds. Heading 0 = north (up), increasing clockwise.

export type Controls = { steer: number; boost: boolean }; // steer −1 (left) … 1 (right)

export type Plane = {
  x: number;
  y: number;
  heading: number; // radians
  bank: number; // −1 … 1
  speed: number; // world px / s
  heat: number; // engine heat 0 … 1
  fuel: number; // 0 … 1
  overheated: boolean; // full power locked out until the engine cools
  boosting: boolean;
};

export const FLIGHT = {
  cruise: 38,
  full: 62,
  accel: 10, // speed change, px/s²
  rollRate: 1.2, // bank units per second (gentle roll-in; fast rolls + fast world rotation felt queasy)
  maxTurn: 0.15, // rad/s at full bank (full circle ≈ 42 s)
  heatUp: 0.12, // per second at full power (≈ 8 s to overheat from cold)
  coolDown: 0.05, // per second at cruise
  recoverAt: 0.4, // full power returns once heat falls this far
  burnCruise: 1 / 720, // fuel per second (a full tank lasts a 12-minute day at cruise)
  burnFull: 2.5 / 720,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

export function createPlane(x = 0, y = 0, heading = 0): Plane {
  return { x, y, heading, bank: 0, speed: FLIGHT.cruise, heat: 0, fuel: 1, overheated: false, boosting: false };
}

export function updatePlane(p: Plane, c: Controls, dt: number): void {
  const f = FLIGHT;
  p.bank += clamp(clamp(c.steer, -1, 1) - p.bank, -f.rollRate * dt, f.rollRate * dt);
  const turn = p.bank * f.maxTurn;
  p.heading = wrapAngle(p.heading + turn * dt);

  // Engine: full power heats it; at max heat it's locked to cruise until it has cooled to recoverAt.
  p.boosting = c.boost && !p.overheated && p.fuel > 0;
  p.heat = clamp(p.heat + (p.boosting ? f.heatUp : -f.coolDown) * dt, 0, 1);
  if (p.heat >= 1) p.overheated = true;
  else if (p.overheated && p.heat <= f.recoverAt) p.overheated = false;
  // ponytail: an empty tank only disables full power for now; engine-out / glide comes with the day loop.
  p.fuel = Math.max(0, p.fuel - (p.boosting ? f.burnFull : f.burnCruise) * dt);

  const dv = clamp((p.boosting ? f.full : f.cruise) - p.speed, -f.accel * dt, f.accel * dt);
  p.speed += dv;

  p.x += Math.sin(p.heading) * p.speed * dt;
  p.y -= Math.cos(p.heading) * p.speed * dt;
}
