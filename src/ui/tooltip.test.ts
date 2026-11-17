import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeTip, tipPlate } from './tooltip.ts';

test('a tooltip is a plate with its title, and its body wrapped under it', () => {
  const short = tipPlate({ title: 'COMPASS' });
  const long = tipPlate({ title: 'COMPASS', body: 'YOUR HEADING. THE GOLD WEDGE IS THE TRENCH BEARING FROM THE MAP.' }, 100);
  assert.ok(long.h > short.h, 'the body adds lines');
  assert.ok(long.w <= 100 + 10, 'wrapped to the width');
});

test('a tooltip sits beside the pointer and turns back inside the window at its edges', () => {
  const view = { w: 800, h: 600 }, size = { w: 120, h: 40 };
  assert.deepEqual(placeTip({ x: 100, y: 100 }, size, view), { x: 114, y: 114 });
  const right = placeTip({ x: 790, y: 100 }, size, view);
  assert.ok(right.x + size.w <= 796 && right.x < 790, 'flips to the left');
  const bottom = placeTip({ x: 100, y: 595 }, size, view);
  assert.ok(bottom.y + size.h <= 596, 'flips above');
});
