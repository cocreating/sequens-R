import type { MusicalKey, ScaleName } from '../pattern';

export const SCALE_INTERVALS: Readonly<Record<ScaleName, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export function assertMidiRoot(root: number): void {
  if (!Number.isInteger(root) || root < 0 || root > 11) {
    throw new RangeError(`Root must be an integer from 0 to 11; received ${root}.`);
  }
}

export function scalePitch(key: MusicalKey, degree: number, octave: number): number {
  assertMidiRoot(key.root);
  if (!Number.isInteger(degree) || !Number.isInteger(octave)) {
    throw new TypeError('Degree and octave must be integers.');
  }
  const intervals = SCALE_INTERVALS[key.scale];
  const length = intervals.length;
  const normalizedDegree = ((degree % length) + length) % length;
  const octaveOffset = Math.floor(degree / length);
  const pitch = key.root + intervals[normalizedDegree]! + (octave + octaveOffset + 1) * 12;
  if (pitch < 0 || pitch > 127) throw new RangeError(`Calculated pitch ${pitch} is outside MIDI range.`);
  return pitch;
}

export function transposePitch(pitch: number, from: MusicalKey, to: MusicalKey): number {
  assertMidiRoot(from.root);
  assertMidiRoot(to.root);
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new RangeError('Pitch must be a MIDI note.');
  const transposed = pitch + to.root - from.root;
  return Math.min(127, Math.max(0, transposed));
}
