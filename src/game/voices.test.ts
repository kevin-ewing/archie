import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONT } from '../core/pixels.ts';
import { createVoices, holdFor, SPEAKERS } from './voices.ts';

const run = (v: ReturnType<typeof createVoices>, seconds: number) => { const ev = []; for (let t = 0; t < seconds; t += 0.05) ev.push(...v.tick(0.05)); return ev; };

test('a line is typed out at its speaker’s pace, held long enough to read, then the next one follows', () => {
  const v = createVoices('flight');
  v.say({ speaker: 'observer', text: 'ALL CLEAR BEHIND.' });
  v.say({ speaker: 'observer', text: 'BATTERY AHEAD.' });
  v.tick(0);
  assert.equal(v.showing()?.line.text, 'ALL CLEAR BEHIND.');
  run(v, 0.3);
  const part = v.showing()!.shown;
  assert.ok(part > 0 && part < 17, 'partly typed');
  run(v, 17 / 26 + holdFor('ALL CLEAR BEHIND.') + 0.6);
  assert.equal(v.showing()?.line.text, 'BATTERY AHEAD.');
});

test('lines wait for their own scene: the squadron speaks at base, the observer in flight', () => {
  const v = createVoices('flight');
  v.say({ speaker: 'major', text: 'SEE ME WHEN YOU LAND.' });
  run(v, 3);
  assert.equal(v.showing(), null, 'the Major is not in the aeroplane');
  v.setScene('base');
  v.tick(0);
  assert.equal(v.showing()?.speaker.name, SPEAKERS.major.name);
  v.say({ speaker: 'observer', text: 'TURN BACK.' });
  run(v, 10);
  assert.notEqual(v.showing()?.line.speaker, 'observer', 'the observer waits for the next flight');
  v.setScene('flight');
  v.tick(0);
  assert.equal(v.showing()?.line.text, 'TURN BACK.');
});

test('priority goes first, an interruption cuts in, a delay waits', () => {
  const v = createVoices('base');
  v.say({ speaker: 'pilot', text: 'MORNING.' });
  v.say({ speaker: 'major', text: 'ALL OF YOU.', priority: 5 });
  v.tick(0);
  assert.equal(v.showing()?.line.speaker, 'major');
  v.say({ speaker: 'recording', text: 'TELEPHONE FOR YOU.', interrupt: true });
  v.tick(0.4);
  assert.equal(v.showing()?.line.speaker, 'recording');
  const w = createVoices('base');
  w.say({ speaker: 'rigger', text: 'READY.', delay: 1 });
  run(w, 0.5);
  assert.equal(w.showing()?.shown, 0, 'not started typing yet');
});

test('every speaker’s name is in the game’s lettering', () => {
  for (const s of Object.values(SPEAKERS)) for (const ch of s.name.replace(/ /g, '')) assert.ok(FONT[ch], `${s.name}: ${ch}`);
});
