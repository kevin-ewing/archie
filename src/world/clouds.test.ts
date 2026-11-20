import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { cloudChunk, cloudLevel, cloudShadowChunk, coverThreshold } from './clouds.ts';
import { COVER_KEYS, NEUTRAL_COVER, NEUTRAL_KEY, coverOfKey } from '../sim/weather.ts';

// Golden hashes recorded from the UNMODIFIED clouds.ts, before the cover parameter was added (Req 5.2, 15.4).
// Every triple has partial cloud cover. Do not regenerate these to make a failing test pass.
const GOLDEN: [seed: number, cx: number, cy: number, cloud: string, shadow: string][] = [
  [1, -6, -6, 'b0d803854e01f8c78ab9668d5239034447ae6703d6292777b6802e0f6ed4d07b', '696100b00c93581db1a6af22f5bf0e93e38bb473cccdbc30e383c418546342c5'],
  [1, -5, -4, '0a22c4faf51239fb8825981538c89a14860a8b261b091a31626a5d0e5f9d4ea5', '00d47dece2d2aa11ecb63775965494ad08646d361953a2adb3f49b81359fa756'],
  [7, -6, -3, '9c927dab451880187353b22b2e0eeb625b81e3d5738dfbe8c40c9cb202488aa7', '57175406c15bf6aad1244f20f793cb9f4aedf868b2c7bd2978fc2502a9bdfb77'],
  [7, -6, 3, 'd39faf1d4b0c92ce6b51850c2c1d6d8aab3633a31e9ff43ae50b61d763b74624', '377d54e78ee235b0ea67a3ac0de0aaa0497474e39033d61739831df53f18ce77'],
  [42, -6, -3, '106ac7e5db13bbe055f8c7cfd489589528194ab6eddb7d1c8b75165f8b842b13', 'be6374a2e20a8791e478fa6bef346c86a6e69af36f3896e2c4b2d2c455f567ac'],
  [42, -6, 6, '45b57a671ccce766dc2f40257ea7970b614e40d752daa41ecfeae742ed1d2320', 'a2bd5e4904610426aeb9949230d1baf6d052779d0c5cd9d2d4f15551259707a2'],
  [1915, -5, 2, '0b2054c5aad3650c2411630341b53ce5a6b7d8de42d8ced4ee590014a1b1a9a2', 'fc8541cc9e148f48c01107960637721a2477f8ee5f5c360ae47f6ff69c4585d5'],
  [1915, -4, -5, 'f91fc819f0f02ac3eb90a2699444a67b3db30a37b4147b7ac214c64c52e22a25', 'c2b1d81fd6053fc9a55dc59a2d1cb22e77920714fe3e034d8675c37c94fbe1cf'],
  [20240, -6, -3, 'fa522e76d7712fcd9b347cf2ea388569ad51eb8de8501dc5338400f7e1dfac26', '228a8d24e32b5f9043ceebefd77977d89094fcaf59f15a601db1ffb68d305c95'],
  [20240, -5, -4, '9445852da5555cf061361112a51b81e1a0d92360bb8dbb984594ae96c70e37a3', '4cd3609ac843dfa62d7afe793a913f480f8dbeae099b7e36a5ed87ca3f1c7512'],
  [99, -6, 6, '69f75b7a56cf5eb0122869e73d43a3a4ea97431c48398a7f0387065d0dba2801', '0820cd71c5f582ce17bfad7b6424d1df008bb6d1a8e81e0f5e2b97b7323a2594'],
  [99, -5, -4, '2097391b15da4aecba8b11dee7220b6bbc4a3372208b3e20b24db8ff9540e5f4', 'd98264bd5c682b07096fbd9ad5048601429281454b5f0735bbde93eddff46d3a'],
];

const sha = (a: Uint8ClampedArray) => createHash('sha256').update(a).digest('hex');

test('cloud and cloud-shadow tiles match the golden hashes from before the cover change', () => {
  for (const [seed, cx, cy, cloud, shadow] of GOLDEN) {
    assert.equal(sha(cloudChunk(seed, cx, cy)), cloud, `cloudChunk(${seed}, ${cx}, ${cy})`);
    assert.equal(sha(cloudShadowChunk(seed, cx, cy)), shadow, `cloudShadowChunk(${seed}, ${cx}, ${cy})`);
  }
});

// ---------------------------------------------------------------- Properties 14 and 15

// Feature: weather-system, Property 14: The neutral bucket reproduces today's clouds
// Validates: Requirements 5.1, 5.2, 15.4
test('Property 14: default cover, NEUTRAL_COVER and coverOfKey(NEUTRAL_KEY) give byte-identical tiles', () => {
  const neutral = coverOfKey(NEUTRAL_KEY);
  assert.equal(neutral, NEUTRAL_COVER);
  for (const [seed, cx, cy, cloud, shadow] of GOLDEN) {
    for (const cover of [NEUTRAL_COVER, neutral]) {
      assert.equal(sha(cloudChunk(seed, cx, cy, cover)), cloud, `cloudChunk(${seed}, ${cx}, ${cy}, ${cover})`);
      assert.equal(sha(cloudShadowChunk(seed, cx, cy, cover)), shadow, `cloudShadowChunk(${seed}, ${cx}, ${cy}, ${cover})`);
    }
  }
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 }), (seed, cx, cy) => {
      assert.deepEqual(cloudChunk(seed, cx, cy), cloudChunk(seed, cx, cy, neutral));
      assert.deepEqual(cloudShadowChunk(seed, cx, cy), cloudShadowChunk(seed, cx, cy, neutral));
    }),
    { numRuns: 100 },
  );
});

// Feature: weather-system, Property 15: Cloud share rises with cover, and the extremes hold
// Validates: Requirements 5.3, 5.4, 5.5
test('Property 15: share is non-decreasing from key 0 to 7; keys 0-1 <= 25% of Neutral; keys 6-7 >= 85% (16 fixed seeds)', () => {
  const SEEDS = Array.from({ length: 16 }, (_, i) => 1 + i * 1237);
  for (const seed of SEEDS) {
    const share = Array.from({ length: COVER_KEYS }, () => 0);
    for (let k = 0; k < COVER_KEYS; k++) {
      const cover = coverOfKey(k);
      let n = 0;
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) if (cloudLevel(seed, i * 16, j * 16, cover) >= 0) n++;
      share[k] = n / 65536;
    }
    for (let k = 1; k < COVER_KEYS; k++) assert.ok(share[k] >= share[k - 1], `seed ${seed}: key ${k} share ${share[k]} < key ${k - 1} share ${share[k - 1]}`);
    for (const k of [0, 1]) assert.ok(share[k] <= 0.25 * share[NEUTRAL_KEY], `seed ${seed}: key ${k} share ${share[k]} vs neutral ${share[NEUTRAL_KEY]}`);
    for (const k of [6, 7]) assert.ok(share[k] >= 0.85, `seed ${seed}: key ${k} share ${share[k]}`);
  }
});

test('every threshold is below 1, the neutral threshold is 0.7, and the default cover is Neutral', () => {
  for (let i = 0; i <= 1000; i++) assert.ok(coverThreshold(i / 1000) < 1, `cover ${i / 1000}`);
  assert.equal(coverThreshold(NEUTRAL_COVER), 0.7);
  // Absent coverKey means Neutral: the generator's fallback coverOfKey(NEUTRAL_KEY) is the default cover.
  assert.equal(coverOfKey(NEUTRAL_KEY), NEUTRAL_COVER);
  assert.equal(cloudLevel(5, 100, 200), cloudLevel(5, 100, 200, NEUTRAL_COVER));
});
