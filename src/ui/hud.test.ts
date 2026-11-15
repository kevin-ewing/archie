import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitView } from '../render/display.ts';
import { hudLayout, stepMascot } from './hud.ts';
import { controlsAnchor } from './toggles.ts';

test('the expanded board and its controls fit mobile portrait, landscape and desktop at native UI scale', () => {
  for (const [w, h, dpr, mobile] of [
    [320, 740, 3, 'ios'], [390, 844, 3, 'ios'], [844, 390, 3, 'ios'],
    [412, 915, 2.625, 'android'], [915, 412, 2.625, 'android'], [1440, 900, 2, null],
  ] as const) {
    const view = fitView(w, h, dpr, mobile);
    const board = hudLayout(view, [35, 31, 31, 27, 27, 27, 31, 27]);
    for (const [i, rect] of board.slots.entries()) {
      assert.ok(Number.isInteger(rect.x) && Number.isInteger(rect.y));
      assert.ok(rect.x >= 0 && rect.x + rect.w <= view.uiW, `${w}x${h}: dial ${i} fits horizontally`);
      assert.ok(rect.y >= 0 && rect.y + rect.h + 7 <= view.uiH, `${w}x${h}: dial ${i} fits vertically`);
      for (const other of board.slots.slice(i + 1)) {
        assert.ok(rect.x + rect.w <= other.x || other.x + other.w <= rect.x || rect.y + rect.h + 7 <= other.y || other.y + other.h + 7 <= rect.y, 'labels and dials never overlap');
      }
    }
    assert.ok(board.banks[0].x + board.banks[0].w + 8 <= board.banks[1].x, 'flight and engine banks stay separate');
    for (const slot of board.slots.slice(0, 4)) assert.ok(slot.x + slot.w <= view.uiW / 2, 'flight instruments stay left');
    for (const slot of board.slots.slice(4)) assert.ok(slot.x >= view.uiW / 2, 'engine instruments stay right');
    const controls = controlsAnchor(view, board.banks[0].y);
    const engine = controlsAnchor(view, board.banks[1].y, 'engine');
    for (const rect of [controls, engine, { ...engine, y: engine.y - engine.h - 2 }]) {
      assert.ok(rect.y >= 0 && rect.x >= 0 && rect.x + rect.w <= view.uiW, 'controls stay on screen');
      for (const slot of board.slots) assert.ok(rect.x + rect.w <= slot.x || slot.x + slot.w <= rect.x || rect.y + rect.h <= slot.y || slot.y + slot.h + 7 <= rect.y, 'controls clear the dials');
    }
    if (view.compact && view.uiW > view.uiH) assert.ok(controls.x > 64, 'landscape hold control clears the larger watch');
    if (w < h) assert.ok(board.rows > 1, 'portrait wraps rather than shrinking the instruments');
  }
});


test('the hanging mascot leans out of a turn and settles with a damped swing', () => {
  const s = { angle: 0, velocity: 0 };
  for (let i = 0; i < 120; i++) stepMascot(s, 1, 1 / 60);
  assert.ok(s.angle < -0.25 && s.angle > -0.55, 'right bank pushes the mascot left');
  let crossed = false;
  for (let i = 0; i < 600; i++) { stepMascot(s, 0, 1 / 60); if (s.angle > 0) crossed = true; }
  assert.ok(crossed, 'swings back through its resting point');
  assert.ok(Math.abs(s.angle) < 1e-5 && Math.abs(s.velocity) < 1e-5, 'damping brings it to rest');
});
