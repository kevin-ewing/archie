import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_GRIT, ETHEREAL_FATIGUE, FORMAL_BEGINNING, MONUMENTAL_AFTERMATH, OMINOUS_VIGIL, PATIENT_AWE, PENSIVE_LONGING, progressionFor, QUIRKY_PATIENCE, RESOLUTE_DUTY, SMALL_VICTORY, UPRIGHT_CHALLENGE, WEARY_STILLNESS, WISTFUL_UNCERTAINTY } from './music.ts';

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

test('resolute duty preserves the reference timing, voicings, and loop', () => {
  assert.equal(RESOLUTE_DUTY.bpm, 62);
  assert.equal(RESOLUTE_DUTY.loop, true);
  assert.equal(RESOLUTE_DUTY.chords.length, 21);
  assert.equal(RESOLUTE_DUTY.chords.reduce((beats, chord) => beats + chord.beats, 0), 64);
  assert.deepEqual(RESOLUTE_DUTY.chords.map(({ beats }) => beats), [4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 8]);
  assert.ok(RESOLUTE_DUTY.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))));
  assert.deepEqual(RESOLUTE_DUTY.chords.at(-1)!.midi, RESOLUTE_DUTY.chords[0].midi);
});

test('ominous vigil preserves its accelerating reference and seamless return', () => {
  assert.equal(OMINOUS_VIGIL.bpm, 132);
  assert.equal(OMINOUS_VIGIL.loop, true);
  assert.equal(OMINOUS_VIGIL.chords.length, 36);
  assert.equal(OMINOUS_VIGIL.chords.reduce((beats, chord) => beats + chord.beats, 0), 126);
  assert.deepEqual(OMINOUS_VIGIL.chords.map(({ beats }) => beats), [4, 4, 4, 4, 4, 4, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 4, 4, 4, 2, 2, 4, 2, 2, 4, 2, 4]);
  assert.ok(OMINOUS_VIGIL.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))));
  assert.deepEqual(OMINOUS_VIGIL.chords.at(-1)!.midi, OMINOUS_VIGIL.chords[0].midi);
});

test('development chooses among the music library while production stays on patient awe', () => {
  assert.equal(progressionFor(false, 0.99), PATIENT_AWE);
  assert.equal(progressionFor(true, 0), PATIENT_AWE);
  assert.equal(progressionFor(true, 0.08), RESOLUTE_DUTY);
  assert.equal(progressionFor(true, 0.16), OMINOUS_VIGIL);
  assert.equal(progressionFor(true, 0.24), WEARY_STILLNESS);
  assert.equal(progressionFor(true, 0.31), UPRIGHT_CHALLENGE);
  assert.equal(progressionFor(true, 0.39), PENSIVE_LONGING);
  assert.equal(progressionFor(true, 0.47), ETHEREAL_FATIGUE);
  assert.equal(progressionFor(true, 0.55), QUIRKY_PATIENCE);
  assert.equal(progressionFor(true, 0.63), BATTLE_GRIT);
  assert.equal(progressionFor(true, 0.7), MONUMENTAL_AFTERMATH);
  assert.equal(progressionFor(true, 0.78), WISTFUL_UNCERTAINTY);
  assert.equal(progressionFor(true, 0.86), FORMAL_BEGINNING);
  assert.equal(progressionFor(true, 0.99), SMALL_VICTORY);
});

test('weary stillness preserves the major-minor contractions and soft loop seam', () => {
  assert.equal(WEARY_STILLNESS.bpm, 120);
  assert.equal(WEARY_STILLNESS.loop, true);
  assert.equal(WEARY_STILLNESS.chords.length, 43);
  assert.equal(WEARY_STILLNESS.chords.reduce((beats, chord) => beats + chord.beats, 0), 124);
  assert.ok(WEARY_STILLNESS.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))));
  const first = WEARY_STILLNESS.chords[0];
  const last = WEARY_STILLNESS.chords.at(-1)!;
  assert.equal(last.midi.filter((midi) => first.midi.includes(midi)).length, 4);
});

test('tracks four through six preserve their source structures and intended playback tempos', () => {
  assert.deepEqual(
    [UPRIGHT_CHALLENGE, PENSIVE_LONGING, ETHEREAL_FATIGUE].map((progression) => [progression.bpm, progression.chords.length, progression.chords.reduce((beats, chord) => beats + chord.beats, 0)]),
    [[120, 54, 124], [105, 39, 124], [60, 29, 60]],
  );
  for (const progression of [UPRIGHT_CHALLENGE, PENSIVE_LONGING, ETHEREAL_FATIGUE]) {
    assert.equal(progression.loop, true);
    assert.ok(progression.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))));
  }
  assert.deepEqual(UPRIGHT_CHALLENGE.chords.at(-1)!.midi, UPRIGHT_CHALLENGE.chords[0].midi);
  assert.equal(PENSIVE_LONGING.chords.at(-1)!.midi.filter((midi) => PENSIVE_LONGING.chords[0].midi.includes(midi)).length, 4);
});

test('tracks seven through eleven preserve their slow blocks and functional turnarounds', () => {
  const tracks = [QUIRKY_PATIENCE, BATTLE_GRIT, MONUMENTAL_AFTERMATH, WISTFUL_UNCERTAINTY, FORMAL_BEGINNING];
  assert.deepEqual(
    tracks.map((progression) => [progression.bpm, progression.chords.length, progression.chords.reduce((beats, chord) => beats + chord.beats, 0)]),
    [[60, 15, 60], [60, 15, 60], [60, 16, 60], [60, 15, 60], [80, 23, 76]],
  );
  for (const progression of tracks) {
    assert.equal(progression.loop, true);
    assert.ok(progression.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))));
  }
  assert.deepEqual(WISTFUL_UNCERTAINTY.chords.at(-1)!.midi, WISTFUL_UNCERTAINTY.chords[0].midi);
});

test('small victory keeps its modest success arc and prepared dominant return', () => {
  assert.deepEqual([SMALL_VICTORY.bpm, SMALL_VICTORY.chords.length, SMALL_VICTORY.chords.reduce((beats, chord) => beats + chord.beats, 0)], [60, 19, 64]);
  assert.ok(SMALL_VICTORY.chords.every((chord) => chord.midi.length === 5 && chord.midi.every((midi) => chord.notes.includes(midi % 12))));
  assert.equal(SMALL_VICTORY.chords.at(-1)!.symbol, 'Dmadd9');
});

test('identical chord data is stored once across the soundtrack library', () => {
  const firstG = RESOLUTE_DUTY.chords[0];
  const repeatedG = RESOLUTE_DUTY.chords[5];
  assert.equal(firstG.notes, repeatedG.notes);
  assert.equal(firstG.midi, repeatedG.midi);
  assert.equal(PATIENT_AWE.chords[2].midi, PATIENT_AWE.chords[10].midi);
});
