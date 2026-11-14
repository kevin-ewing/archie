// Instrument readings: what each dial shows, as pure functions of the plane's state, plus the needle
// dynamics (needles lag and tremble with engine vibration; the liquid compass swings and settles).
// No drawing here; see gauges.ts and hud.ts. Grounded in a 1917 RFC cadet's list of dashboard
// instruments (rev indicator, petrol gauge, transmitting thermometer, compass, ...).

import { hash } from '../core/noise.ts';
import { wrapAngle, type Plane } from '../sim/flight.ts';

export const INSTRUMENTS = {
  needleLag: 0.35, // seconds for a needle to move most of the way to its reading
  tremble: 0.012, // engine-vibration jitter, as a fraction of full scale
  compassStiffness: 4, // liquid-damped compass card: underdamped, so it swings past and settles
  compassDamping: 2.2,
  rpm: { cruise: 1250, full: 1800, hot: 1100, max: 2000 }, // RAF 1a: ~90 hp at 1,600 rpm, about 100–105 hp at 1,800
  tempCruise: 0.45, // a warm engine sits mid-scale; heat pushes the needle on from there
  tempRed: 0.85, // temperature reading above this is the red zone
  warnHeat: 0.7, // engine heat at which the warnings start (before the overheat lockout at 1)
};

/** How loudly the engine is complaining: 0 fine, 1 running hot on full power, 2 overheated (locked to cruise). */
export type EngineWarning = 0 | 1 | 2;
export function engineWarning(p: Plane): EngineWarning {
  return p.overheated ? 2 : p.boosting && p.heat >= INSTRUMENTS.warnHeat ? 1 : 0;
}

/** Dial angle (radians clockwise from up) for a reading 0…1: a 270° sweep from bottom-left to bottom-right. */
export const needleAngle = (f: number) => -0.75 * Math.PI + Math.min(1, Math.max(0, f)) * 1.5 * Math.PI;

/** Target readings, 0…1 of each dial's scale (rpm also in revs). */
export function readings(p: Plane) {
  const r = INSTRUMENTS.rpm;
  // An overheated air-cooled engine loses revs; the lockout drops to `hot`.
  const rpm = p.overheated ? r.hot : p.boosting ? r.full : r.cruise;
  const temp = INSTRUMENTS.tempCruise + p.heat * (1 - INSTRUMENTS.tempCruise);
  return { rpm: rpm / r.max, temp, petrol: p.fuel };
}

/** Smoothed needle positions (0…1), plus `shake`: this tick's vibration offset to add when drawing. */
export type Instruments = {
  rpm: number;
  temp: number;
  petrol: number;
  compass: number;
  compassVel: number;
  shake: { rpm: number; temp: number; petrol: number };
  tick: number;
};

export function createInstruments(p: Plane): Instruments {
  return { ...readings(p), compass: p.heading, compassVel: 0, shake: { rpm: 0, temp: 0, petrol: 0 }, tick: 0 };
}

export function updateInstruments(s: Instruments, p: Plane, dt: number): void {
  const target = readings(p);
  const k = 1 - Math.exp(-dt / INSTRUMENTS.needleLag);
  s.tick++;
  // Needles tremble with the engine; a hot, rough-running engine makes them twitch hard.
  const rough = [1, 2.5, 6][engineWarning(p)];
  const tremble = (n: number) => (hash(0, s.tick, n) - 0.5) * 2 * INSTRUMENTS.tremble * rough;
  s.rpm += (target.rpm - s.rpm) * k;
  s.temp += (target.temp - s.temp) * k;
  s.petrol += (target.petrol - s.petrol) * k;
  s.shake = { rpm: tremble(1), temp: tremble(3) * 0.3, petrol: tremble(2) * 0.3 }; // petrol sloshes a little
  const c = INSTRUMENTS;
  s.compassVel += (c.compassStiffness * wrapAngle(p.heading - s.compass) - c.compassDamping * s.compassVel) * dt;
  s.compass = wrapAngle(s.compass + s.compassVel * dt);
}
