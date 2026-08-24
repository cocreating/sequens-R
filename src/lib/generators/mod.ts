import type { Generator, ParamSchema } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { mutationSeed, sortedPattern } from './shared';

export interface ModParams extends Record<string, number> {
  bars: number;
}

const SHAPES = ['Sine', 'Triangle', 'Square', 'Saw', 'Random'] as const;
const RATES = [0.25, 0.5, 1, 2, 4, 8] as const;

const lfoSchema = (index: number): ParamSchema => [
  { key: `enabled${index}`, defaultValue: index === 1 ? 1 : 0, min: 0, max: 1, step: 1, label: `LFO ${index}`, options: ['Off', 'On'] },
  { key: `cc${index}`, defaultValue: [74, 71, 1][index - 1]!, min: 0, max: 127, step: 1, label: `LFO ${index} CC` },
  { key: `channel${index}`, defaultValue: 1, min: 1, max: 16, step: 1, label: `LFO ${index} channel` },
  { key: `shape${index}`, defaultValue: index - 1, min: 0, max: 4, step: 1, label: `LFO ${index} shape`, options: SHAPES },
  { key: `rate${index}`, defaultValue: index + 1, min: 0, max: 5, step: 1, label: `LFO ${index} rate`, options: ['1/4 beat', '1/2 beat', '1 beat', '2 beats', '4 beats', '8 beats'] },
  { key: `depth${index}`, defaultValue: 32, min: 0, max: 63, step: 1, label: `LFO ${index} depth` },
  { key: `fade${index}`, defaultValue: 0, min: 0, max: 16, step: 1, label: `LFO ${index} fade`, unit: 'beats' },
  { key: `center${index}`, defaultValue: 64, min: 0, max: 127, step: 1, label: `LFO ${index} center` },
  { key: `bipolar${index}`, defaultValue: 1, min: 0, max: 1, step: 1, label: `LFO ${index} mode`, options: ['Unipolar', 'Bipolar'] },
];

export const modParamSchema: ParamSchema = [
  { key: 'bars', defaultValue: 4, min: 1, max: 8, step: 1, label: 'Loop', unit: 'bars' },
  ...lfoSchema(1),
  ...lfoSchema(2),
  ...lfoSchema(3),
];

function shapeValue(shape: number, phase: number, random: () => number): number {
  if (shape === 1) return 1 - 4 * Math.abs(phase - 0.5);
  if (shape === 2) return phase < 0.5 ? 1 : -1;
  if (shape === 3) return 1 - phase * 2;
  if (shape === 4) return random() * 2 - 1;
  return Math.sin(phase * Math.PI * 2);
}

export const modGenerator: Generator<ModParams> = {
  id: 'mod',
  defaults: Object.fromEntries(modParamSchema.map((definition) => [definition.key, definition.defaultValue])) as ModParams,
  paramSchema: modParamSchema,
  generate(seed, params) {
    const events = [];
    const totalSteps = params.bars * 16;
    for (let lfo = 1; lfo <= 3; lfo += 1) {
      if (params[`enabled${lfo}`] !== 1) continue;
      const random = sfc32((seed ^ Math.imul(lfo, 0x9e3779b9)) >>> 0);
      const rateBeats = RATES[params[`rate${lfo}`] ?? 0] ?? 1;
      const rateSteps = rateBeats * 4;
      const center = params[`center${lfo}`] ?? 64;
      const depth = params[`depth${lfo}`] ?? 0;
      const fadeSteps = (params[`fade${lfo}`] ?? 0) * 4;
      for (let step = 0; step < totalSteps; step += 0.25) {
        const phase = (step % rateSteps) / rateSteps;
        const wave = shapeValue(params[`shape${lfo}`] ?? 0, phase, random);
        const fade = fadeSteps <= 0 ? 1 : Math.min(1, step / fadeSteps);
        const bipolar = params[`bipolar${lfo}`] === 1;
        const normalized = bipolar ? wave : (wave + 1) / 2;
        const value = Math.max(0, Math.min(127, Math.round(center + normalized * depth * fade)));
        events.push({
          startStep: step,
          durationSteps: 0.01,
          pitch: 0,
          velocity: 1,
          cc: params[`cc${lfo}`] ?? 0,
          value,
          channel: params[`channel${lfo}`] ?? 1,
          lane: lfo - 1,
        });
      }
    }
    return sortedPattern(totalSteps, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
