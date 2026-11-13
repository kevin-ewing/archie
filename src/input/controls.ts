// Mouse, touch and keyboard → the same two controls: steer (−1 … 1) and boost (full power).
//  Mouse:    horizontal position relative to the screen centre steers; hold the button for full power.
//  Touch:    drag sideways from where the finger landed; lift to straighten. Double-tap and hold = full power.
//  Keyboard: A/D or ←/→ steer; Space, W or ↑ for full power.
//  T (or the HUD button) toggles the Hold flight aid.
// This module only reports what the pilot did; what Hold does with it lives in sim/aids.ts.

import type { PilotInput } from '../sim/aids.ts';

export const INPUT = {
  mouseRange: 0.3, // fraction of screen width from centre for full bank
  touchRange: 0.25, // fraction of screen width of drag for full bank
  mouseDeadzone: 0.075, // centre band (fraction of the steering range) where the plane flies straight
  touchDeadzone: 0.06,
  tapMs: 250, // a touch shorter than this, that barely moved, is a tap
  doubleTapMs: 320, // second touch within this long after a tap = double-tap
  tapSlopPx: 30,
};

const STEER_LEFT = ['KeyA', 'ArrowLeft'];
const STEER_RIGHT = ['KeyD', 'ArrowRight'];
const BOOST_KEYS = ['Space', 'KeyW', 'ArrowUp'];
const HOLD_KEY = 'KeyT';

/** Map −1…1 to steer, with a dead band in the middle that eases in (no jump at its edge). */
function steerFrom(v: number, deadzone: number): number {
  const a = Math.min(1, Math.abs(v));
  return a < deadzone ? 0 : (Math.sign(v) * (a - deadzone)) / (1 - deadzone);
}

type PointerLike = Event & { pointerType: string; pointerId: number; clientX: number; button: number };

export type ControlsHandle = {
  /** This tick's input. One-off actions (toggle, take control) are reported once, then cleared. */
  read: () => PilotInput;
  /** Ask to toggle Hold (e.g. from the HUD button). */
  requestToggleHold: () => void;
};

export function createControls(pointerTarget: EventTarget, keyTarget: EventTarget, width: () => number): ControlsHandle {
  let steer = 0;
  let boost = false;
  let touchId: number | null = null;
  let touchX0 = 0;
  let touchAt = 0;
  let lastTapAt = -Infinity;
  let lastTapX = 0;
  const keys = new Set<string>();
  let toggleHold = false;
  let takeControl = false;
  let mouseDown = false;
  const grab = () => (takeControl = true);

  const on = (type: string, fn: (e: PointerLike) => void) => pointerTarget.addEventListener(type, fn as EventListener);

  on('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      grab();
      mouseDown = true;
      boost = true;
      return;
    }
    grab(); // touching the view takes the stick
    if (touchId !== null) return; // one steering finger at a time
    touchId = e.pointerId;
    touchX0 = e.clientX;
    touchAt = e.timeStamp;
    boost = e.timeStamp - lastTapAt < INPUT.doubleTapMs && Math.abs(e.clientX - lastTapX) < INPUT.tapSlopPx;
    (pointerTarget as Element).setPointerCapture?.(e.pointerId); // keep steering if the finger leaves the canvas
  });

  on('pointermove', (e) => {
    if (e.pointerType === 'mouse') steer = steerFrom((e.clientX - width() / 2) / (width() * INPUT.mouseRange), INPUT.mouseDeadzone);
    else if (e.pointerId === touchId) steer = steerFrom((e.clientX - touchX0) / (width() * INPUT.touchRange), INPUT.touchDeadzone);
  });

  const release = (e: PointerLike) => {
    if (e.pointerType === 'mouse') {
      boost = false;
      mouseDown = false;
      return;
    }
    if (e.pointerId !== touchId) return;
    const wasTap = e.timeStamp - touchAt < INPUT.tapMs && Math.abs(e.clientX - touchX0) < INPUT.tapSlopPx;
    lastTapAt = wasTap && !boost ? e.timeStamp : -Infinity; // the second tap of a double-tap doesn't start another
    lastTapX = e.clientX;
    touchId = null;
    steer = 0;
    boost = false;
  };
  on('pointerup', release);
  on('pointercancel', release);

  keyTarget.addEventListener('keydown', (e) => {
    const code = (e as KeyboardEvent).code;
    if (code === HOLD_KEY && !(e as KeyboardEvent).repeat) toggleHold = true;
    if ([...STEER_LEFT, ...STEER_RIGHT, ...BOOST_KEYS].includes(code)) {
      e.preventDefault(); // no page scroll
      grab();
    }
    keys.add(code);
  });
  keyTarget.addEventListener('keyup', (e) => keys.delete((e as KeyboardEvent).code));
  keyTarget.addEventListener('blur', () => {
    keys.clear();
    boost = false;
    mouseDown = false;
  });

  return {
    requestToggleHold: () => (toggleHold = true),
    read() {
      const keySteer = (STEER_RIGHT.some((k) => keys.has(k)) ? 1 : 0) - (STEER_LEFT.some((k) => keys.has(k)) ? 1 : 0);
      const input: PilotInput = {
        steer: keySteer || steer,
        boost: boost || BOOST_KEYS.some((k) => keys.has(k)),
        toggleHold,
        takeControl,
        pressing: mouseDown || touchId !== null,
      };
      toggleHold = false;
      takeControl = false;
      return input;
    },
  };
}
