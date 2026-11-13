import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from './controls.ts';

const pointer = new EventTarget();
const keys = new EventTarget();
const controls = createControls(pointer, keys, () => 1000);

function fire(type: string, { timeStamp, ...props }: { pointerType: string; clientX: number; timeStamp: number }) {
  const e = Object.assign(new Event(type), { pointerId: 1, button: 0, ...props });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  pointer.dispatchEvent(e);
}

test('mouse: position from centre steers, button held = full power', () => {
  fire('pointermove', { pointerType: 'mouse', clientX: 800, timeStamp: 0 });
  assert.ok(controls.read().steer > 0.9, 'far right = hard right');
  fire('pointermove', { pointerType: 'mouse', clientX: 520, timeStamp: 0 });
  assert.equal(controls.read().steer, 0, 'a dead band at centre flies straight');
  fire('pointermove', { pointerType: 'mouse', clientX: 535, timeStamp: 0 });
  assert.ok(controls.read().steer > 0 && controls.read().steer < 0.1, 'just past it, a gentle turn (no jump)');
  fire('pointermove', { pointerType: 'mouse', clientX: 505, timeStamp: 0 });
  fire('pointerdown', { pointerType: 'mouse', clientX: 505, timeStamp: 0 });
  assert.equal(controls.read().boost, true);
  fire('pointerup', { pointerType: 'mouse', clientX: 505, timeStamp: 0 });
  assert.equal(controls.read().boost, false);
});

test('touch: drag steers from where the finger landed; double-tap and hold = full power', () => {
  fire('pointerdown', { pointerType: 'touch', clientX: 300, timeStamp: 1000 });
  fire('pointermove', { pointerType: 'touch', clientX: 200, timeStamp: 1100 });
  assert.ok(controls.read().steer < -0.3, 'dragged left');
  assert.equal(controls.read().boost, false, 'single touch is not full power');
  fire('pointerup', { pointerType: 'touch', clientX: 200, timeStamp: 1500 });
  assert.equal(controls.read().steer, 0, 'lift straightens');

  fire('pointerdown', { pointerType: 'touch', clientX: 300, timeStamp: 2000 });
  fire('pointerup', { pointerType: 'touch', clientX: 302, timeStamp: 2100 }); // tap
  fire('pointerdown', { pointerType: 'touch', clientX: 305, timeStamp: 2300 }); // second tap, held
  assert.equal(controls.read().boost, true, 'double-tap-hold');
  fire('pointermove', { pointerType: 'touch', clientX: 450, timeStamp: 2500 });
  assert.ok(controls.read().steer > 0.3 && controls.read().boost, 'can steer while holding full power');
  fire('pointerup', { pointerType: 'touch', clientX: 450, timeStamp: 2600 });
  assert.equal(controls.read().boost, false);
});

test('reports one-off actions once: T toggles Hold, a click or a key grabs the controls', () => {
  const p = new EventTarget();
  const k = new EventTarget();
  const c = createControls(p, k, () => 1000);
  const send = (target: EventTarget, type: string, props: object) => target.dispatchEvent(Object.assign(new Event(type), props));

  send(k, 'keydown', { code: 'KeyT' });
  assert.equal(c.read().toggleHold, true);
  assert.equal(c.read().toggleHold, false, 'cleared after it is read');
  send(p, 'pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 500 });
  const click = c.read();
  assert.ok(click.takeControl && click.pressing, 'a click grabs the controls and is a press');
  send(p, 'pointerup', { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 500 });
  send(k, 'keydown', { code: 'KeyA' });
  const key = c.read();
  assert.ok(key.takeControl && !key.pressing, 'a key grabs the controls, no press');
  c.requestToggleHold();
  assert.equal(c.read().toggleHold, true, 'the HUD button asks the same way');
});

test('losing focus lets go of everything: no steering, no boost, no press', () => {
  const p = new EventTarget();
  const k = new EventTarget();
  const c = createControls(p, k, () => 1000);
  const send = (target: EventTarget, type: string, props: object = {}) => target.dispatchEvent(Object.assign(new Event(type), props));

  send(p, 'pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 900 });
  send(p, 'pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 900 });
  send(k, 'keydown', { code: 'KeyD' });
  const held = c.read();
  assert.ok(held.steer > 0 && held.boost && held.pressing);
  send(k, 'blur');
  const after = c.read();
  assert.ok(after.steer === 0 && !after.boost && !after.pressing, 'plane levels off when the page is not active');
});

test('the edge of the screen turns equally sharply on a phone and a wide laptop', () => {
  const send = (target: EventTarget, type: string, { timeStamp, ...props }: { timeStamp?: number; [k: string]: unknown }) => {
    const e = Object.assign(new Event(type), props);
    if (timeStamp !== undefined) Object.defineProperty(e, 'timeStamp', { value: timeStamp });
    target.dispatchEvent(e);
  };
  for (const width of [390, 1440, 2560]) {
    const p = new EventTarget();
    const c = createControls(p, new EventTarget(), () => width);
    send(p, 'pointermove', { pointerType: 'mouse', pointerId: 1, clientX: width, button: 0 });
    assert.equal(c.read().steer, 1, `mouse at the right edge is hard right (${width} px wide)`);
    send(p, 'pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 0, button: 0 });
    assert.equal(c.read().steer, -1, `mouse at the left edge is hard left (${width} px wide)`);
    // A finger landing at the centre and dragging to the edge reaches full bank too.
    const t = new EventTarget();
    const ct = createControls(t, new EventTarget(), () => width);
    send(t, 'pointerdown', { pointerType: 'touch', pointerId: 2, clientX: width / 2, button: 0, timeStamp: 10 });
    send(t, 'pointermove', { pointerType: 'touch', pointerId: 2, clientX: width, button: 0, timeStamp: 20 });
    assert.equal(ct.read().steer, 1, `touch dragged to the edge is hard right (${width} px wide)`);
  }
});
