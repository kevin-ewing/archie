// Flight aids: what the plane does when the pilot isn't flying it by hand. For now, one aid:
//
//   HOLD ("hands off"): the stable BE.2c left to fly itself. Wings level, engine at cruise, and it holds
//   the heading it rolls out on (so engaging mid-turn doesn't swing it back). The game starts in Hold.
//
// A small explicit state machine, separate from input handling, so the rules live in one tested place:
//   off ──toggle──▶ hold ──toggle / pilot takes control──▶ off
// Grabbing the controls with a click or touch on the view also opens the throttle, for as long as that
// press is held: the press that takes the stick is a press of full power.

import { FLIGHT, wrapAngle, type Controls, type Plane } from './flight.ts';

export const HOLD = {
  gain: 2, // bank per radian of heading error
  maxBank: 0.6, // never more than a gentle correction
};

export type AidMode = 'off' | 'hold';

/** What the pilot did this tick: raw stick and power, plus one-off actions. */
export type PilotInput = Controls & {
  toggleHold: boolean;
  /** The pilot grabbed the controls this tick (a steer / power key, a click or touch on the view). */
  takeControl: boolean;
  /** A mouse button or finger is down on the view. */
  pressing: boolean;
};

export type Aids = { mode: AidMode; heading: number; pressBoost: boolean };

/** Starts in the requested mode on the plane's heading. */
export const createAids = (plane: Plane, mode: AidMode = 'hold'): Aids => ({ mode, heading: rollOutHeading(plane), pressBoost: false });

/** The heading the plane will be on once its wings are level, if it starts rolling out now. */
function rollOutHeading(p: Plane): number {
  const rollOutTime = Math.abs(p.bank) / FLIGHT.rollRate;
  return wrapAngle(p.heading + (p.bank * FLIGHT.maxTurn * rollOutTime) / 2);
}

/** Apply the aids to this tick's pilot input; returns the controls the plane actually gets. */
export function applyAids(aids: Aids, plane: Plane, input: PilotInput): Controls {
  if (input.toggleHold) {
    aids.mode = aids.mode === 'hold' ? 'off' : 'hold';
    if (aids.mode === 'hold') aids.heading = rollOutHeading(plane);
  } else if (input.takeControl && aids.mode === 'hold') {
    aids.mode = 'off';
    aids.pressBoost = input.pressing; // a click / touch that takes the stick also opens the throttle
  }
  if (!input.pressing) aids.pressBoost = false; // ...until it's released

  if (aids.mode === 'hold') {
    const err = wrapAngle(aids.heading - plane.heading);
    return { steer: Math.max(-HOLD.maxBank, Math.min(HOLD.maxBank, err * HOLD.gain)), boost: false };
  }
  return { steer: input.steer, boost: input.boost || aids.pressBoost };
}
