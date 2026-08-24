import type { Generator, ParamSchema, Pattern } from '../core/pattern';

export interface PianoParams {
  length: number;
  inKey: number;
}

export const pianoParamSchema: ParamSchema = [
  { key: 'length', defaultValue: 0, min: 0, max: 2, step: 1, label: 'Length', options: ['16 steps', '32 steps', '64 steps'] },
  { key: 'inKey', defaultValue: 1, min: 0, max: 1, step: 1, label: 'Pitch mode', options: ['Chromatic', 'In key'] },
];

function emptyPattern(lengthIndex: number): Pattern {
  return { lengthSteps: [16, 32, 64][lengthIndex] ?? 16, stepsPerBeat: 4, events: [] };
}

export const pianoGenerator: Generator<PianoParams> = {
  id: 'piano',
  defaults: { length: 0, inKey: 1 },
  paramSchema: pianoParamSchema,
  generate(_seed, params) {
    return emptyPattern(params.length);
  },
  mutate(_base, _seed, _intensity, params) {
    return emptyPattern(params.length);
  },
};
