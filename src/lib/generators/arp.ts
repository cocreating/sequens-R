import type { Generator, ParamSchema } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { diatonicChord } from '../core/theory/chords';
import { mutationSeed, sortedPattern } from './shared';

export interface ArpParams {
  direction: number;
  rate: number;
  span: number;
  gate: number;
  followChords: number;
  octave: number;
}

const STEP_RATES = [4, 2, 1, 0.5] as const;

export const arpParamSchema: ParamSchema = [
  { key: 'direction', defaultValue: 0, min: 0, max: 3, step: 1, label: 'Direction', options: ['Up', 'Down', 'Up / down', 'Random'] },
  { key: 'rate', defaultValue: 2, min: 0, max: 3, step: 1, label: 'Rate', options: ['1/4', '1/8', '1/16', '1/32'] },
  { key: 'span', defaultValue: 2, min: 1, max: 4, step: 1, label: 'Span', unit: 'oct', control: 'stepper' },
  { key: 'gate', defaultValue: 68, min: 5, max: 100, step: 1, label: 'Gate', unit: '%', control: 'knob' },
  { key: 'followChords', defaultValue: 1, min: 0, max: 1, step: 1, label: 'Follow chords', options: ['Off', 'On'], control: 'switch' },
  { key: 'octave', defaultValue: 3, min: 1, max: 6, step: 1, label: 'Octave', control: 'stepper' },
];

function directionOrder(pitches: readonly number[], direction: number): readonly number[] {
  if (direction === 1) return [...pitches].reverse();
  if (direction === 2 && pitches.length > 1) return [...pitches, ...pitches.slice(1, -1).reverse()];
  return pitches;
}

export const arpGenerator: Generator<ArpParams> = {
  id: 'arp',
  defaults: { direction: 0, rate: 2, span: 2, gate: 68, followChords: 1, octave: 3 },
  paramSchema: arpParamSchema,
  generate(seed, params, context) {
    const random = sfc32(seed);
    const rate = STEP_RATES[params.rate] ?? 1;
    const lengthSteps = Math.max(16, context.bars * 16);
    const fallbackPitches = diatonicChord(context.key, 0, 'seventh', params.octave);
    const chordEvents = params.followChords === 1 && context.chords !== undefined && context.chords.length > 0
      ? context.chords
      : [{ startStep: 0, durationSteps: lengthSteps, pitches: fallbackPitches }];
    const events = [];
    for (const chord of chordEvents) {
      const expanded = Array.from({ length: params.span }, (_, octave) => chord.pitches.map((pitch) => pitch + octave * 12))
        .flat()
        .filter((pitch) => pitch <= 127);
      const ordered = directionOrder(expanded, params.direction);
      const end = Math.min(lengthSteps, chord.startStep + chord.durationSteps);
      let noteIndex = 0;
      for (let step = chord.startStep; step < end; step += rate) {
        const pitch = params.direction === 3
          ? expanded[Math.floor(random() * expanded.length)]!
          : ordered[noteIndex % ordered.length]!;
        events.push({
          startStep: step,
          durationSteps: Math.max(0.05, rate * params.gate / 100),
          pitch,
          velocity: 82 + Math.floor(random() * 18),
        });
        noteIndex += 1;
      }
    }
    return sortedPattern(lengthSteps, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
