import type { Generator, MusicalContext, NoteEvent, ParamSchema, Pattern } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { SCALE_INTERVALS } from '../core/theory/scales';
import { melodicPitch, mutationSeed, sortedPattern } from './shared';

export interface SynthParams {
  style: number;
  steps: number;
  density: number;
  range: number;
  octave: number;
  gate: number;
  repeat: number;
}

const PHRASE_CONTOURS = [
  [0, 2, 4, 1],
  [0, 1, 2, 4],
  [4, 3, 2, 0],
  [0, 2, 1, 4, 3, 1, 2, 0],
  [0, 4, 1, 5, 2, 4, 1, 3],
] as const;

export const synthParamSchema: ParamSchema = [
  { key: 'style', defaultValue: 0, min: 0, max: 5, step: 1, label: 'Phrase', options: ['Motif', 'Climb', 'Fall', 'Answer', 'Orbit', 'Drift'] },
  { key: 'steps', defaultValue: 16, min: 8, max: 64, step: 8, label: 'Steps', control: 'stepper' },
  { key: 'density', defaultValue: 55, min: 0, max: 100, step: 1, label: 'Density', unit: '%', control: 'knob' },
  { key: 'range', defaultValue: 2, min: 1, max: 3, step: 1, label: 'Range', unit: 'oct', control: 'stepper' },
  { key: 'octave', defaultValue: 4, min: 2, max: 6, step: 1, label: 'Octave', control: 'stepper' },
  { key: 'gate', defaultValue: 70, min: 10, max: 100, step: 1, label: 'Gate', unit: '%', control: 'knob' },
  { key: 'repeat', defaultValue: 35, min: 0, max: 100, step: 1, label: 'Repeat', unit: '%', control: 'knob' },
];

function phraseDegree(style: number, index: number, previous: number, random: () => number, maximum: number): number {
  if (style === 5) {
    const movement = random() < 0.18 ? 0 : random() < 0.56 ? -1 : 1;
    return Math.max(0, Math.min(maximum, previous + movement));
  }
  const contour = PHRASE_CONTOURS[style] ?? PHRASE_CONTOURS[0]!;
  const cycle = Math.floor(index / contour.length);
  const degree = contour[index % contour.length]! + (style === 1 ? cycle * 2 : style === 2 ? -cycle : 0);
  return Math.max(0, Math.min(maximum, degree));
}

function generateSynthPattern(seed: number, params: SynthParams, context: MusicalContext): Pattern {
  const random = sfc32(seed);
  const scaleLength = SCALE_INTERVALS[context.key.scale].length;
  const maximumDegree = Math.max(0, scaleLength * params.range - 1);
  const events: NoteEvent[] = [];
  let previousDegree = 0;
  let phraseIndex = 0;

  for (let step = 0; step < params.steps; step += 2) {
    const cadence = step >= params.steps - 2;
    const anchor = step % 8 === 0;
    const occupied = cadence || (params.density > 0 && (anchor || random() * 100 < params.density));
    if (!occupied) continue;

    let degree = cadence ? 0 : phraseDegree(params.style, phraseIndex, previousDegree, random, maximumDegree);
    if (!cadence && phraseIndex > 0 && random() * 100 < params.repeat) degree = previousDegree;
    const octaveLift = Math.floor(degree / scaleLength);
    const normalizedDegree = degree - octaveLift * scaleLength;
    events.push({
      startStep: step,
      durationSteps: Math.max(0.2, params.gate / 100 * 2),
      pitch: melodicPitch(context, normalizedDegree, params.octave + octaveLift),
      velocity: Math.min(127, 76 + Math.floor(random() * 20) + (anchor || cadence ? 10 : 0)),
      accent: anchor || cadence,
    });
    previousDegree = degree;
    phraseIndex += 1;
  }

  return sortedPattern(params.steps, events);
}

function mutateSynthPattern(base: Pattern, seed: number, intensity: 1 | 2 | 3 | 4, params: SynthParams, context: MusicalContext): Pattern {
  const candidate = generateSynthPattern(mutationSeed(seed, intensity), params, context);
  if (intensity === 4 || base.lengthSteps !== candidate.lengthSteps || base.events.length === 0) return candidate;
  if (intensity === 3) {
    const cadence = base.events.at(-1);
    return cadence === undefined ? candidate : sortedPattern(candidate.lengthSteps, [...candidate.events.slice(0, -1), { ...cadence }]);
  }

  const events = base.events.map((event) => ({ ...event }));
  const replaceable = Math.max(0, events.length - 1);
  const replacements = Math.min(replaceable, intensity);
  const random = sfc32((seed ^ 0x51f15e5d ^ intensity) >>> 0);
  const used = new Set<number>();
  for (let count = 0; count < replacements; count += 1) {
    let index = Math.floor(random() * replaceable);
    while (used.has(index) && used.size < replaceable) index = (index + 1) % replaceable;
    used.add(index);
    const source = candidate.events[index % Math.max(1, candidate.events.length - 1)];
    if (source !== undefined) events[index] = intensity === 1
      ? { ...events[index]!, pitch: source.pitch, velocity: source.velocity }
      : { ...source };
  }
  return sortedPattern(base.lengthSteps, events);
}

export const synthGenerator: Generator<SynthParams> = {
  id: 'synth',
  defaults: { style: 0, steps: 16, density: 55, range: 2, octave: 4, gate: 70, repeat: 35 },
  paramSchema: synthParamSchema,
  generate: generateSynthPattern,
  mutate: mutateSynthPattern,
};
