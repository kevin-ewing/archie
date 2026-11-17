import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave, DEFAULT_SETTINGS, readSave } from './save.ts';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

test('settings and story progress survive a reload; bad or missing data falls back to defaults', () => {
  const store = memory();
  const a = createSave(true, store);
  a.settings({ engine: 0.8 });
  a.story({ seed: 7, day: 2, hours: 9.5, level: 1, sortie: 3, plane: { x: 10, y: -4, heading: 1 } });
  a.log({ sortie: 1, date: '10 MAY 1915', minutes: 12 });
  const b = createSave(true, store);
  assert.deepEqual(b.data.log, [{ sortie: 1, date: '10 MAY 1915', minutes: 12 }]);
  assert.deepEqual(readSave(JSON.stringify({ log: [{ sortie: 'x' }] })).log, [], 'a malformed log entry is dropped');
  assert.equal(b.data.settings.engine, 0.8);
  assert.equal(b.data.settings.music, DEFAULT_SETTINGS.music);
  assert.deepEqual(b.data.story?.plane, { x: 10, y: -4, heading: 1 });
  assert.deepEqual(readSave('not json'), readSave(null));
  assert.equal(readSave(JSON.stringify({ settings: { engine: 9 } })).settings.engine, 1, 'clamped');
  assert.equal(readSave(JSON.stringify({ story: { seed: 'x' } })).story, null, 'a malformed story is dropped');
});

test('in development and debug nothing is read or written', () => {
  const store = memory();
  store.setItem('archie.save', JSON.stringify({ settings: { engine: 0.9 } }));
  const s = createSave(false, store);
  assert.equal(s.data.settings.engine, DEFAULT_SETTINGS.engine, 'ignores an existing save');
  s.settings({ music: 0.1 });
  assert.equal(JSON.parse(store.m.get('archie.save')!).settings.engine, 0.9, 'never overwrites it');
});
