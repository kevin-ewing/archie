import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrange, barnScene, drawing, SCENERY, SHOWN, sizes } from './barn-art.ts';
import { calendarDays, LOGBOOK_START, logbookArt } from './desk-items.ts';

const info = { day: 10, month: 'May', year: 1915, sortie: 1, date: '10 MAY 1915' };
// Screens in flight's game px: desktop, wide, small laptop, phones upright, phone sideways.
const SIZES = [[512, 384], [960, 540], [450, 280], [400, 300], [195, 422], [234, 506], [422, 195]];
const IDS = SHOWN.filter((id) => !SCENERY.includes(id)); // the buttons: what's on the desk now, less the scenery
const area = (s: { w: number; h: number }) => s.w * s.h;
const cover = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

test('the desk fills any screen, every usable thing is on it, on screen, and mostly in view', () => {
  for (const [W, H] of SIZES) {
    const { px, spots } = barnScene(W, H, info);
    assert.deepEqual([px.w, px.h], [W, H]);
    for (let i = 3; i < px.data.length; i += 4) assert.equal(px.data[i], 255, `${W}x${H}: no holes`);
    assert.deepEqual(new Set(spots.map((s) => s.id)), new Set(IDS), `${W}x${H}: everything is there`);
    for (const s of spots) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= W && s.y + s.h <= H, `${W}x${H}: ${s.id} on screen`);
    // Scattered, but each thing keeps at least a third of itself uncovered by the things above it.
    spots.forEach((s, i) => {
      const covered = spots.slice(i + 1).reduce((sum, t) => sum + cover(s, t), 0);
      assert.ok(covered <= area(s) * 0.67, `${W}x${H}: ${s.id} stays in view (${Math.round((covered / area(s)) * 100)}% covered)`);
    });
  }
  for (const [W, H] of SIZES) { // the calendar's today and the days either side: on screen and never covered
    const { usable, guard } = arrange(W, H, info, [], 4);
    assert.ok(guard.length >= 2, `${W}x${H}: today is on the calendar`);
    for (const g of guard) {
      assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= W && g.y + g.h <= H, `${W}x${H}: the days round today are on screen`);
      for (const u of usable) if (SHOWN.includes(u.id) && u.id !== 'calendar' && u.id !== 'chart' && u.id !== g.id) assert.equal(cover(g, u), 0, `${W}x${H}: ${u.id} leaves the ${g.id}'s kept parts clear`);
    }
  }
  assert.deepEqual(barnScene(512, 384, info).px.data, barnScene(512, 384, info).px.data, 'the same for everyone');
});

test('picking a thing up brings it to the top of its height on the desk, without moving anything', () => {
  const id = IDS[0];
  const before = barnScene(512, 384, info);
  const after = barnScene(512, 384, info, [id]);
  for (const s of before.spots) assert.deepEqual(after.spots.find((a) => a.id === s.id), s);
  const at = (sc: typeof after) => sc.drawn.findIndex((d) => d.id === id);
  assert.ok(at(after) >= at(before));
  assert.equal(arrange(512, 384, info).usable.length, SHOWN.length, 'only what is on the desk is placed: the hidden things leave no empty patch');
});

test('the log book takes its rank, number and wear from the story, and every drawing is made only once', () => {
  const start = logbookArt();
  assert.deepEqual(logbookArt(LOGBOOK_START).data, start.data);
  assert.notDeepEqual(logbookArt({ ...LOGBOOK_START, rank: 'LIEUT.', formerRank: '2ND LIEUT.' }).data, start.data, 'promoted');
  assert.notDeepEqual(logbookArt({ ...LOGBOOK_START, number: '204' }).data, start.data, 'a new book');
  const ink = (p: ReturnType<typeof logbookArt>) => p.data.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0);
  assert.ok(ink(logbookArt({ ...LOGBOOK_START, wear: 1 })) < ink(logbookArt({ ...LOGBOOK_START, wear: 0 })), 'worn darker with handling');
  let made = 0;
  const a = drawing('test:once', () => (made++, start));
  assert.equal(drawing('test:once', () => (made++, start)), a);
  assert.equal(made, 1);
});

test('on smaller screens the maps shrink a little then just crop; the usable things shrink in whole device pixels', () => {
  let last = { map: 1, usable: 1 };
  for (const [W, H] of [[960, 540], [720, 400], [512, 384], [400, 300], [300, 220], [195, 422]]) {
    for (const pixel of [2, 3, 4, 6]) {
      const z = sizes(W, H, pixel);
      assert.ok(z.map >= 0.85 && z.map <= 1, `${W}x${H}: the map shrinks only a little`);
      assert.ok(Number.isInteger(Math.round(z.usable * pixel * 1e9) / 1e9), `${W}x${H} @${pixel}: whole device pixels`);
      assert.ok(z.usable >= 0.5 - 1e-9 && z.usable <= 1);
    }
    const z = sizes(W, H, 4);
    if (W * H < 960 * 540) assert.ok(z.usable <= last.usable + 1e-9 || W < H, `${W}x${H}: never bigger on a smaller screen`);
    last = z;
  }
  assert.equal(sizes(960, 540, 4).usable, 1, 'full size on a big screen');
});
test('the calendar has the real dates: 1 May 1915 a Saturday, 29 February in 1916', () => {
  const [sat, sun] = calendarDays({ day: 1, month: 'May', year: 1915 }, true); // the 1st (no day before it on the page) and the 2nd
  assert.ok(sun.y > sat.y && sun.x < sat.x, 'the 1st ends the first week, the 2nd starts the next');
  assert.equal(calendarDays({ day: 29, month: 'February', year: 1916 }).length, 2, 'a leap year: the 28th and 29th, no 30th');
  assert.equal(calendarDays({ day: 28, month: 'February', year: 1915 }).length, 2, 'not a leap year: the 27th and 28th');
});

test('the clutter fills the desk, none of it a button but the sixpence, and it shrinks with the things you use', async () => {
  const { CLUTTER } = await import('./clutter.ts');
  for (const c of CLUTTER) {
    const a = c.art();
    assert.ok(a.data.some((v, i) => i % 4 === 3 && v > 0), `${c.name} is drawn`);
    assert.deepEqual(c.art().data, a.data, `${c.name} is the same every time`);
  }
  const big = barnScene(960, 540, info, [], [], 4), small = barnScene(300, 225, info, [], [], 4);
  const clutter = (sc: typeof big) => sc.drawn.filter((d) => d.id === null);
  assert.equal(clutter(big).length, CLUTTER.length, 'all of it is on the desk');
  assert.ok(clutter(small).every((d) => d.k < 1), 'smaller on a small screen, like the mug');
  assert.ok(big.spots.every((s) => s.id !== null), 'no clutter is a button');
  assert.ok(big.spots.some((s) => s.id === 'coin'), 'the sixpence is');
});
