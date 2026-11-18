import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { seasonAt } from '../sim/seasons.ts';
import type { CalDate } from '../sim/calendar.ts';
import { frontPoint, frontsNear } from './fronts.ts';
import { generateTile } from './generate.ts';
import { CHUNK, treeAt, WATER } from './ground.ts';
import { DEV } from './settings.ts';
import { structureAt, structuresNear, trackAt, tracksNear } from './structures.ts';

const SEED = 1915;
// The five sample dates of Requirement 18.2.
const DATES: CalDate[] = [
  { year: 1915, month: 5, day: 10 },
  { year: 1915, month: 7, day: 21 },
  { year: 1915, month: 10, day: 21 },
  { year: 1914, month: 12, day: 25 },
  { year: 1916, month: 1, day: 21 },
];
const [MAY, JULY, OCT, XMAS, JAN] = DATES;

const tile = (date: CalDate, cx: number, cy: number, seed = SEED) => generateTile({ kind: 'ground', seed, cx, cy, season: seasonAt(date, seed) });

// Placement reads the world settings that generateTile applies (fronts on); set them so the farm found here is the one in the tile.
DEV.fronts = true;
const farm = structuresNear(SEED, 0, 0, 6000, 6000).find((s) => s.kind === 'farm' && !s.ruined)!;
const FARM = [Math.floor(farm.x / CHUNK), Math.floor(farm.y / CHUNK)] as const;
const front = frontsNear(SEED, -60000, -60000, 60000, 60000)[0];
const fp = frontPoint(SEED, front, 0, 0);
const FRONT = [Math.floor(fp.x / CHUNK), Math.floor(fp.y / CHUNK)] as const;

// White, pale and blue-grey snow (and its shaded variants): light, and never redder than blue.
const snowToned = (r: number, g: number, b: number) => Math.min(r, g, b) >= 0x90 && b >= r && b - r <= 0x40;
const snowShare = (t: { rgba: Uint8ClampedArray }) => {
  let n = 0;
  for (let i = 0; i < t.rgba.length; i += 4) if (snowToned(t.rgba[i], t.rgba[i + 1], t.rgba[i + 2])) n++;
  return n / (CHUNK * CHUNK);
};

test('every pixel is opaque with channels 0-255 and a finite height, on every date', () => {
  // Feature: seasons-system, Property 21: Every pixel has a valid colour on every date
  // **Validates: Requirements 13.7, 18.2**
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100000 }),
      fc.constantFrom(...DATES),
      fc.constantFrom('farm', 'front', 'any'),
      fc.integer({ min: -40, max: 40 }),
      fc.integer({ min: -40, max: 40 }),
      (seed, date, where, cx, cy) => {
        DEV.fronts = true;
        const s = where === 'farm' ? structuresNear(seed, 0, 0, 6000, 6000)[0] : undefined;
        const [tx, ty] = s ? [Math.floor(s.x / CHUNK), Math.floor(s.y / CHUNK)] : where === 'front' && seed === SEED ? FRONT : [cx, cy];
        const t = tile(date, tx, ty, seed);
        assert.equal(t.rgba.length, CHUNK * CHUNK * 4);
        for (let i = 0; i < t.rgba.length; i += 4) {
          const a = t.rgba[i + 3];
          assert.ok(a === 255 && t.rgba[i] <= 255 && t.rgba[i + 1] <= 255 && t.rgba[i + 2] <= 255, `pixel ${i / 4}`);
        }
        assert.equal(t.heights!.length, CHUNK * CHUNK);
        assert.ok(t.heights!.every(Number.isFinite));
      },
    ),
    { numRuns: 25 },
  );
});

test('the five sample dates give valid farm and front tiles', () => {
  for (const d of DATES) {
    for (const [cx, cy] of [FARM, FRONT]) {
      const t = tile(d, cx, cy);
      for (let i = 3; i < t.rgba.length; i += 4) assert.equal(t.rgba[i], 255);
      assert.ok(t.heights!.every(Number.isFinite));
    }
  }
});

test('21 Jan 1916: a farm tile is snowy, roofs carry snow, tracks stay dark', () => {
  // Snow lies in patches, so the share varies tile to tile: the snowiest of the 3x3 tiles around the farm is
  // the "farm tile"; roofs and tracks are counted over all nine.
  const around = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [FARM[0] + dx, FARM[1] + dy] as const));
  const best = Math.max(...around.map((c) => snowShare(tile(JAN, ...c))));
  assert.ok(best > 0.2, `snow share ${best}`);
  let roof = 0, roofSnow = 0, track = 0, trackSnow = 0, all = 0, allSnow = 0;
  for (const [cx, cy] of around) {
    const t = tile(JAN, cx, cy);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const structures = structuresNear(SEED, x0, y0, x0 + CHUNK, y0 + CHUNK);
    const tracks = tracksNear(SEED, x0, y0, x0 + CHUNK, y0 + CHUNK);
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const k = (j * CHUNK + i) * 4;
        const sn = snowToned(t.rgba[k], t.rgba[k + 1], t.rgba[k + 2]);
        all++;
        if (sn) allSnow++;
        const s = structures.length ? structureAt(structures, x0 + i, y0 + j) : null;
        if (s && s[1] > 0) { roof++; if (sn) roofSnow++; }
        else if (!s && tracks.length && trackAt(tracks, x0 + i, y0 + j)) { track++; if (sn) trackSnow++; }
      }
    }
  }
  // Light snow (0.31 on this date) and a roof holds 0.25-0.9 of it, so only a few percent of roof pixels are white.
  assert.ok(roof > 0 && roofSnow / roof > 0.005, `roof snow ${roofSnow}/${roof}`);
  assert.ok(track > 0 && trackSnow / track < allSnow / all, `tracks ${trackSnow}/${track} stay darker than the ground (${allSnow}/${all})`);
  assert.ok(snowShare(tile(MAY, ...FARM)) < 0.02, 'no snow on 10 May');
});

test('July has golden crop pixels and no snow', () => {
  let golden = 0, snow = 0;
  for (const [cx, cy] of [FARM, [FARM[0] + 3, FARM[1]], [FARM[0], FARM[1] + 3]]) {
    const t = tile(JULY, cx, cy);
    for (let i = 0; i < t.rgba.length; i += 4) {
      const [r, g, b] = [t.rgba[i], t.rgba[i + 1], t.rgba[i + 2]];
      if (snowToned(r, g, b)) snow++;
      if (r > 0xa0 && g > 0x80 && b < 0x70 && r > b + 0x40 && g > b + 0x30) golden++;
    }
  }
  assert.ok(golden > 200, `golden ${golden}`);
  assert.ok(snow < 20, `snow ${snow}`);
});

test('21 Oct: tree crowns include yellow and russet tones', () => {
  let yellow = 0, russet = 0;
  for (const cx of [-60, -59]) {
    for (const cy of [-28, -27]) { // a wooded area (found by scanning `treeAt`)
      const t = tile(OCT, cx, cy);
      for (let j = 0; j < CHUNK; j++) {
        for (let i = 0; i < CHUNK; i++) {
          if (!treeAt(SEED, cx * CHUNK + i, cy * CHUNK + j)) continue;
          const k = (j * CHUNK + i) * 4;
          const [r, g, b] = [t.rgba[k], t.rgba[k + 1], t.rgba[k + 2]];
          if (r > 0x80 && g > 0x70 && b < 0x50 && Math.abs(r - g) < 0x20) yellow++;
          else if (r > 0x70 && r > g + 0x28 && g > b && b < 0x40) russet++;
        }
      }
    }
  }
  assert.ok(yellow > 0, `yellow ${yellow}`);
  assert.ok(russet > 0, `russet ${russet}`);
});

test('25 Dec 1914: front tile trench floors include pool water', () => {
  const pool = new Set(WATER.pool.map((c) => c.join()));
  let found = 0;
  for (let ds = -3; ds <= 3 && !found; ds++) {
    const p = frontPoint(SEED, front, ds * CHUNK * 2, 0);
    const t = tile(XMAS, Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK));
    for (let i = 0; i < t.rgba.length; i += 4) if (pool.has(`${t.rgba[i]},${t.rgba[i + 1]},${t.rgba[i + 2]}`)) found++;
  }
  assert.ok(found > 0, 'pool tones in front tiles');
});
