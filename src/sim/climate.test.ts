import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ANCHORS, checkAnchors, meanTempC, NORMALS, NORMALS_META, type Row } from './climate.ts';

test('daily mean curve is coldest in January and warmest in July', () => {
  const days = Array.from({ length: 365 }, (_, i) => i + 1);
  const temps = days.map(meanTempC);
  const cold = days[temps.indexOf(Math.min(...temps))];
  const warm = days[temps.indexOf(Math.max(...temps))];
  assert.ok(cold <= 31 || cold >= 355, `coldest day ${cold}`);
  assert.ok(warm >= 182 && warm <= 212, `warmest day ${warm}`);
});

test('daily curve hits the monthly means at mid-month and wraps smoothly', () => {
  assert.ok(Math.abs(meanTempC(197) - NORMALS.meanC[6]) < 0.1);
  assert.ok(Math.abs(meanTempC(1) - meanTempC(365)) < 0.2);
});

test('every normals row has a source and unit, and verify is set', () => {
  const rows: Row[] = ['meanC', 'rangeC', 'precipMm', 'wetDays', 'eraOffsetC'];
  for (const r of rows) {
    assert.ok(NORMALS_META[r].source.length > 0, `${r} source`);
    assert.ok(NORMALS_META[r].unit.length > 0, `${r} unit`);
    assert.equal(NORMALS_META[r].verify, true, `${r} verify`);
  }
});

test('checkAnchors accepts the shipped table', () => {
  assert.deepEqual(checkAnchors(ANCHORS), []);
});

test('checkAnchors rejects an anchor with no status, naming it', () => {
  const bad = { ...ANCHORS[0], id: 'no-status', status: undefined } as unknown as (typeof ANCHORS)[number];
  const out = checkAnchors([...ANCHORS, bad]);
  assert.equal(out.length, 1);
  assert.match(out[0], /no-status/);
});

test('seasonal sources use no Math.random, Date.now or new Date(', () => {
  const files = ['calendar.ts', 'sun.ts', 'climate.ts', 'seasons.ts', '../world/season.ts'];
  let checked = 0;
  for (const f of files) {
    const url = new URL(f, import.meta.url);
    if (!existsSync(url)) continue; // written by a later task
    checked++;
    assert.doesNotMatch(readFileSync(url, 'utf8'), /Math\.random|Date\.now|new Date\(/, f);
  }
  assert.ok(checked >= 3);
});
