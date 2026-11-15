import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignDate, createGame, restoreGame, worldFeatures, DEFAULT_WORLD } from './state.ts';

function airborne(game = createGame({ seed: 1915, startHour: 7 })) {
  game.transition('handoff');
  game.transition('playing');
  return game;
}

test('a new session owns its seed, level, calendar, start time and free-flight mission slot', () => {
  const g = createGame({ seed: 42, day: 3, startHour: 18.5, level: 2 });
  assert.equal(g.state.phase, 'loading');
  assert.equal(g.state.seed, 42);
  assert.equal(g.state.level, 2);
  assert.equal(g.state.mission, null);
  assert.deepEqual(g.state.clock, { day: 3, hours: 18.5 });
  assert.deepEqual(g.state.sortie, { number: 1, startedAt: { day: 3, hours: 18.5 }, elapsedSeconds: 0 });
  assert.equal(g.state.elapsedSeconds, 0);
  assert.throws(() => g.transition('playing'), /Cannot change/);
  assert.equal(g.state.phase, 'loading', 'an invalid transition changes nothing');
  for (const options of [{ seed: -1 }, { seed: 2 ** 31 }, { seed: 1, startHour: 24 }, { seed: 1, day: 0.5 }, { seed: 1, level: 0 }]) {
    assert.throws(() => createGame(options));
  }
});

test('only active flight advances; accelerated solar time is independent of active elapsed seconds', () => {
  const g = createGame({ seed: 1, startHour: 12 });
  g.advance(1);
  assert.equal(g.state.elapsedSeconds, 0);
  g.transition('handoff');
  g.advance(0.5, 0);
  assert.equal(g.state.elapsedSeconds, 0.5, 'flight starts during the reveal');
  assert.equal(g.state.clock.hours, 12, 'freezing solar time does not stop the flight');
  g.transition('playing');
  g.advance(0.5, 3);
  assert.equal(g.state.sortie.elapsedSeconds, 1);
  assert.ok(g.state.clock.hours > 12);
  assert.deepEqual(g.state.sortie.startedAt, { day: 0, hours: 12 }, 'start time is never a live clock alias');
  const before = g.snapshot();
  for (const [dt, speed] of [[NaN, 1], [Infinity, 1], [-1, 1], [2, 1], [1, -1], [1, Infinity], [1, 1001]]) assert.throws(() => g.advance(dt, speed));
  assert.deepEqual(g.snapshot(), before, 'invalid tick input does not damage the clock');
});

test('pause reasons compose: showing the tab cannot undo an explicit pause', () => {
  const g = airborne();
  g.advance(1);
  g.pause();
  g.pause('visibility');
  g.pause('visibility');
  assert.deepEqual(g.state.pauseReasons, ['user', 'visibility']);
  assert.equal(g.simulating, false);
  const before = g.snapshot();
  g.advance(1, 1000);
  assert.deepEqual(g.snapshot(), before);
  g.resume('visibility');
  assert.equal(g.state.phase, 'paused');
  g.resume();
  assert.equal(g.state.phase, 'playing');
  assert.deepEqual(g.state.pauseReasons, []);
  g.resume();
  assert.equal(g.state.phase, 'playing', 'resuming twice is harmless');
});

test('a reveal callback while hidden updates the resume target without restarting the flight', () => {
  const g = createGame({ seed: 1 });
  g.pause('visibility');
  g.transition('handoff');
  g.transition('playing');
  assert.equal(g.state.phase, 'paused');
  assert.equal(g.state.resumePhase, 'playing');
  g.advance(1);
  assert.equal(g.state.elapsedSeconds, 0);
  g.resume('visibility');
  assert.equal(g.state.phase, 'playing');
});

test('midnight changes the campaign day, leaving the current mission, level and sortie intact', () => {
  const g = airborne(createGame({ seed: 1, startHour: 23.99, level: 3 }));
  g.startMission('battery-observation');
  g.advance(1, 100);
  assert.ok(g.state.clock.day > 0);
  assert.equal(g.state.level, 3);
  assert.equal(g.state.sortie.number, 1);
  assert.equal(g.state.mission?.id, 'battery-observation');
  assert.equal(g.state.mission?.status, 'active');
  assert.deepEqual(g.state.sortie.startedAt, { day: 0, hours: 23.99 });
});

test('mission and sortie transitions cannot silently discard an active assignment', () => {
  const g = airborne();
  assert.throws(() => g.startMission(' '));
  g.startMission('first-shoot');
  assert.throws(() => g.startMission('second-shoot'), /Finish the active mission/);
  assert.throws(() => g.endSortie(), /Resolve the active mission/);
  assert.throws(() => g.beginSortie({ day: 1, startHour: 8, level: 2 }));
  g.advance(1);
  g.finishMission('completed');
  assert.equal(g.state.mission?.status, 'completed');
  assert.deepEqual(g.state.mission?.endedAt, g.state.clock);
  assert.throws(() => g.finishMission('failed'));
  g.startMission('second-shoot');
  assert.equal(g.state.missionHistory[0]?.id, 'first-shoot', 'a new assignment keeps the previous result');
  g.finishMission('failed');
  assert.deepEqual(g.state.missionHistory.map((m) => [m.id, m.status, m.level, m.sortie]), [['first-shoot', 'completed', 1, 1], ['second-shoot', 'failed', 1, 1]]);
  g.endSortie();
  const before = g.snapshot();
  g.advance(1);
  assert.deepEqual(g.snapshot(), before, 'debrief freezes the flight');
  assert.throws(() => g.beginSortie({ day: -1, startHour: 8, level: 2 }));
  assert.deepEqual(g.snapshot(), before, 'invalid next-sortie options preserve the previous result');
  g.beginSortie({ day: 2, startHour: 8, level: 2 });
  assert.equal(g.state.phase, 'loading');
  assert.equal(g.state.level, 2);
  assert.equal(g.state.mission, null);
  assert.deepEqual(g.state.sortie, { number: 2, startedAt: { day: 2, hours: 8 }, elapsedSeconds: 0 });
  assert.equal(g.state.elapsedSeconds, 1, 'total active time survives a new sortie');
  assert.equal(g.state.seed, 1915);
  assert.equal(g.state.missionHistory.length, 2, 'results survive the next day and level');
  assert.deepEqual(restoreGame(g.snapshot()).state.missionHistory, g.state.missionHistory, 'campaign results round-trip through a checkpoint');
});

test('time edits do not rewrite mission or sortie starts; calendar dates cross months and leap years', () => {
  const g = airborne();
  g.startMission('map-check');
  g.setTime(18, 5);
  assert.deepEqual(g.state.clock, { day: 5, hours: 18 });
  assert.deepEqual(g.state.mission?.startedAt, { day: 0, hours: 7 });
  assert.deepEqual(g.state.sortie.startedAt, { day: 0, hours: 7 });
  assert.throws(() => g.setTime(NaN));
  assert.equal(campaignDate(0), '1915-05-10');
  assert.equal(campaignDate(22), '1915-06-01');
  assert.equal(campaignDate(295), '1916-02-29');
});

test('versioned snapshots are detached and restore active flights with a user pause', () => {
  const g = airborne();
  g.startMission('saved-assignment');
  g.advance(1);
  g.pause('visibility');
  const json = JSON.parse(JSON.stringify(g.snapshot()));
  const restored = restoreGame(json);
  assert.equal(restored.state.version, 2);
  assert.equal(restored.state.phase, 'paused');
  assert.equal(restored.state.resumePhase, 'playing');
  assert.deepEqual(restored.state.pauseReasons, ['user'], 'old-tab visibility is not carried into the new tab');
  restored.resume('visibility');
  assert.equal(restored.state.phase, 'paused');
  restored.resume();
  assert.equal(restored.state.phase, 'playing');
  assert.deepEqual(restored.state.clock, g.state.clock);
  assert.deepEqual(restored.state.mission, g.state.mission);
  json.clock.day = 20;
  json.sortie.startedAt.hours = 0;
  json.mission.id = 'mutated';
  assert.equal(g.state.clock.day, 0);
  assert.equal(restored.state.clock.day, 0);
  assert.equal(restored.state.mission?.id, 'saved-assignment');
  for (const phase of ['loading', 'debrief'] as const) {
    const fresh = createGame({ seed: 1 });
    if (phase === 'debrief') airborne(fresh).endSortie();
    assert.equal(restoreGame(fresh.snapshot()).state.phase, phase);
  }
});

test('restore rejects unsupported, malformed and internally inconsistent checkpoints', () => {
  const snapshot = airborne().snapshot();
  const bad: unknown[] = [null, [], {}, { ...snapshot, version: 999 }, { ...snapshot, seed: -1 }, { ...snapshot, level: 0 },
    { ...snapshot, clock: { day: 0, hours: 24 } }, { ...snapshot, elapsedSeconds: -1 }, { ...snapshot, phase: 'unknown' },
    { ...snapshot, pauseReasons: ['visibility'] }, { ...snapshot, phase: 'paused', resumePhase: 'unknown', pauseReasons: ['user'] },
    { ...snapshot, phase: 'paused', resumePhase: 'playing', pauseReasons: ['user', 'user'] },
    { ...snapshot, sortie: { number: 1, startedAt: { day: 0, hours: 7 }, elapsedSeconds: 5 } },
    { ...snapshot, mission: { id: 'active', status: 'active', startedAt: { day: 0, hours: 7 }, endedAt: { day: 0, hours: 8 } } },
    { ...snapshot, missionHistory: [{ id: 'bad', status: 'active', startedAt: { day: 0, hours: 7 }, endedAt: null, level: 1, sortie: 1 }] },
    { ...snapshot, phase: 'debrief', mission: { id: 'active', status: 'active', startedAt: { day: 0, hours: 7 }, endedAt: null } },
  ];
  for (const value of bad) assert.throws(() => restoreGame(value));
});

test('free play owns independent world configuration and accepts a pinned or random seed', () => {
  const g = createGame({ seed: 0, world: { fronts: false, farms: false, density: 4, frontAtStart: true } });
  assert.equal(g.state.mode, 'free-play');
  assert.equal(g.state.seed, 0, 'zero is a valid pinned seed');
  assert.deepEqual(worldFeatures(g.state.world), { military: false, structures: false, frontLine: false, atStart: true, onlyTrenches: true, density: 4, trenchStyle: 'hasty' });
  g.setWorldFeatures({ fronts: true, frontLines: true });
  assert.equal(g.state.world.fronts, true);
  assert.equal(g.state.world.farms, false);
  assert.equal(g.state.world.density, 4);
  assert.deepEqual(createGame({ seed: 1 }).state.world, DEFAULT_WORLD, 'one session cannot change another session or the defaults');
  const random = createGame().state.seed;
  assert.ok(Number.isInteger(random) && random >= 0 && random < 2 ** 31);
  const before = g.snapshot();
  for (const patch of [{ farms: 'false' }, { density: 9 }]) assert.throws(() => g.setWorldFeatures(patch as never));
  assert.deepEqual(g.snapshot(), before);
  for (const world of [{ fronts: 'false' }, { density: 0 }, { density: Infinity }, { trenchStyle: 'unknown' }]) assert.throws(() => createGame({ world: world as never }));
  assert.throws(() => createGame({ mode: 'campaign' as never }), /Unsupported game mode/);
});

test('level setup carries objectives, seed and world settings without discarding campaign history', () => {
  const g = airborne(createGame({ seed: 7, levelId: 'spotting-intro', objectives: ['reach-lines', 'observe-battery'] }));
  g.completeObjective('reach-lines');
  g.completeObjective('reach-lines');
  assert.throws(() => g.completeObjective('unknown'));
  g.endSortie();
  const before = g.snapshot();
  assert.throws(() => g.beginSortie({ day: 1, startHour: 9, level: 2, seed: 99 }), /objectives/);
  assert.deepEqual(g.snapshot(), before, 'a blocked level change is atomic');
  g.beginSortie({ day: 1, startHour: 9, level: 1 });
  assert.equal(g.state.levelProgress.id, 'spotting-intro');
  assert.deepEqual(g.state.levelProgress.objectives.map((o) => o.completed), [true, false], 'another sortie at the same level keeps objective progress');
  airborne(g);
  g.completeObjective('observe-battery');
  g.startMission('intro-shoot');
  g.finishMission('completed');
  g.endSortie();
  g.beginSortie({ day: 2, startHour: 11, level: 2, levelId: 'first-photo', objectives: ['photograph-target'], seed: 99, world: { farms: false, fronts: true, density: 6 } });
  assert.equal(g.state.seed, 99);
  assert.equal(g.state.levelProgress.id, 'first-photo');
  assert.deepEqual(g.state.levelProgress.objectives, [{ id: 'photograph-target', completed: false }]);
  assert.equal(g.state.world.farms, false);
  assert.equal(g.state.world.density, 6);
  assert.equal(g.state.missionHistory[0]?.id, 'intro-shoot');
  const restored = restoreGame(JSON.parse(JSON.stringify(g.snapshot())));
  assert.deepEqual(restored.state.world, g.state.world);
  assert.deepEqual(restored.state.levelProgress, g.state.levelProgress);
  assert.equal(restored.state.seed, 99);
});

test('version 1 checkpoints migrate to free play; new checkpoints reject malformed mode/world/objective data', () => {
  const g = createGame({ seed: 1915 });
  const { mode: _mode, world: _world, levelProgress: _level, ...legacy } = g.snapshot();
  const migrated = restoreGame({ ...legacy, version: 1 });
  assert.equal(migrated.state.version, 2);
  assert.equal(migrated.state.mode, 'free-play');
  assert.deepEqual(migrated.state.world, DEFAULT_WORLD);
  assert.equal(migrated.state.seed, 1915);
  const s = g.snapshot();
  for (const bad of [{ ...s, mode: 'unknown' }, { ...s, world: { ...s.world, fronts: 'false' } }, { ...s, world: null },
    { ...s, levelProgress: { id: 'intro', objectives: [{ id: 'x', completed: false }, { id: 'x', completed: true }] } },
    { ...s, levelProgress: { id: 'intro', objectives: [{ id: 'x', completed: 'false' }] } }]) assert.throws(() => restoreGame(bad));
});
