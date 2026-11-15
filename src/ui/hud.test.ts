import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitView } from '../render/display.ts';
import { gradeMatrix, hudLayout, radiumGlow, stepMascot } from './hud.ts';
import { controlsAnchor } from './toggles.ts';

test('one board, centred, with plaques under the dials and the controls around it, on phones and desktop', () => {
  // The card, then the eight instruments (compass and altimeter have no plaque).
  // Compass, altimeter, airspeed, petrol | RPM, temp, PSI, clinometer (only airspeed, petrol, RPM, temp are named).
  const items = [35, 31, 31, 27, 27, 27, 31, 27].map((s, i) => ({ w: s, h: s, plaque: [2, 3, 4, 5].includes(i) }));
  for (const [w, h, dpr, mobile] of [
    [320, 740, 3, 'ios'], [390, 844, 3, 'ios'], [844, 390, 3, 'ios'],
    [412, 915, 2.625, 'android'], [915, 412, 2.625, 'android'], [1440, 900, 2, null],
  ] as const) {
    const view = fitView(w, h, dpr, mobile);
    const board = hudLayout(view, items, 4);
    for (const [i, rect] of board.slots.entries()) {
      assert.ok(Number.isInteger(rect.x) && Number.isInteger(rect.y));
      assert.ok(rect.x >= 0 && rect.x + rect.w <= view.uiW, `${w}x${h}: item ${i} fits horizontally`);
      assert.ok(rect.y >= 0 && rect.y + rect.h + 8 <= view.uiH, `${w}x${h}: item ${i} fits vertically`);
      for (const other of board.slots.slice(i + 1)) {
        assert.ok(rect.x + rect.w <= other.x || other.x + other.w <= rect.x || rect.y + rect.h + 8 <= other.y || other.y + other.h + 8 <= rect.y, 'plaques and dials never overlap');
      }
    }
    // Dials in a row share one centre line (the card too).
    const rowCentres = new Set(board.slots.map((r) => r.y + Math.floor(r.h / 2)));
    assert.ok(rowCentres.size <= board.rows, `${w}x${h}: dials centred on ${board.rows} line(s), got ${[...rowCentres]}`);
    assert.ok(board.banks[0].x + board.banks[0].w + 8 <= board.banks[1].x, 'two clumps, apart');
    for (const [side, bank] of [['hold', board.banks[0]], ['engine', board.banks[1]]] as const) {
      const rect = controlsAnchor(bank, side);
      assert.ok(rect.y >= 0 && rect.x >= 0 && rect.x + rect.w <= view.uiW, `${w}x${h}: ${side} control on screen`);
      for (const slot of board.slots) assert.ok(rect.x + rect.w <= slot.x || slot.x + slot.w <= rect.x || rect.y + rect.h <= slot.y || slot.y + slot.h + 8 <= rect.y, `${w}x${h}: ${side} control clears the dials`);
    }
    if (w < h) assert.ok(board.rows > 1, 'portrait wraps rather than shrinking the instruments');
  }
});

test('the hanging mascot leans out of a turn and settles with a damped swing', () => {
  const s = { angle: 0, velocity: 0 };
  for (let i = 0; i < 120; i++) stepMascot(s, 1, 1 / 60);
  assert.ok(s.angle > 0.4 && s.angle < 0.9, 'right bank swings the mascot right');
  let crossed = false;
  for (let i = 0; i < 600; i++) { stepMascot(s, 0, 1 / 60); if (s.angle < 0) crossed = true; }
  assert.ok(crossed, 'swings back through its resting point');
  assert.ok(Math.abs(s.angle) < 1e-5 && Math.abs(s.velocity) < 1e-5, 'damping brings it to rest');
});

test('the HUD takes the world\'s own grade: identity by day, the sky\'s tint at dusk and night', () => {
  assert.equal(gradeMatrix(undefined), '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  const night = gradeMatrix({ near: [40, 50, 110], far: [40, 50, 110], tintAlpha: 0.8, glow: [0, 0, 0], glowAlpha: 0, active: true }).split(' ').map(Number);
  assert.ok(night[0] < 0.5 && night[12] > night[0], 'night: dark and blue');
  const dusk = gradeMatrix({ near: [255, 160, 90], far: [200, 120, 140], tintAlpha: 0.4, glow: [255, 180, 80], glowAlpha: 0.3, active: true }).split(' ').map(Number);
  assert.ok(dusk[0] + dusk[4] > dusk[12] + dusk[14], 'sunset: warm');
});

test('radium shows only from dusk: none by day, full in the dark', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  assert.equal(radiumGlow(deg(20)), 0);
  assert.ok(radiumGlow(deg(-3)) > 0 && radiumGlow(deg(-3)) < 1);
  assert.equal(radiumGlow(deg(-15)), 1);
});
