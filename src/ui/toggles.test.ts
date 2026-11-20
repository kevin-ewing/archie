import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToggles, setToggle } from './toggles.ts';

test('production preset locks the other switches and restores their exact previous values', () => {
  const tg = createToggles([
    { id: 'fastPlane', text: '', on: true },
    { id: 'fastTime', text: '', on: false },
    { id: 'unlimitedBoost', text: '', on: true },
    { id: 'structures', text: '', on: false },
    { id: 'military', text: '', on: false },
    { id: 'frontLines', text: '', on: true },
    { id: 'production', text: '', on: false },
  ]);
  const values = () => tg.items.map((t) => t.on);
  const before = values();
  assert.ok(setToggle(tg, 'production', true));
  assert.deepEqual(values(), [false, false, false, true, true, false, true]);
  for (const item of tg.items.slice(0, -1)) {
    assert.ok(item.disabled);
    assert.equal(setToggle(tg, item.id, !item.on), false);
  }
  assert.ok(setToggle(tg, 'production', true), 'repeated enable must not overwrite the saved state');
  assert.ok(setToggle(tg, 'production', false));
  assert.deepEqual(values(), before);
  assert.ok(tg.items.every((t) => !t.disabled));
  assert.ok(setToggle(tg, 'fastTime', true));
  setToggle(tg, 'production', true);
  setToggle(tg, 'production', false);
  assert.equal(tg.items[1].on, true, 'later cycles restore newly edited settings');
});
