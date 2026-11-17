import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrange, barnScene, BEARS, CLUTTER_SHOWN, drawing, meet, quadArea, quadOf, SCENERY, SHOWN, sizes, Z } from './barn-art.ts';
import { calendarDays, LOGBOOK_START, logbookArt } from './desk-items.ts';

const info = { day: 10, month: 'May', year: 1915, sortie: 1, date: '10 MAY 1915' };
// Screens in flight's game px: desktop, wide, small laptop, phones upright, phone sideways.
const SIZES = [[512, 384], [960, 540], [450, 280], [400, 300], [195, 422], [234, 506], [422, 195]];
const IDS = SHOWN.filter((id) => !SCENERY.includes(id)); // the buttons: what's on the desk now, less the scenery
// Every overlap is between things' own boxes (each turned as it lies), as the layout measures them.
const EPS = 1; // px²: less than a pixel (corners touching, from rounding where things lie)

test('the desk fills any screen, every usable thing is on it, on screen, and mostly in view', () => {
  for (const [W, H] of SIZES) {
    const { px, spots } = barnScene(W, H, info);
    assert.deepEqual([px.w, px.h], [W, H]);
    for (let i = 3; i < px.data.length; i += 4) assert.equal(px.data[i], 255, `${W}x${H}: no holes`);
    assert.deepEqual(new Set(spots.map((s) => s.id)), new Set(IDS), `${W}x${H}: everything is there`);
    for (const s of spots) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= W && s.y + s.h <= H, `${W}x${H}: ${s.id} on screen`);
    // Scattered, but each thing keeps at least a third of itself uncovered by the things above it.
    spots.forEach((s, i) => {
      const own = quadOf(s.box), covered = spots.slice(i + 1).reduce((sum, t) => sum + meet(own, quadOf(t.box)), 0);
      assert.ok(covered <= quadArea(own) * 0.67, `${W}x${H}: ${s.id} stays in view (${Math.round((covered / quadArea(own)) * 100)}% covered)`);
    });
  }
  for (const [W, H] of SIZES) { // what things keep clear (the calendar's today and the days either side, the goggles' lenses): on screen, and nothing lies over them
    const { usable, guard } = arrange(W, H, info, [], 4);
    assert.ok(guard.length >= 2, `${W}x${H}: today is on the calendar`);
    for (const g of guard) {
      assert.ok(g.quad.every(([x, y]) => x >= -0.5 && y >= -0.5 && x <= W + 0.5 && y <= H + 0.5), `${W}x${H}: the ${g.id}'s kept parts are on screen`);
      for (const u of usable) if (SHOWN.includes(u.id) && Z[u.id] > Z[g.id] && u.id !== g.id) assert.ok(meet(g.quad, u.quad) < EPS, `${W}x${H}: ${u.id} leaves the ${g.id}'s kept parts clear (${meet(g.quad, u.quad).toFixed(1)} px² covered)`);
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
  const clutter = (sc: typeof big) => sc.drawn.filter((d) => d.id === null && !d.stain);
  assert.equal(clutter(big).length, CLUTTER.filter((c) => CLUTTER_SHOWN.includes(c.name)).length, 'what is brought back is on the desk, and only that');
  assert.ok(clutter(small).every((d) => d.k < 1), 'smaller on a small screen, like the mug');
  assert.ok(big.spots.every((s) => s.id !== null), 'no clutter is a button');
  assert.equal(big.spots.some((s) => s.id === 'coin'), SHOWN.includes('coin'), 'the sixpence is a button once it is brought back');
});

test('nothing lies on what would not bear it (the coffee, the watch, the goggles, the orders, the spanner)', () => {
  for (const [W, H] of SIZES) {
    const { usable, loose } = arrange(W, H, info, [], 4);
    const all = [
      ...usable.filter((u) => SHOWN.includes(u.id)).map((u) => ({ name: u.id as string, z: Z[u.id], bears: BEARS[u.id], quad: u.quad })),
      ...loose.map((l) => ({ name: l.t.name ?? 'clutter', z: l.t.z ?? 0.9, bears: l.t.bears, quad: l.quad })),
    ];
    for (const lo of all) for (const hi of all) {
      if (hi === lo || hi.z <= lo.z || lo.bears) continue;
      const on = meet(hi.quad, lo.quad);
      assert.ok(on < EPS, `${W}x${H}: the ${hi.name} lies on the ${lo.name} (${on.toFixed(1)} px²)`);
    }
  }
});

test("the barn's loading phrases are all in the game's lettering, and fit a phone", async () => {
  const { FONT, textWidth } = await import('../core/pixels.ts');
  const { BARN_LOADING } = await import('./barn-art.ts');
  assert.ok(BARN_LOADING.length >= 12);
  for (const s of BARN_LOADING) {
    for (const ch of s.replace(/ /g, '')) assert.ok(FONT[ch], `"${s}": ${ch} is in the font`);
    assert.ok(textWidth(s) <= 150, `"${s}" fits a phone`);
  }
});
