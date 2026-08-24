import type { Generator, ParamSchema } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { melodicPitch, mutationSeed, sortedPattern } from './shared';

export interface BassParams {
  style: number;
  steps: number;
  range: number;
  density: number;
  drive: number;
  octave: number;
  gate: number;
}

const STYLE_DEGREES = [
  [0, 0, 4, 0, 2, 0, 5, 4],
  [0, 2, 4, 5, 4, 2, 1, 0],
  [0, 4, 5, 4, 2, 1, 0, -1],
  [0, 0, 2, 3, 4, 3, 2, 0],
  [0, 5, 0, 4, 0, 3, 2, 1],
  [0, 1, 4, 2, 5, 3, 6, 4],
] as const;

export const bassParamSchema: ParamSchema = [
  { key: 'style', defaultValue: 0, min: 0, max: 5, step: 1, label: 'Style', options: ['Anchor', 'Walk', 'Pulse', 'Round', 'Dub', 'Jump'] },
  { key: 'steps', defaultValue: 16, min: 4, max: 32, step: 1, label: 'Steps', control: 'stepper' },
  { key: 'range', defaultValue: 1, min: 1, max: 3, step: 1, label: 'Range', unit: 'oct', control: 'stepper' },
  { key: 'density', defaultValue: 55, min: 0, max: 100, step: 1, label: 'Density', unit: '%', control: 'knob' },
  { key: 'drive', defaultValue: 20, min: 0, max: 100, step: 1, label: 'Drive', unit: '%', control: 'knob' },
  { key: 'octave', defaultValue: 2, min: 1, max: 4, step: 1, label: 'Octave', control: 'stepper' },
  { key: 'gate', defaultValue: 70, min: 5, max: 100, step: 1, label: 'Gate', unit: '%', control: 'knob' },
];

export const bassGenerator: Generator<BassParams> = {
  id: 'bass',
  defaults: { style: 0, steps: 16, range: 1, density: 55, drive: 20, octave: 2, gate: 70 },
  paramSchema: bassParamSchema,
  generate(seed, params, context) {
    const random = sfc32(seed);
    const degrees = STYLE_DEGREES[params.style] ?? STYLE_DEGREES[0]!;
    const events = [];
    for (let step = 0; step < params.steps; step += 1) {
      const anchor = step % 4 === 0;
      if (!anchor && random() * 100 >= params.density) continue;
      const octaveOffset = Math.floor(random() * params.range);
      const degree = degrees[step % degrees.length]!;
      events.push({
        startStep: step,
        durationSteps: Math.max(0.1, params.gate / 100),
        pitch: melodicPitch(context, degree, params.octave + octaveOffset),
        velocity: Math.min(127, 82 + Math.round(params.drive * 0.25) + (anchor ? 10 : 0)),
        accent: anchor,
      });
    }
    return sortedPattern(params.steps, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
