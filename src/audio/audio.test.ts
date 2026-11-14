import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfireChance, backfireLevel, DEFAULT_ENGINE_VOLUME, DEFAULT_MUSIC_VOLUME, engineSound, faultDelay, MUSIC_GLIDE_SECONDS, STARTUP_FADE_SECONDS, volumeGain, type EngineAudio } from './audio.ts';

const state = (patch: Partial<EngineAudio> = {}): EngineAudio => ({ rpm: 1250, rough: 0, bank: 0, heat: 0, boosting: false, overheated: false, ...patch });

test('engine pitch and level rise with rpm while rough running adds mechanical noise', () => {
  const cruise = engineSound(state());
  const full = engineSound(state({ rpm: 1800, boosting: true }));
  const rough = engineSound(state({ rpm: 1100, rough: 1, overheated: true }));
  assert.ok(full.firingHz > cruise.firingHz && full.cutoffHz > cruise.cutoffHz && full.engineGain > cruise.engineGain);
  assert.ok(cruise.engineGain <= 0.12, 'the continuous engine leaves headroom for warning sounds');
  assert.ok(full.firingHz / cruise.firingHz < 1.15, 'full power gets only a modest pitch rise');
  assert.ok(cruise.cutoffHz > 1100 && cruise.cutoffHz < 1400 && cruise.noiseGain < 0.015, 'the voice keeps engine midrange without a harsh noise bed');
  assert.ok(rough.noiseGain > cruise.noiseGain);
});

test('turning loads the engine, and heat faults become frequent through overheat', () => {
  const level = engineSound(state());
  const halfTurn = engineSound(state({ bank: 0.5 }));
  const turning = engineSound(state({ bank: 1 }));
  assert.ok(turning.firingHz < halfTurn.firingHz && halfTurn.firingHz < level.firingHz, 'pitch sags progressively as the turn loads the engine');
  assert.ok(turning.firingHz < level.firingHz * 0.95, 'a hard turn produces an audible RPM sag');
  assert.ok(turning.bodyGain > level.bodyGain && turning.noiseGain > level.noiseGain);
  assert.equal(faultDelay(0.64, false, 0), Infinity);
  assert.ok(faultDelay(0.99, false, 0.5) < faultDelay(0.66, false, 0.5));
  assert.ok(faultDelay(0.65, false, 1) <= 1.2, 'the warning produces several faults before overheat');
  assert.ok(faultDelay(0.4, true, 0) >= 1.2, 'faults become sparse while overheat lockout cools');
  assert.ok(backfireChance(0.99, false) > backfireChance(0.66, false));
  assert.ok(backfireChance(0.4, true) < backfireChance(0.99, false), 'backfires become less common after overheat');
  assert.ok(backfireLevel(0.99, false) > backfireLevel(0.4, true) * 2, 'pre-overheat backfires are much louder');
});

test('master volume is clamped and follows a perceptual curve', () => {
  assert.equal(volumeGain(-1), 0);
  assert.equal(volumeGain(0.5), 0.25);
  assert.equal(volumeGain(2), 1);
  assert.equal(DEFAULT_ENGINE_VOLUME, DEFAULT_MUSIC_VOLUME, 'engine and music start at the same level');
});

test('music uses a fixed short glide for every authored voice', () => {
  assert.equal(MUSIC_GLIDE_SECONDS, 0.28, 'every interval uses the same short glide time');
  assert.equal(STARTUP_FADE_SECONDS, 1.8, 'the whole mix fades through the loading handoff');
});

