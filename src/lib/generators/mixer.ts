import type { Generator, Pattern } from '../core/pattern';

export type MixerParams = Record<never, never>;
const EMPTY_PATTERN: Pattern = { lengthSteps: 16, stepsPerBeat: 4, events: [] };

export const mixerGenerator: Generator<MixerParams> = {
  id: 'mixer',
  defaults: {},
  paramSchema: [],
  generate() {
    return EMPTY_PATTERN;
  },
  mutate() {
    return EMPTY_PATTERN;
  },
};
