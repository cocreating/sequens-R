import type { Generator, ParamSchema, Pattern } from '../core/pattern';
import { mutationSeed, sortedPattern } from './shared';

export interface EuclidParams {
  steps1: number; hits1: number; rotation1: number; note1: number;
  steps2: number; hits2: number; rotation2: number; note2: number;
  steps3: number; hits3: number; rotation3: number; note3: number;
  separateChannels: number;
}

export const euclidParamSchema: ParamSchema = [
  { key: 'steps1', defaultValue: 16, min: 2, max: 16, step: 1, label: 'Ring 1 steps' },
  { key: 'hits1', defaultValue: 5, min: 0, max: 16, step: 1, label: 'Ring 1 hits' },
  { key: 'rotation1', defaultValue: 0, min: 0, max: 15, step: 1, label: 'Ring 1 rotate' },
  { key: 'note1', defaultValue: 36, min: 0, max: 127, step: 1, label: 'Ring 1 note' },
  { key: 'steps2', defaultValue: 12, min: 2, max: 16, step: 1, label: 'Ring 2 steps' },
  { key: 'hits2', defaultValue: 4, min: 0, max: 16, step: 1, label: 'Ring 2 hits' },
  { key: 'rotation2', defaultValue: 1, min: 0, max: 15, step: 1, label: 'Ring 2 rotate' },
  { key: 'note2', defaultValue: 42, min: 0, max: 127, step: 1, label: 'Ring 2 note' },
  { key: 'steps3', defaultValue: 9, min: 2, max: 16, step: 1, label: 'Ring 3 steps' },
  { key: 'hits3', defaultValue: 3, min: 0, max: 16, step: 1, label: 'Ring 3 hits' },
  { key: 'rotation3', defaultValue: 0, min: 0, max: 15, step: 1, label: 'Ring 3 rotate' },
  { key: 'note3', defaultValue: 48, min: 0, max: 127, step: 1, label: 'Ring 3 note' },
  { key: 'separateChannels', defaultValue: 0, min: 0, max: 1, step: 1, label: 'MIDI channels', options: ['Together', 'Separate'] },
];

/** Canonical Bjorklund distribution, rotated after construction. */
export function bjorklund(steps: number, hits: number, rotation = 0): readonly boolean[] {
  const normalizedSteps = Math.max(2, Math.min(16, Math.round(steps)));
  const normalizedHits = Math.max(0, Math.min(normalizedSteps, Math.round(hits)));
  if (normalizedHits === 0) return Array.from({ length: normalizedSteps }, () => false);
  if (normalizedHits === normalizedSteps) return Array.from({ length: normalizedSteps }, () => true);
  const counts: number[] = [];
  const remainders = [normalizedHits];
  let divisor = normalizedSteps - normalizedHits;
  let level = 0;
  while (true) {
    counts.push(Math.floor(divisor / remainders[level]!));
    remainders.push(divisor % remainders[level]!);
    divisor = remainders[level]!;
    level += 1;
    if (remainders[level]! <= 1) break;
  }
  counts.push(divisor);
  const pattern: boolean[] = [];
  const build = (current: number): void => {
    if (current === -1) pattern.push(false);
    else if (current === -2) pattern.push(true);
    else {
      for (let index = 0; index < counts[current]!; index += 1) build(current - 1);
      if (remainders[current]! !== 0) build(current - 2);
    }
  };
  build(level);
  const firstHit = pattern.indexOf(true);
  const aligned = firstHit > 0 ? [...pattern.slice(firstHit), ...pattern.slice(0, firstHit)] : pattern;
  const offset = ((Math.round(rotation) % normalizedSteps) + normalizedSteps) % normalizedSteps;
  return aligned.map((_, index) => aligned[(index - offset + normalizedSteps) % normalizedSteps]!);
}

export const euclidGenerator: Generator<EuclidParams> = {
  id: 'euclid',
  defaults: {
    steps1: 16, hits1: 5, rotation1: 0, note1: 36,
    steps2: 12, hits2: 4, rotation2: 1, note2: 42,
    steps3: 9, hits3: 3, rotation3: 0, note3: 48,
    separateChannels: 0,
  },
  paramSchema: euclidParamSchema,
  generate(_seed, params) {
    const rings = [
      { steps: params.steps1, hits: params.hits1, rotation: params.rotation1, note: params.note1 },
      { steps: params.steps2, hits: params.hits2, rotation: params.rotation2, note: params.note2 },
      { steps: params.steps3, hits: params.hits3, rotation: params.rotation3, note: params.note3 },
    ] as const;
    const events = rings.flatMap((ring, lane) => bjorklund(ring.steps, ring.hits, ring.rotation).flatMap((active, step) => active ? [{
      startStep: step,
      durationSteps: 0.5,
      pitch: ring.note,
      velocity: 112 - lane * 12,
      lane,
      ...(params.separateChannels === 1 ? { channelOffset: lane } : {}),
    }] : []));
    const pattern = sortedPattern(Math.max(...rings.map(({ steps }) => steps)), events) as Pattern;
    return { ...pattern, laneLengths: rings.map(({ steps }) => steps) };
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
