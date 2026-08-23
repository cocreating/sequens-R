import type { MusicalContext, NoteEvent, Pattern } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { scalePitch } from '../core/theory/scales';

export function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

export function sortedPattern(lengthSteps: number, events: readonly NoteEvent[]): Pattern {
  return {
    lengthSteps,
    stepsPerBeat: 4,
    events: [...events].sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch),
  };
}

export function mutationSeed(seed: number, intensity: 1 | 2 | 3 | 4): number {
  const random = sfc32((seed ^ Math.imul(intensity, 0x9e3779b9)) >>> 0);
  return Math.floor(random() * 0x100000000) >>> 0;
}

export function melodicPitch(context: MusicalContext, degree: number, octave: number): number {
  return clampMidi(scalePitch(context.key, degree, octave));
}
