import type { MusicalKey, NoteEvent, Pattern } from '../core/pattern';
import { scalePitch } from '../core/theory/scales';
import { PIANO_PITCH_MAX, PIANO_PITCH_MIN } from './piano-roll-model';

type MelodyNote = readonly [startStep: number, durationSteps: number, scaleDegree: number, octaveOffset?: number, velocity?: number, accent?: boolean];

export interface PianoMelodyExample {
  id: string;
  label: string;
  level: 'Simple' | 'Developing' | 'Intermediate' | 'Advanced';
  lengthSteps: 16 | 32 | 64;
  notes: readonly MelodyNote[];
}

export const PIANO_MELODY_EXAMPLES: readonly PianoMelodyExample[] = [
  { id: 'steady-beacon', label: '01 · Steady Beacon', level: 'Simple', lengthSteps: 16, notes: [[0, 3, 0], [4, 3, 2], [8, 3, 4], [12, 3, 2]] },
  { id: 'rising-steps', label: '02 · Rising Steps', level: 'Simple', lengthSteps: 16, notes: [[0, 3, 0], [4, 3, 1], [8, 3, 2], [12, 3, 3]] },
  { id: 'gentle-answer', label: '03 · Gentle Answer', level: 'Simple', lengthSteps: 16, notes: [[0, 2, 0], [3, 2, 2], [6, 1.5, 4], [8, 2, 3], [11, 2, 1], [14, 2, 0]] },
  { id: 'balanced-arch', label: '04 · Balanced Arch', level: 'Simple', lengthSteps: 16, notes: [[0, 2, 0], [2, 2, 1], [4, 2, 3], [6, 2, 5], [8, 2, 3], [11, 2, 1], [14, 2, 0]] },
  { id: 'skipping-thirds', label: '05 · Skipping Thirds', level: 'Developing', lengthSteps: 16, notes: [[0, 1.5, 0], [2, 1.5, 2], [4, 1.5, 4], [6, 1.5, 2], [8, 1.5, 1], [10, 1.5, 3], [12, 1.5, 5], [14, 2, 3]] },
  { id: 'syncopated-spark', label: '06 · Syncopated Spark', level: 'Developing', lengthSteps: 16, notes: [[0, 1, 0], [1.5, 1, 2], [4, 1.5, 4], [6.5, 1, 5], [8, 1, 4], [9.5, 1, 2], [12, 1.5, 3], [14.5, 1.5, 1]] },
  { id: 'pentatonic-drift', label: '07 · Open-Space Drift', level: 'Developing', lengthSteps: 16, notes: [[0, 1.5, 0], [2, 1.5, 2], [3.5, 1, 4], [5, 2, 5], [8, 1.5, 7], [10, 1, 4], [11.5, 1, 2], [13, 1, 3], [14.5, 1.5, 0]] },
  { id: 'turnaround-hook', label: '08 · Turnaround Hook', level: 'Developing', lengthSteps: 16, notes: [[0, 1.5, 0], [2, 1, 2], [3.5, 1, 4], [5, 1, 6], [6.5, 1.5, 4], [8, 1, 3], [9.5, 1, 1], [11, 1, 2], [12.5, 1, 4], [14, 2, 0]] },
  { id: 'offbeat-ladder', label: '09 · Offbeat Ladder', level: 'Developing', lengthSteps: 16, notes: [[0, 1, 0], [1.5, 1, 1], [3, 1, 2], [4.5, 1, 3], [6, 1, 4], [7.5, 1, 5], [9, 1, 6], [10.5, 1, 7], [12, 1, 5], [13.5, 1, 3], [15, 1, 1]] },
  { id: 'two-bar-question', label: '10 · Two-Bar Question', level: 'Intermediate', lengthSteps: 32, notes: [[0, 2, 0], [3, 1.5, 2], [6, 2, 4], [9, 1, 5], [11, 3, 4], [16, 2, 1], [19, 1.5, 3], [22, 2, 5], [25, 1, 4], [27, 1, 2], [29, 1, 1], [30, 2, 0]] },
  { id: 'sequence-bloom', label: '11 · Sequence Bloom', level: 'Intermediate', lengthSteps: 32, notes: [[0, 1.5, 0], [2, 1.5, 1], [4, 2, 3], [7, 1, 2], [9, 2, 4], [12, 2, 3], [16, 1.5, 1], [18, 1.5, 2], [20, 2, 4], [23, 1, 3], [25, 2, 5], [28, 1, 4], [30, 2, 2]] },
  { id: 'broken-triad-run', label: '12 · Broken-Triad Run', level: 'Intermediate', lengthSteps: 32, notes: [[0, 1, 0], [2, 1, 2], [4, 1, 4], [6, 1, 7], [8, 1, 4], [10, 1, 2], [12, 1, 1], [14, 1, 3], [16, 1, 5], [18, 1, 8], [20, 1, 5], [22, 1, 3], [24, 2, 2], [28, 4, 0]] },
  { id: 'color-weave', label: '13 · Color Weave', level: 'Intermediate', lengthSteps: 32, notes: [[0, 1.5, 0], [2, 1, 3], [3.5, 1, 2], [5, 1.5, 5], [8, 1, 4], [9.5, 1, 2], [11, 1, 6], [13, 2, 5], [16, 1.5, 1], [18, 1, 4], [19.5, 1, 3], [21, 1.5, 6], [24, 1, 5], [26, 1, 2], [29, 3, 0]] },
  { id: 'octave-conversation', label: '14 · Octave Conversation', level: 'Intermediate', lengthSteps: 32, notes: [[0, 2, 0, -1], [3, 1, 2], [5, 1, 4], [7, 2, 0, 1], [10, 1, 4], [12, 1, 2], [14, 2, 1, -1], [16, 2, 1, 1], [19, 1, 3], [21, 1, 5], [23, 2, 2, 1], [26, 1, 5], [27.5, 1, 3], [29, 1, 1], [30, 2, 0]] },
  { id: 'anticipation-line', label: '15 · Anticipation Line', level: 'Intermediate', lengthSteps: 32, notes: [[0, 1, 0], [1.5, 1, 2], [3, 1, 4], [6, 1.5, 3], [7.5, 1, 5], [10, 1, 4], [12, 1, 2], [15.5, 1, 1], [16.5, 1, 3], [18, 1, 5], [20, 1.5, 7], [22.5, 1, 6], [24, 1, 4], [26, 1, 2], [28, 1, 3], [30, 1, 1], [31, 1, 0]] },
  { id: 'motif-development', label: '16 · Motif Development', level: 'Advanced', lengthSteps: 32, notes: [[0, 1, 0], [2, 1, 2], [3.5, 1.5, 4], [6, 2, 2], [8, 1, 1], [10, 1, 3], [11.5, 1.5, 5], [14, 2, 3], [16, 1, 2], [18, 1, 4], [19.5, 1.5, 6], [22, 1, 4], [23.5, 1, 2], [25, 1, 5], [26.5, 1, 4], [28, 1, 3], [29.5, 1, 1], [31, 1, 0]] },
  { id: 'wide-interval-study', label: '17 · Wide-Interval Study', level: 'Advanced', lengthSteps: 64, notes: [[0, 2, 0, -1], [4, 1.5, 4], [7, 1, 1, 1], [10, 2, 5], [14, 1, 2], [16, 2, 6], [20, 1.5, 3], [23, 1, 7], [26, 2, 4], [30, 1, 1], [32, 2, 5, -1], [36, 1.5, 2], [39, 1, 6, 1], [42, 2, 3], [46, 1, 7], [48, 2, 4], [52, 1, 2], [55, 1, 5], [58, 1.5, 1], [61, 3, 0]] },
  { id: 'three-part-arc', label: '18 · Three-Part Arc', level: 'Advanced', lengthSteps: 64, notes: [[0, 2, 0], [3, 1, 1], [5, 1, 3], [7, 2, 5], [10, 1, 4], [12, 2, 2], [16, 1, 1], [18, 1, 3], [20, 1, 5], [22, 1, 7], [24, 1, 8], [26, 1, 6], [28, 1, 4], [30, 2, 5], [32, 1, 4], [34, 1, 2], [36, 1.5, 0], [40, 1, 3], [43, 1, 1], [46, 2, 2], [50, 1, 4], [54, 1, 1], [58, 4, 0]] },
  { id: 'polyrhythmic-thread', label: '19 · Polyrhythmic Thread', level: 'Advanced', lengthSteps: 64, notes: [[0, 1, 0], [2.5, 1, 2], [5, 1, 4], [7.5, 1, 1], [10, 1, 5], [12.5, 1, 3], [15, 1, 6], [17.5, 1, 4], [20, 1, 7], [22.5, 1, 5], [25, 1, 2], [27.5, 1, 4], [30, 1, 1], [32.5, 1, 3], [35, 1, 5], [37.5, 1, 2], [40, 1, 6], [42.5, 1, 4], [45, 1, 1], [47.5, 1, 5], [50, 1, 3], [52.5, 1, 2], [56, 2, 1], [60, 4, 0]] },
  { id: 'longform-journey', label: '20 · Longform Journey', level: 'Advanced', lengthSteps: 64, notes: [[0, 1.5, 0], [2, 1, 2], [3.5, 1, 4], [5, 2, 5], [8, 1, 4], [9.5, 1, 2], [11, 1, 6], [13, 2, 5], [16, 1, 1], [18, 1, 3], [19.5, 1, 5], [21, 1, 7], [23, 1, 8], [25, 1, 6], [27, 1, 4], [29, 3, 3], [32, 1, 2], [34, 1, 4], [35.5, 1, 6], [37, 1, 9], [39, 1, 7], [41, 1, 5], [43, 1, 3], [45, 2, 4], [48, 1, 5], [51, 1, 2], [55, 1.5, 1], [59, 5, 0]] },
] as const;

function pianoRangePitch(key: MusicalKey, degree: number, octaveOffset: number): number {
  let pitch = scalePitch(key, degree, 3 + octaveOffset);
  while (pitch > PIANO_PITCH_MAX) pitch -= 12;
  while (pitch < PIANO_PITCH_MIN) pitch += 12;
  return pitch;
}

export function pianoMelodyPattern(id: string, key: MusicalKey): Pattern {
  const example = PIANO_MELODY_EXAMPLES.find((candidate) => candidate.id === id);
  if (example === undefined) throw new RangeError(`Unknown Piano melody example ${id}.`);
  const events: NoteEvent[] = example.notes.map((note, index) => {
    const [startStep, durationSteps, degree, octaveOffset = 0, velocity, accent] = note;
    const isAccent = accent ?? startStep % 16 === 0;
    return {
      startStep,
      durationSteps: Math.max(0.25, Math.min(durationSteps, example.lengthSteps - startStep)),
      pitch: pianoRangePitch(key, degree, octaveOffset),
      velocity: velocity ?? Math.min(127, 82 + (index % 4 === 0 ? 16 : index % 2 === 0 ? 8 : 0)),
      ...(isAccent ? { accent: true } : {}),
    };
  });
  return { lengthSteps: example.lengthSteps, stepsPerBeat: 4, events };
}
