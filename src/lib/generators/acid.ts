import type { Generator, ParamSchema } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { melodicPitch, mutationSeed, sortedPattern } from './shared';

export interface AcidParams {
  fill: number;
  steps: number;
  range: number;
  decay: number;
}

export const acidParamSchema: ParamSchema = [
  { key: 'fill', defaultValue: 60, min: 0, max: 100, step: 1, label: 'Fill', unit: '%' },
  { key: 'steps', defaultValue: 16, min: 4, max: 32, step: 1, label: 'Steps' },
  { key: 'range', defaultValue: 2, min: 1, max: 3, step: 1, label: 'Range', unit: 'oct' },
  { key: 'decay', defaultValue: 45, min: 0, max: 100, step: 1, label: 'Decay', unit: '%' },
];

export const acidGenerator: Generator<AcidParams> = {
  id: 'acid',
  defaults: { fill: 60, steps: 16, range: 2, decay: 45 },
  paramSchema: acidParamSchema,
  generate(seed, params, context) {
    const random = sfc32(seed);
    const events = [];
    for (let step = 0; step < params.steps; step += 1) {
      if (random() * 100 >= params.fill) continue;
      const accent = random() < 0.22;
      const slide = step < params.steps - 1 && random() < 0.2;
      const octaveOffset = Math.floor(random() * params.range);
      const degree = Math.floor(random() * 7);
      events.push({
        startStep: step,
        durationSteps: slide ? 1.15 : 0.2 + params.decay / 125,
        pitch: melodicPitch(context, degree, 2 + octaveOffset),
        velocity: accent ? 122 : 88,
        slide,
        accent,
      });
    }
    return sortedPattern(params.steps, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
