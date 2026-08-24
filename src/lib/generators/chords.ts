import type { Generator, ParamSchema } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { diatonicChord, type ChordQuality } from '../core/theory/chords';
import { mutationSeed, sortedPattern } from './shared';

export interface ChordsParams {
  length: number;
  quality: number;
  duration: number;
  strum: number;
}

const QUALITIES = ['triad', 'seventh', 'ninth', 'sus2', 'sus4'] as const satisfies readonly ChordQuality[];
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3], [0, 2, 5, 4], [0, 6, 5, 4], [0, 3, 1, 4]] as const;

export const chordsParamSchema: ParamSchema = [
  { key: 'length', defaultValue: 4, min: 1, max: 8, step: 1, label: 'Chords', control: 'stepper' },
  { key: 'quality', defaultValue: 0, min: 0, max: 4, step: 1, label: 'Quality', options: ['Triad', '7th', '9th', 'Sus 2', 'Sus 4'] },
  { key: 'duration', defaultValue: 16, min: 4, max: 32, step: 4, label: 'Duration', unit: 'steps', control: 'stepper' },
  { key: 'strum', defaultValue: 0, min: 0, max: 100, step: 1, label: 'Strum', unit: '%', control: 'knob' },
];

export const chordsGenerator: Generator<ChordsParams> = {
  id: 'chords',
  defaults: { length: 4, quality: 0, duration: 16, strum: 0 },
  paramSchema: chordsParamSchema,
  generate(seed, params, context) {
    const random = sfc32(seed);
    const progression = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)]!;
    const quality = QUALITIES[params.quality] ?? QUALITIES[0];
    const events = [];
    for (let chordIndex = 0; chordIndex < params.length; chordIndex += 1) {
      const degree = progression[chordIndex % progression.length]!;
      const pitches = diatonicChord(context.key, degree, quality, 3);
      for (let voice = 0; voice < pitches.length; voice += 1) {
        events.push({
          startStep: chordIndex * params.duration + voice * params.strum / 400,
          durationSteps: Math.max(0.25, params.duration - voice * params.strum / 400),
          pitch: pitches[voice]!,
          velocity: 78 + Math.floor(random() * 10),
        });
      }
    }
    return sortedPattern(params.length * params.duration, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
