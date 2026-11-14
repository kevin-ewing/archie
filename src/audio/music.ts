// Music is stored independently from playback and voicing. Notes are pitch classes (C = 0 … B = 11),
// with the chord root first; the future player can choose octaves and smooth inversions for each mood.

export type Chord = { symbol: string; notes: readonly number[]; midi: readonly number[]; beats: number };
export type Progression = {
  id: string;
  bpm: number;
  mood: readonly string[];
  use: string;
  meter: readonly [number, number];
  loop: boolean;
  chords: readonly Chord[];
};

const noteSets = new Map<string, readonly number[]>();
const midiVoicings = new Map<string, readonly number[]>();
const intern = (pool: Map<string, readonly number[]>, values: readonly number[]) => {
  const key = values.join(',');
  const stored = pool.get(key);
  if (stored) return stored;
  pool.set(key, values);
  return values;
};
const chord = (symbol: string, notes: readonly number[], midi: readonly number[], beats = 2): Chord => ({
  symbol,
  notes: intern(noteSets, notes),
  midi: intern(midiVoicings, midi),
  beats,
});
const arranged = (voicings: Record<string, readonly [readonly number[], readonly number[]]>, sequence: readonly (string | readonly [string, number])[]): Chord[] =>
  sequence.map((entry) => {
    const [symbol, beats] = typeof entry === 'string' ? [entry, 2] : entry;
    const [notes, midi] = voicings[symbol];
    return chord(symbol.split('@', 1)[0], notes, midi, beats);
  });

const PATIENT_VOICINGS = {
  Bbadd9: [[10, 2, 5, 0], [46, 53, 62, 70, 72]], Fsus4: [[5, 10, 0], [41, 53, 60, 70, 72]], F: [[5, 9, 0], [41, 53, 60, 69, 72]],
  Gm7: [[7, 10, 2, 5], [43, 53, 62, 67, 70]], Ebmaj9: [[3, 7, 10, 2, 5], [39, 53, 62, 67, 70]], Bb: [[10, 2, 5], [34, 53, 62, 65, 70]],
  Dm7: [[2, 5, 9, 0], [38, 53, 60, 62, 69]], Ebadd9: [[3, 7, 10, 5], [39, 53, 63, 67, 70]], Cm7: [[0, 3, 7, 10], [36, 60, 63, 67, 70]],
  Gm9: [[7, 10, 2, 5, 9], [43, 53, 62, 69, 70]], Ebmaj7: [[3, 7, 10, 2], [39, 55, 58, 62, 67]], F7sus4: [[5, 10, 0, 3], [41, 58, 60, 63, 72]],
  'Gm9@2': [[7, 10, 2, 5, 9], [43, 53, 58, 62, 69]], 'D7#9': [[2, 6, 9, 0, 5], [38, 53, 60, 66, 69]], Ebm6: [[3, 6, 10, 0], [39, 58, 60, 63, 66]],
  Cm9: [[0, 3, 7, 10, 2], [36, 51, 62, 67, 70]], 'Bb6/9': [[10, 2, 5, 7, 0], [46, 53, 62, 67, 72]],
} as const;

export const PATIENT_AWE: Progression = {
  id: 'patient-awe',
  bpm: 40,
  mood: ['patient', 'awed', 'melancholy', 'pensive'],
  use: 'Quiet reflection and wonder, with room for melancholy.',
  meter: [4, 4],
  loop: true,
  chords: arranged(PATIENT_VOICINGS, [['Bbadd9', 4], 'Fsus4', 'F', ['Gm7', 4], ['Ebmaj9', 4], 'Bb', 'Dm7', 'Ebadd9', 'Cm7', 'Gm9', 'F', 'Ebmaj7', 'F7sus4', 'Bbadd9', 'F', 'Gm7', 'Dm7', 'Ebmaj9', 'F', 'Gm9@2', 'D7#9', 'Ebmaj7', 'Ebm6', 'Cm9', 'F7sus4', ['Bb6/9', 3]]),
};

const RESOLUTE_VOICINGS = {
  G: [[7, 11, 2], [43, 55, 62, 67, 71]], Gmaj7: [[7, 11, 2, 6], [43, 55, 62, 66, 71]], G7: [[7, 11, 2, 5], [43, 55, 62, 65, 71]],
  C: [[0, 4, 7], [48, 55, 60, 64, 72]], Cm: [[0, 3, 7], [48, 55, 60, 63, 72]], Em7: [[4, 7, 11, 2], [40, 55, 59, 64, 74]],
  A7: [[9, 1, 4, 7], [45, 57, 64, 67, 73]], Am7: [[9, 0, 4, 7], [45, 57, 64, 67, 72]], D7: [[2, 6, 9, 0], [50, 57, 62, 66, 72]],
  Cm6: [[0, 3, 7, 9], [48, 55, 63, 69, 72]],
} as const;

export const RESOLUTE_DUTY: Progression = {
  id: 'resolute-duty',
  bpm: 62,
  mood: ['resolute', 'determined', 'ready', 'neutral'],
  use: 'Mission beginnings, briefing completion, or calm transitions into uncertain responsibility; purposeful without sounding heroic or ominous.',
  meter: [4, 4],
  loop: true,
  chords: arranged(RESOLUTE_VOICINGS, [['G', 4], ['Gmaj7', 4], ['G7', 4], ['C', 4], ['Cm', 4], ['G', 4], ['Em7', 4], ['A7', 4], 'Am7', 'D7', 'G', 'Gmaj7', 'G7', 'C', 'Cm6', 'G', 'Em7', 'A7', 'Am7', 'D7', ['G', 8]]),
};

const OMINOUS_VOICINGS = {
  Em: [[4, 7, 11], [40, 52, 55, 64, 71]], B7: [[11, 3, 6, 9], [35, 54, 57, 63, 71]], Am: [[9, 0, 4], [45, 52, 57, 64, 72]],
  Em9: [[4, 7, 11, 2, 6], [40, 55, 62, 66, 71]], 'B7(b9)': [[11, 3, 6, 9, 0], [35, 57, 63, 66, 72]], Am9: [[9, 0, 4, 7, 11], [45, 55, 60, 64, 71]],
  C7: [[0, 4, 7, 10], [36, 55, 64, 70, 72]], Am6: [[9, 0, 4, 6], [45, 54, 64, 69, 72]], 'D#dim7': [[3, 6, 9, 0], [39, 54, 63, 69, 72]],
} as const;

export const OMINOUS_VIGIL: Progression = {
  id: 'ominous-vigil',
  bpm: 132,
  mood: ['ominous', 'suspenseful', 'angry', 'prepared'],
  use: 'Approaching danger, hostile uncertainty, or a tense watch before contact; prepared for the unexpected, with anger held under control.',
  meter: [4, 4],
  loop: true,
  chords: arranged(OMINOUS_VOICINGS, [['Em', 4], ['B7', 4], ['Em', 4], ['Am', 4], ['Em', 4], ['B7', 4], 'Em', 'B7', ['Em', 4], ['Am', 4], ['Em', 4], ['B7', 4], ['Em', 4], ['Am', 4], ['Em', 4], ['B7', 4], ['Em', 4], ['Em9', 4], ['B7(b9)', 4], ['Em9', 4], ['Am9', 4], ['Em9', 4], ['B7(b9)', 4], 'Em9', 'B7(b9)', ['Em9', 4], ['Am9', 4], ['Em9', 4], 'C7', 'B7', ['Em9', 4], 'Am6', 'D#dim7', ['Em', 4], 'B7(b9)', ['Em', 4]]),
};

const WEARY_VOICINGS = {
  C: [[0, 4, 7], [48, 60, 67, 72, 76]], G: [[7, 11, 2], [43, 59, 62, 67, 74]], Am: [[9, 0, 4], [45, 57, 60, 69, 76]], F: [[5, 9, 0], [41, 60, 69, 72, 77]],
  Cmaj7: [[0, 4, 7, 11], [36, 60, 67, 71, 76]], Gsus4: [[7, 0, 2], [43, 60, 62, 67, 74]], Am7: [[9, 0, 4, 7], [45, 57, 60, 67, 76]],
  Fmaj7: [[5, 9, 0, 4], [41, 57, 60, 65, 76]], Cm: [[0, 3, 7], [36, 55, 60, 67, 75]], Gm: [[7, 10, 2], [43, 55, 58, 67, 74]],
  Ab: [[8, 0, 3], [44, 56, 60, 68, 75]], Fm: [[5, 8, 0], [41, 60, 65, 68, 77]], Cm9: [[0, 3, 7, 10, 2], [36, 58, 62, 67, 75]],
  Gm7: [[7, 10, 2, 5], [43, 58, 62, 67, 77]], Abmaj7: [[8, 0, 3, 7], [44, 56, 60, 67, 75]], Fm6: [[5, 8, 0, 2], [41, 56, 60, 65, 74]],
  G7sus4: [[7, 0, 2, 5], [43, 60, 62, 65, 74]], Cadd9: [[0, 4, 7, 2], [48, 60, 67, 74, 76]],
} as const;

export const WEARY_STILLNESS: Progression = {
  id: 'weary-stillness',
  bpm: 120,
  mood: ['peaceful', 'tired', 'uncanny', 'spooky'],
  use: 'Late flights, empty landscapes, aftermath, or apparent safety that still feels faintly wrong; calm shaped by exhaustion rather than comfort.',
  meter: [4, 4],
  loop: true,
  chords: arranged(WEARY_VOICINGS, [['C', 4], ['G', 4], ['Am', 4], ['F', 4], ['Cmaj7', 4], 'Gsus4', 'G', ['Am7', 4], ['Fmaj7', 4], ['Cm', 4], ['Gm', 4], ['Ab', 4], ['Fm', 4], ['Cm9', 4], ['Gm7', 4], ['Abmaj7', 4], ['Fm6', 4], 'C', 'Cm', 'G', 'Gm', 'Am', 'Ab', 'F', 'Fm', 'C', 'Cm', 'G', 'Gm', 'Am', 'Ab', 'F', 'Fm', ['Cm9', 4], ['Abmaj7', 4], ['Fm6', 4], 'Gsus4', 'G', 'Am7', 'Fmaj7', 'Fm6', 'G7sus4', ['Cadd9', 4]]),
};

const UPRIGHT_VOICINGS = {
  C: [[0, 4, 7], [48, 60, 64, 67, 72]], Ab: [[8, 0, 3], [44, 56, 60, 63, 68]], Bb: [[10, 2, 5], [46, 58, 62, 65, 70]],
  F: [[5, 9, 0], [41, 53, 57, 60, 65]], F7: [[5, 9, 0, 3], [41, 57, 60, 63, 65]], Am: [[9, 0, 4], [45, 57, 64, 69, 72]],
  D7: [[2, 6, 9, 0], [50, 57, 62, 66, 72]], G: [[7, 11, 2], [43, 55, 62, 67, 71]], Em: [[4, 7, 11], [40, 52, 55, 64, 71]],
  Dm: [[2, 5, 9], [50, 57, 62, 65, 69]], G7: [[7, 11, 2, 5], [43, 55, 62, 65, 71]], Cm: [[0, 3, 7], [48, 55, 60, 63, 67]],
  Bdim7: [[11, 2, 5, 8], [47, 53, 56, 62, 71]], Fm: [[5, 8, 0], [41, 53, 56, 60, 65]], 'F#dim7': [[6, 9, 0, 3], [42, 54, 60, 63, 69]],
  G7sus4: [[7, 0, 2, 5], [43, 55, 60, 62, 65]], Db: [[1, 5, 8], [49, 56, 61, 65, 68]], 'G7(b9)': [[7, 11, 2, 5, 8], [43, 53, 62, 65, 68]],
  A7: [[9, 1, 4, 7], [45, 57, 64, 67, 73]],
} as const;

export const UPRIGHT_CHALLENGE: Progression = {
  id: 'upright-challenge', bpm: 120, mood: ['ready', 'cheerful', 'prepared', 'upright'],
  use: 'A new challenge met with alert confidence: disciplined preparation, forward motion, and good spirits without triumphalism.', meter: [4, 4], loop: true,
  chords: arranged(UPRIGHT_VOICINGS, [
    ['C', 4], 'Ab', 'Bb', ['C', 4], 'Ab', 'Bb', ['C', 4], 'Bb', 'F', 'C', 'F7', 'Am', 'D7', 'F', 'G', 'Em', 'Am', 'Dm', 'G7', ['C', 4],
    ['Cm', 4], ['Bdim7', 4], 'Cm', 'Ab', 'Fm', 'Bdim7', 'Cm', 'F#dim7', 'G7sus4', 'G7', 'Cm', 'Db', 'Cm', 'Db', 'Ab', 'G', 'Cm', 'Bdim7', 'Ab', 'F#dim7', 'G7sus4', 'G7(b9)',
    ['C', 4], 'F', 'G', 'C', 'A7', 'Dm', 'G7', 'F', 'Fm', 'Ab', 'Bb', ['C', 4],
  ]),
};

const LONGING_VOICINGS = {
  Am: [[9, 0, 4], [45, 57, 60, 64, 69]], F: [[5, 9, 0], [41, 53, 57, 60, 65]], Esus4: [[4, 9, 11], [40, 59, 64, 69, 71]],
  E: [[4, 8, 11], [40, 56, 59, 64, 71]], Dm: [[2, 5, 9], [50, 57, 62, 65, 69]], E7sus4: [[4, 9, 11, 2], [40, 59, 64, 69, 74]],
  E7: [[4, 8, 11, 2], [40, 59, 64, 68, 74]], C: [[0, 4, 7], [48, 60, 67, 72, 76]], G7sus4: [[7, 0, 2, 5], [43, 60, 62, 65, 67]],
  G7: [[7, 11, 2, 5], [43, 59, 62, 65, 67]], A7sus4: [[9, 2, 4, 7], [45, 57, 62, 64, 67]], A7: [[9, 1, 4, 7], [45, 57, 61, 64, 67]],
  Bb: [[10, 2, 5], [46, 58, 62, 65, 70]], 'Bm7(b5)': [[11, 2, 5, 9], [47, 59, 62, 65, 69]], Dm6: [[2, 5, 9, 11], [50, 59, 62, 65, 69]],
  A: [[9, 1, 4], [45, 57, 61, 64, 69]],
} as const;

export const PENSIVE_LONGING: Progression = {
  id: 'pensive-longing', bpm: 105, mood: ['longing', 'pensive', 'tender', 'unresolved'],
  use: 'Separation, memory, unanswered signals, or looking toward something distant; deliberately slowed from the 120 BPM source.', meter: [4, 4], loop: true,
  chords: arranged(LONGING_VOICINGS, [
    ['Am', 4], ['F', 4], 'Esus4', 'E', ['Am', 4], ['Dm', 4], ['E', 4], 'E7sus4', 'E7', ['Am', 4], ['C', 4], 'G7sus4', 'G7', ['C', 4], ['E', 4],
    'Dm', 'G7', ['C', 4], ['Am', 4], 'A7sus4', 'A7', ['Dm', 4], ['Bb', 4], 'E7sus4', 'E7', ['E', 4], ['Dm', 4], 'Am', 'Bm7(b5)', 'Esus4', 'E', ['Am', 4],
    ['E', 4], ['Dm', 4], ['Am', 4], ['Dm6', 4], ['Esus4', 4], ['E7', 4], ['A', 4],
  ]),
};

const ETHEREAL_VOICINGS = {
  Fmaj7: [[5, 9, 0, 4], [41, 60, 64, 65, 69]], G7: [[7, 11, 2, 5], [43, 62, 65, 67, 71]], Em7: [[4, 7, 11, 2], [40, 62, 64, 67, 71]],
  Am9: [[9, 0, 4, 7, 11], [45, 60, 64, 67, 71]], 'G#dim7': [[8, 11, 2, 5], [44, 62, 65, 68, 71]], Dm9: [[2, 5, 9, 0, 4], [50, 60, 64, 65, 69]],
  G13: [[7, 11, 2, 5, 9, 4], [43, 59, 64, 65, 69]], Cmaj9: [[0, 4, 7, 11, 2], [48, 59, 62, 64, 67]], C7: [[0, 4, 7, 10], [48, 60, 64, 67, 70]],
  Fmaj9: [[5, 9, 0, 4, 7], [41, 60, 64, 67, 69]], G7sus4: [[7, 0, 2, 5], [43, 60, 62, 65, 67]], Ab7sus4: [[8, 1, 3, 6], [44, 61, 63, 66, 68]],
  Gbmaj7: [[6, 10, 1, 5], [42, 65, 66, 70, 73]], Ab7: [[8, 0, 3, 6], [44, 63, 66, 68, 72]], Fm7: [[5, 8, 0, 3], [41, 63, 65, 68, 72]],
  Bbm9: [[10, 1, 5, 8, 0], [46, 61, 65, 68, 72]], Adim7: [[9, 0, 3, 6], [45, 60, 63, 66, 69]], Ebm9: [[3, 6, 10, 1, 5], [39, 61, 65, 66, 70]],
  Ab13: [[8, 0, 3, 6, 10, 5], [44, 60, 65, 66, 70]], Gbmaj9: [[6, 10, 1, 5, 8], [42, 61, 65, 68, 70]], 'Db6/9': [[1, 5, 8, 10, 3], [49, 58, 63, 65, 68]],
} as const;

export const ETHEREAL_FATIGUE: Progression = {
  id: 'ethereal-fatigue', bpm: 60, mood: ['tired', 'beautiful', 'ethereal', 'weightless'],
  use: 'High, quiet solitude and beautiful exhaustion: cloud tops, fading light, or the detached calm after effort.', meter: [4, 4], loop: true,
  chords: arranged(ETHEREAL_VOICINGS, [
    'Fmaj7', 'G7', 'Em7', 'Am9', 'Fmaj7', 'G7', 'G#dim7', 'Am9', 'Dm9', 'G13', 'Cmaj9', 'C7', 'Fmaj9', 'Em7', 'G7sus4', 'Ab7sus4',
    'Gbmaj7', 'Ab7', 'Fm7', 'Bbm9', 'Gbmaj7', 'Ab7', 'Adim7', 'Bbm9', 'Ebm9', 'Ab13', 'Gbmaj9', 'Ab7sus4', ['Db6/9', 4],
  ]),
};

const QUIRKY_VOICINGS = {
  Gm9: [[7, 10, 2, 5, 9], [43, 58, 62, 65, 69]], C13: [[0, 4, 7, 10, 2, 9], [36, 58, 62, 64, 69]],
  Dm9: [[2, 5, 9, 0, 4], [38, 57, 60, 64, 65]], Am9: [[9, 0, 4, 7, 11], [45, 55, 59, 60, 64]],
  Dbmaj9: [[1, 5, 8, 0, 3], [37, 56, 60, 63, 65]], Bbm9: [[10, 1, 5, 8, 0], [46, 56, 60, 61, 65]],
  'D7(b9)': [[2, 6, 9, 0, 3], [38, 57, 60, 63, 66]], 'C7(b9)': [[0, 4, 7, 10, 1], [36, 58, 61, 64, 67]],
  Fmaj9: [[5, 9, 0, 4, 7], [41, 57, 60, 64, 67]],
} as const;
export const QUIRKY_PATIENCE: Progression = {
  id: 'quirky-patience', bpm: 60, mood: ['quirky', 'jumpy', 'slow', 'curious'],
  use: 'Odd discoveries, improvised plans, or cautious movement with eccentric little surprises; active without becoming hurried.', meter: [4, 4], loop: true,
  chords: arranged(QUIRKY_VOICINGS, [['Gm9', 4], ['C13', 4], ['Dm9', 4], ['Am9', 4], ['Gm9', 4], ['C13', 4], ['Dbmaj9', 4], ['Bbm9', 4], ['Gm9', 4], ['C13', 4], ['D7(b9)', 8], ['Gm9', 4], 'C13', 'C7(b9)', ['Fmaj9', 4]]),
};

const BATTLE_VOICINGS = {
  Cmaj9: [[0, 4, 7, 11, 2], [36, 55, 59, 62, 64]], Gmaj9: [[7, 11, 2, 6, 9], [43, 57, 59, 62, 66]],
  'D6/9': [[2, 6, 9, 11, 4], [38, 57, 59, 62, 64]], Am9: [[9, 0, 4, 7, 11], [45, 55, 59, 60, 64]],
  Em9: [[4, 7, 11, 2, 6], [40, 55, 59, 62, 66]], 'Cmaj7(#11)': [[0, 4, 7, 11, 6], [36, 55, 59, 64, 66]],
  D13: [[2, 6, 9, 0, 4, 11], [38, 57, 59, 60, 64]], Am11: [[9, 0, 4, 7, 11, 2], [45, 55, 59, 62, 64]],
  A13: [[9, 1, 4, 7, 11, 6], [45, 55, 59, 61, 66]], 'E7(b9)': [[4, 8, 11, 2, 5], [40, 56, 59, 62, 65]],
} as const;
export const BATTLE_GRIT: Progression = {
  id: 'battle-grit', bpm: 60, mood: ['battle-ready', 'angry', 'gritty', 'heavy'],
  use: 'Preparing for combat or pressing into resistance: low, grunting determination and controlled anger rather than glory.', meter: [4, 4], loop: true,
  chords: arranged(BATTLE_VOICINGS, [['Cmaj9', 4], ['Gmaj9', 4], ['D6/9', 4], ['Am9', 4], ['Em9', 4], ['Cmaj7(#11)', 4], ['Gmaj9', 4], ['D13', 4], ['Am11', 4], ['Em9', 4], ['Cmaj9', 4], ['Gmaj9', 4], ['D6/9', 4], ['A13', 4], ['E7(b9)', 4]]),
};

const AFTERMATH_VOICINGS = {
  Dmadd9: [[2, 5, 9, 4], [38, 53, 57, 62, 64]], Bbmaj7: [[10, 2, 5, 9], [46, 57, 62, 65, 70]],
  Fadd9: [[5, 9, 0, 7], [41, 57, 60, 65, 67]], C: [[0, 4, 7], [48, 55, 60, 64, 67]],
  Bbmaj9: [[10, 2, 5, 9, 0], [46, 57, 60, 62, 65]], 'F/A': [[5, 9, 0], [45, 53, 60, 65, 69]],
  Gm9: [[7, 10, 2, 5, 9], [43, 57, 58, 62, 65]], 'C/E': [[0, 4, 7], [40, 55, 60, 64, 67]],
  'Bbmaj9(#11)': [[10, 2, 5, 9, 0, 4], [46, 57, 60, 64, 65]], A7sus4: [[9, 2, 4, 7], [45, 57, 62, 64, 67]],
  A7: [[9, 1, 4, 7], [45, 57, 61, 64, 67]],
} as const;
export const MONUMENTAL_AFTERMATH: Progression = {
  id: 'monumental-aftermath', bpm: 60, mood: ['grand', 'aftermath', 'symbolic', 'solemn'],
  use: 'Crossing the remains of a vast battle or witnessing a symbolic consequence: monumental scale without celebrating the destruction.', meter: [4, 4], loop: true,
  chords: arranged(AFTERMATH_VOICINGS, [['Dmadd9', 4], ['Bbmaj7', 4], ['Fadd9', 4], ['C', 4], ['Dmadd9', 4], ['Bbmaj9', 4], ['F/A', 4], ['C', 4], ['Gm9', 4], ['Bbmaj7', 4], ['C/E', 4], ['Fadd9', 4], ['Bbmaj9(#11)', 4], 'A7sus4', 'A7', ['Dmadd9', 4]]),
};

const WISTFUL_VOICINGS = {
  C: [[0, 4, 7], [48, 55, 60, 64, 67]], 'Em/B': [[4, 7, 11], [47, 52, 55, 59, 64]], 'E/B': [[4, 8, 11], [47, 52, 56, 59, 64]],
  'G#m/B': [[8, 11, 3], [47, 51, 56, 59, 63]], 'Ab/C': [[8, 0, 3], [48, 56, 60, 63, 68]], Cm: [[0, 3, 7], [48, 55, 60, 63, 67]],
  'Am/C': [[9, 0, 4], [48, 57, 60, 64, 69]], 'F#m/C#': [[6, 9, 1], [49, 54, 57, 61, 66]], 'Gb/Db': [[6, 10, 1], [49, 54, 58, 61, 66]],
  Ebm: [[3, 6, 10], [39, 51, 54, 58, 63]], Eb: [[3, 7, 10], [39, 51, 55, 58, 63]], 'Cm/Eb': [[0, 3, 7], [39, 48, 55, 60, 63]],
} as const;
export const WISTFUL_UNCERTAINTY: Progression = {
  id: 'wistful-uncertainty', bpm: 60, mood: ['longing', 'wistful', 'uncertain', 'tender'],
  use: 'Hope without assurance, waiting for an answer, or remembering a possible future that may no longer arrive.', meter: [4, 4], loop: true,
  chords: arranged(WISTFUL_VOICINGS, [['C', 4], ['Em/B', 4], ['E/B', 4], ['G#m/B', 4], ['Ab/C', 4], ['Cm', 4], ['C', 4], ['Am/C', 4], ['Ab/C', 4], ['F#m/C#', 4], ['Gb/Db', 4], ['Ebm', 4], ['Eb', 4], ['Cm/Eb', 4], ['C', 4]]),
};

const NAIVE_VOICINGS = {
  Bb: [[10, 2, 5], [46, 58, 62, 65, 70]], D7: [[2, 6, 9, 0], [38, 57, 60, 62, 66]], G7: [[7, 11, 2, 5], [43, 55, 59, 62, 65]],
  C7: [[0, 4, 7, 10], [36, 55, 58, 60, 64]], F7: [[5, 9, 0, 3], [41, 53, 57, 60, 63]], Bdim7: [[11, 2, 5, 8], [47, 53, 56, 59, 62]],
  Cm7: [[0, 3, 7, 10], [36, 55, 58, 60, 63]], Bb7: [[10, 2, 5, 8], [46, 56, 58, 62, 65]], Eb: [[3, 7, 10], [39, 51, 55, 58, 63]],
  Ebm6: [[3, 6, 10, 0], [39, 51, 54, 58, 60]], 'Bb/F': [[10, 2, 5], [41, 53, 58, 62, 65]], 'Gb7': [[6, 10, 1, 4], [42, 52, 54, 58, 61]],
  Bb6: [[10, 2, 5, 7], [46, 55, 58, 62, 65]],
} as const;
export const FORMAL_BEGINNING: Progression = {
  id: 'formal-beginning', bpm: 80, mood: ['proper', 'beginning', 'naive', 'orderly'],
  use: 'Formal introductions, early training, or a well-mannered beginning before experience has complicated the world.', meter: [4, 4], loop: true,
  chords: arranged(NAIVE_VOICINGS, [['Bb', 4], ['D7', 4], ['G7', 4], 'C7', 'F7', ['Bb', 4], 'Bdim7', 'Cm7', 'F7', 'Bb', 'Bb7', 'Eb', ['Ebm6', 4], ['Bb/F', 4], ['G7', 4], ['C7', 4], ['F7', 4], ['Eb', 4], ['Ebm6', 4], ['Bb/F', 4], ['Gb7', 4], ['F7', 4], ['Bb6', 4]]),
};

const VICTORY_VOICINGS = {
  Dm9: [[2, 5, 9, 0, 4], [38, 57, 60, 64, 65]], Bbmaj7: [[10, 2, 5, 9], [46, 57, 62, 65, 70]],
  Fmaj9: [[5, 9, 0, 4, 7], [41, 60, 64, 67, 69]], C6: [[0, 4, 7, 9], [48, 57, 60, 64, 67]],
  Bbmaj9: [[10, 2, 5, 9, 0], [46, 57, 60, 62, 65]], Gm9: [[7, 10, 2, 5, 9], [43, 57, 58, 62, 65]],
  A7sus4: [[9, 2, 4, 7], [45, 57, 62, 64, 67]], 'A7(b9)': [[9, 1, 4, 7, 10], [45, 55, 61, 64, 70]],
  'Bbmaj7(#11)': [[10, 2, 5, 9, 4], [46, 57, 62, 64, 65]], C13: [[0, 4, 7, 10, 2, 9], [36, 58, 62, 64, 69]],
  'Fmaj7/A': [[5, 9, 0, 4], [45, 53, 60, 64, 65]], 'Bb6/9': [[10, 2, 5, 7, 0], [46, 55, 60, 62, 65]],
  Dmadd9: [[2, 5, 9, 4], [38, 53, 57, 62, 64]],
} as const;
export const SMALL_VICTORY: Progression = {
  id: 'small-victory', bpm: 60, mood: ['small victory', 'job well done', 'prepared', 'satisfied'],
  use: 'A task completed competently, a modest success acknowledged, and readiness to accept the next assignment.', meter: [4, 4], loop: true,
  chords: arranged(VICTORY_VOICINGS, [['Dm9', 4], ['Bbmaj7', 4], ['Fmaj9', 4], ['C6', 4], ['Dm9', 4], ['Bbmaj9', 4], 'Gm9', 'A7sus4', ['A7(b9)', 4], ['Bbmaj7(#11)', 4], ['C13', 4], 'Fmaj9', 'Fmaj7/A', ['Dm9', 4], ['Gm9', 4], ['Bb6/9', 4], 'A7sus4', 'A7(b9)', ['Dmadd9', 4]]),
};

export const PROGRESSIONS = [PATIENT_AWE, RESOLUTE_DUTY, OMINOUS_VIGIL, WEARY_STILLNESS, UPRIGHT_CHALLENGE, PENSIVE_LONGING, ETHEREAL_FATIGUE, QUIRKY_PATIENCE, BATTLE_GRIT, MONUMENTAL_AFTERMATH, WISTFUL_UNCERTAINTY, FORMAL_BEGINNING, SMALL_VICTORY] as const;

// Construction is complete: progression chords retain the shared arrays, while the lookup maps can go.
noteSets.clear();
midiVoicings.clear();

export const progressionFor = (development: boolean, random = Math.random()): Progression =>
  development ? PROGRESSIONS[Math.floor(random * PROGRESSIONS.length)] : PATIENT_AWE;
