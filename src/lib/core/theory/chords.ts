import type { ChordEvent, MusicalKey } from '../pattern';
import { scalePitch } from './scales';

export type ChordQuality = 'triad' | 'seventh' | 'ninth' | 'sus2' | 'sus4';

const DEGREE_OFFSETS: Readonly<Record<ChordQuality, readonly number[]>> = {
  triad: [0, 2, 4],
  seventh: [0, 2, 4, 6],
  ninth: [0, 2, 4, 6, 8],
  sus2: [0, 1, 4],
  sus4: [0, 3, 4],
};

export function diatonicChord(key: MusicalKey, degree: number, quality: ChordQuality, octave = 3): readonly number[] {
  if (!Number.isInteger(degree)) throw new TypeError('Chord degree must be an integer.');
  return DEGREE_OFFSETS[quality].map((offset) => scalePitch(key, degree + offset, octave));
}

export function chordEvent(
  key: MusicalKey,
  degree: number,
  quality: ChordQuality,
  startStep: number,
  durationSteps: number,
): ChordEvent {
  if (startStep < 0 || durationSteps <= 0) throw new RangeError('Chord timing must be positive.');
  return { startStep, durationSteps, pitches: diatonicChord(key, degree, quality) };
}
