import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATIENT_AWE } from './music.ts';

test('patient awe preserves the supplied harmony as a valid looping 4/4 progression', () => {
  assert.equal(PATIENT_AWE.loop, true);
  assert.deepEqual(PATIENT_AWE.meter, [4, 4]);
  assert.equal(PATIENT_AWE.chords.length, 26);
  assert.equal(PATIENT_AWE.chords.reduce((beats, chord) => beats + chord.beats, 0), 59);
  assert.ok(PATIENT_AWE.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))), 'every authored voice belongs to its chord');
  assert.deepEqual(PATIENT_AWE.chords[0].midi, [46, 53, 62, 70, 72]);
  assert.ok(PATIENT_AWE.chords.every((chord) => chord.notes.every((note) => Number.isInteger(note) && note >= 0 && note < 12)));
  assert.deepEqual(
    PATIENT_AWE.chords.map((chord) => chord.symbol),
    ['Bbadd9', 'Fsus4', 'F', 'Gm7', 'Ebmaj9', 'Bb', 'Dm7', 'Ebadd9', 'Cm7', 'Gm9', 'F', 'Ebmaj7', 'F7sus4', 'Bbadd9', 'F', 'Gm7', 'Dm7', 'Ebmaj9', 'F', 'Gm9', 'D7#9', 'Ebmaj7', 'Ebm6', 'Cm9', 'F7sus4', 'Bb6/9'],
  );
  const first = PATIENT_AWE.chords[0];
  const last = PATIENT_AWE.chords.at(-1)!;
  assert.ok(last.notes.filter((note) => first.notes.includes(note)).length >= 4, 'the final Bb6/9 joins the opening Bbadd9 without a harmonic seam');
});
