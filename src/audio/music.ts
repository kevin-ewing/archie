// Music is stored independently from playback and voicing. Notes are pitch classes (C = 0 … B = 11),
// with the chord root first; the future player can choose octaves and smooth inversions for each mood.

export type Chord = { symbol: string; notes: readonly number[]; midi: readonly number[]; beats: number };
export type Progression = {
  id: string;
  mood: readonly string[];
  meter: readonly [number, number];
  loop: boolean;
  chords: readonly Chord[];
};

const chord = (symbol: string, notes: readonly number[], midi: readonly number[], beats = 2): Chord => ({ symbol, notes, midi, beats });

export const PATIENT_AWE: Progression = {
  id: 'patient-awe',
  mood: ['patient', 'awed', 'melancholy', 'pensive'],
  meter: [4, 4],
  loop: true,
  chords: [
    chord('Bbadd9', [10, 2, 5, 0], [46, 53, 62, 70, 72], 4),
    chord('Fsus4', [5, 10, 0], [41, 53, 60, 70, 72]),
    chord('F', [5, 9, 0], [41, 53, 60, 69, 72]),
    chord('Gm7', [7, 10, 2, 5], [43, 53, 62, 67, 70], 4),
    chord('Ebmaj9', [3, 7, 10, 2, 5], [39, 53, 62, 67, 70], 4),
    chord('Bb', [10, 2, 5], [34, 53, 62, 65, 70]),
    chord('Dm7', [2, 5, 9, 0], [38, 53, 60, 62, 69]),
    chord('Ebadd9', [3, 7, 10, 5], [39, 53, 63, 67, 70]),
    chord('Cm7', [0, 3, 7, 10], [36, 60, 63, 67, 70]),
    chord('Gm9', [7, 10, 2, 5, 9], [43, 53, 62, 69, 70]),
    chord('F', [5, 9, 0], [41, 53, 60, 69, 72]),
    chord('Ebmaj7', [3, 7, 10, 2], [39, 55, 58, 62, 67]),
    chord('F7sus4', [5, 10, 0, 3], [41, 58, 60, 63, 72]),
    chord('Bbadd9', [10, 2, 5, 0], [46, 53, 62, 70, 72]),
    chord('F', [5, 9, 0], [41, 53, 60, 69, 72]),
    chord('Gm7', [7, 10, 2, 5], [43, 53, 62, 67, 70]),
    chord('Dm7', [2, 5, 9, 0], [38, 53, 60, 62, 69]),
    chord('Ebmaj9', [3, 7, 10, 2, 5], [39, 53, 62, 67, 70]),
    chord('F', [5, 9, 0], [41, 53, 60, 69, 72]),
    chord('Gm9', [7, 10, 2, 5, 9], [43, 53, 58, 62, 69]),
    chord('D7#9', [2, 6, 9, 0, 5], [38, 53, 60, 66, 69]),
    chord('Ebmaj7', [3, 7, 10, 2], [39, 55, 58, 62, 67]),
    chord('Ebm6', [3, 6, 10, 0], [39, 58, 60, 63, 66]),
    chord('Cm9', [0, 3, 7, 10, 2], [36, 51, 62, 67, 70]),
    chord('F7sus4', [5, 10, 0, 3], [41, 58, 60, 63, 72]),
    chord('Bb6/9', [10, 2, 5, 7, 0], [46, 53, 62, 67, 72], 3),
  ],
};

export const PROGRESSIONS = [PATIENT_AWE] as const;
