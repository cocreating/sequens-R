import type { Generator, ParamSchema } from '../core/pattern';
import { mutationSeed, sortedPattern } from './shared';

export interface CcParams {
  bars: number;
  cc1: number; channel1: number; value1: number;
  cc2: number; channel2: number; value2: number;
  cc3: number; channel3: number; value3: number;
  cc4: number; channel4: number; value4: number;
}

export const ccParamSchema: ParamSchema = [
  { key: 'bars', defaultValue: 1, min: 1, max: 8, step: 1, label: 'Loop', unit: 'bars' },
  { key: 'cc1', defaultValue: 74, min: 0, max: 127, step: 1, label: 'Control 1 CC' },
  { key: 'channel1', defaultValue: 1, min: 1, max: 16, step: 1, label: 'Control 1 channel' },
  { key: 'value1', defaultValue: 64, min: 0, max: 127, step: 1, label: 'Control 1 value' },
  { key: 'cc2', defaultValue: 71, min: 0, max: 127, step: 1, label: 'Control 2 CC' },
  { key: 'channel2', defaultValue: 1, min: 1, max: 16, step: 1, label: 'Control 2 channel' },
  { key: 'value2', defaultValue: 64, min: 0, max: 127, step: 1, label: 'Control 2 value' },
  { key: 'cc3', defaultValue: 1, min: 0, max: 127, step: 1, label: 'Control 3 CC' },
  { key: 'channel3', defaultValue: 1, min: 1, max: 16, step: 1, label: 'Control 3 channel' },
  { key: 'value3', defaultValue: 0, min: 0, max: 127, step: 1, label: 'Control 3 value' },
  { key: 'cc4', defaultValue: 11, min: 0, max: 127, step: 1, label: 'Control 4 CC' },
  { key: 'channel4', defaultValue: 1, min: 1, max: 16, step: 1, label: 'Control 4 channel' },
  { key: 'value4', defaultValue: 127, min: 0, max: 127, step: 1, label: 'Control 4 value' },
];

export const ccGenerator: Generator<CcParams> = {
  id: 'cc',
  defaults: {
    bars: 1,
    cc1: 74, channel1: 1, value1: 64,
    cc2: 71, channel2: 1, value2: 64,
    cc3: 1, channel3: 1, value3: 0,
    cc4: 11, channel4: 1, value4: 127,
  },
  paramSchema: ccParamSchema,
  generate(_seed, params) {
    const events = Array.from({ length: 4 }, (_, index) => {
      const control = index + 1;
      return {
        startStep: 0,
        durationSteps: 0.01,
        pitch: 0,
        velocity: 1,
        cc: params[`cc${control}` as keyof CcParams],
        value: params[`value${control}` as keyof CcParams],
        channel: params[`channel${control}` as keyof CcParams],
        lane: index,
      };
    });
    return sortedPattern(params.bars * 16, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
