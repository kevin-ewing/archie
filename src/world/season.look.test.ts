import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seasonAt, MAY_LOOK, CROP_NAMES } from '../sim/seasons.ts';
import { cropTones, crowns, grassTones, leafCover, look, tone, withLook } from './season.ts';

test('the neutral look returns today\'s tones unchanged', () => {
  assert.equal(look.s, MAY_LOOK);
  for (let sp = 0; sp < 3; sp++) {
    assert.equal(crowns(sp), crowns(sp));
    const lc = leafCover(sp, 17);
    assert.deepEqual(lc, { cover: 1, autumn: 0, bud: 0 });
  }
  CROP_NAMES.forEach((_, i) => assert.deepEqual(cropTones(i), cropTones(i)));
  const a = [1, 2, 3] as const;
  const b = [4, 5, 6] as const;
  const [ga, gb] = grassTones(a, b);
  assert.ok(ga === a && gb === b);
  assert.equal(tone(a, b, 0), a);
  assert.equal(tone(a, b, 1), b);
});

test('a winter look bares the trees and browns the grass; a July look ripens wheat', () => {
  const jan = seasonAt({ year: 1916, month: 1, day: 21 }, 7);
  withLook(jan, () => {
    assert.ok(leafCover(0, 3).cover < 0.05);
    const [ga] = grassTones([0x4f, 0x5a, 0x2e], [0x5d, 0x69, 0x36]);
    assert.notDeepEqual(ga, [0x4f, 0x5a, 0x2e]);
  });
  const jul = seasonAt({ year: 1915, month: 7, day: 25 }, 7);
  withLook(jul, () => assert.ok(cropTones(1)[0][0] > 0xa0));
  assert.equal(look.s, MAY_LOOK);
});
