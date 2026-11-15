import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlane, updatePlane } from '../sim/flight.ts';
import { createInstruments, engineWarning, updateInstruments, needleAngle, INSTRUMENTS } from './instruments.ts';

function fly(steer: number, boost: boolean, seconds: number, p = createPlane(), s = createInstruments(p)) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    updatePlane(p, { steer, boost }, 1 / 60);
    updateInstruments(s, p, 1 / 60);
  }
  return { p, s };
}

test('needles follow the engine: revs up at full power, temperature into the red, revs drop when overheated', () => {
  const r = INSTRUMENTS.rpm;
  const idle = fly(0, false, 3).s;
  assert.ok(Math.abs(idle.rpm * r.max - r.cruise) < 60, 'cruise revs');
  assert.ok(Math.abs(idle.temp - INSTRUMENTS.tempCruise) < 0.03, 'a warm engine reads mid-scale, not cold');
  const { p, s } = fly(0, true, 4);
  assert.ok(s.rpm * r.max > r.cruise + 300, 'revs rise with full power');
  assert.equal(engineWarning(p), 0);
  fly(0, true, 2.5, p, s);
  assert.equal(engineWarning(p), 1, 'warns before the lockout');
  fly(0, true, 3, p, s);
  assert.ok(p.overheated && engineWarning(p) === 2 && s.temp > INSTRUMENTS.tempRed, 'overheated: temperature in the red');
  fly(0, true, 2, p, s);
  assert.ok(Math.abs(s.rpm * r.max - r.hot) < 80, 'revs sag on a hot engine');
});

test('the liquid compass lags a turn, swings past the new heading, then settles on it', () => {
  const { p, s } = fly(1, false, 4);
  assert.ok(p.heading - s.compass > 0.02, 'card lags behind during the turn');
  let overshoot = 0;
  for (let t = 0; t < 4; t += 1 / 60) {
    fly(0, false, 1 / 60, p, s);
    overshoot = Math.max(overshoot, s.compass - p.heading);
  }
  assert.ok(overshoot > 0.005, `swings past (${overshoot})`);
  fly(0, false, 10, p, s);
  assert.ok(Math.abs(s.compass - p.heading) < 0.01, 'settles on the heading');
});

test('dial sweep runs 270° from bottom-left to bottom-right', () => {
  assert.ok(Math.abs(needleAngle(0) + 0.75 * Math.PI) < 1e-9 && Math.abs(needleAngle(1) - 0.75 * Math.PI) < 1e-9);
  assert.equal(needleAngle(0.5), 0);
});

test('new period instruments follow speed, bank and fuel, with the fixed flight height', () => {
  const p = createPlane();
  const s = createInstruments(p);
  assert.ok(Math.abs(s.airspeed * INSTRUMENTS.airspeedMax - p.speed * 0.4 * 2.23694) < 1e-9);
  assert.ok(Math.abs(s.altitude * INSTRUMENTS.altitudeMax - 91.86352) < 1e-5);
  assert.equal(s.pressure * INSTRUMENTS.pressureMax, 1.5);
  assert.equal(s.clinometer, 0.5);
  const height = s.altitude;
  fly(1, true, 4, p, s);
  assert.ok(s.airspeed > createInstruments(createPlane()).airspeed);
  assert.ok(s.clinometer > 0.9);
  assert.equal(s.altitude, height, 'turning and boosting do not invent a climb');
  p.fuel = 0;
  for (let n = 0; n < 180; n++) updateInstruments(s, p, 1 / 60);
  assert.ok(s.pressure < 0.001, 'supply pressure falls when the tank is empty');
});
