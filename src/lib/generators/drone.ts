import type { Generator, MusicalContext, NoteEvent, ParamSchema, Pattern } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { mutationSeed, sortedPattern } from './shared';
import { scalePitch } from '../core/theory/scales';

export interface DroneParams {
  field: number;
  bars: number;
  voices: number;
  octave: number;
  spread: number;
  change: number;
  tension: number;
}

export const DRONE_BAR_OPTIONS = [1, 2, 4, 8] as const;

const FIELD_DEGREES = [
  [0, 4, 7, 9],
  [0, 4, 8, 12],
  [0, 3, 4, 8],
  [0, 1, 2, 3],
  [0, -3, 4, 7],
  [0, 2, 5, 9],
] as const;

const FIELD_MOVEMENTS = [
  [-1, 0, 1],
  [-2, 0, 2],
  [-1, 1, 3],
  [-1, 1],
  [-2, -1, 1],
  [-2, -1, 1, 2],
] as const;

const FIELD_CHANGE_SCALE = [0.22, 0.45, 0.55, 0.68, 0.5, 1] as const;

export const droneParamSchema: ParamSchema = [
  { key: 'field', defaultValue: 0, min: 0, max: 5, step: 1, label: 'Field', options: ['Rooted', 'Open fifths', 'Suspended', 'Cluster', 'Undertones', 'Wandering'] },
  { key: 'bars', defaultValue: 2, min: 0, max: 3, step: 1, label: 'Cycle', options: ['1 bar', '2 bars', '4 bars', '8 bars'] },
  { key: 'voices', defaultValue: 3, min: 2, max: 4, step: 1, label: 'Voices', control: 'stepper' },
  { key: 'octave', defaultValue: 3, min: 1, max: 5, step: 1, label: 'Register', control: 'stepper' },
  { key: 'spread', defaultValue: 68, min: 0, max: 100, step: 1, label: 'Spread', unit: '%', control: 'knob' },
  { key: 'change', defaultValue: 24, min: 0, max: 100, step: 1, label: 'Changes', unit: '%', control: 'knob' },
  { key: 'tension', defaultValue: 18, min: 0, max: 100, step: 1, label: 'Tension', unit: '%', control: 'knob' },
];

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function pitchForDegree(context: MusicalContext, degree: number, octave: number): number {
  return clampMidi(scalePitch(context.key, degree, octave));
}

function spreadOctave(lane: number, voices: number, spread: number): number {
  if (lane === 0 || voices <= 1) return 0;
  return Math.round(lane / (voices - 1) * spread / 100 * 2);
}

function movedDegree(
  field: number,
  lane: number,
  previous: number,
  tension: number,
  random: () => number,
): number {
  const movements = FIELD_MOVEMENTS[field] ?? FIELD_MOVEMENTS[0]!;
  const base = FIELD_DEGREES[field]?.[lane] ?? lane * 2;
  const movement = movements[Math.floor(random() * movements.length)] ?? 0;
  let degree = field === 5 ? previous + movement : base + movement;
  if (random() * 100 < tension) degree += random() < 0.5 ? -1 : 1;
  return degree;
}

function eventFor(
  context: MusicalContext,
  lane: number,
  degree: number,
  octave: number,
  startStep: number,
  durationSteps: number,
  random: () => number,
): NoteEvent {
  return {
    startStep,
    durationSteps,
    pitch: pitchForDegree(context, degree, octave),
    velocity: Math.min(112, 72 + Math.floor(random() * 17) + (lane === 0 ? 8 : 0)),
    lane,
    accent: lane === 0,
  };
}

function generateDronePattern(seed: number, params: DroneParams, context: MusicalContext): Pattern {
  const random = sfc32(seed);
  const barCount = DRONE_BAR_OPTIONS[params.bars] ?? DRONE_BAR_OPTIONS[2];
  const lengthSteps = barCount * 16;
  const voices = Math.max(2, Math.min(4, Math.round(params.voices)));
  const field = Math.max(0, Math.min(FIELD_DEGREES.length - 1, Math.round(params.field)));
  const events: NoteEvent[] = [];

  for (let lane = 0; lane < voices; lane += 1) {
    const octave = params.octave + spreadOctave(lane, voices, params.spread);
    let degree = FIELD_DEGREES[field]?.[lane] ?? lane * 2;
    let startStep = 0;

    if (lane > 0) {
      for (let bar = 1; bar < barCount; bar += 1) {
        const changes = random() * 100 < params.change * (FIELD_CHANGE_SCALE[field] ?? 1);
        if (!changes) continue;
        const nextDegree = movedDegree(field, lane, degree, params.tension, random);
        const nextPitch = pitchForDegree(context, nextDegree, octave);
        const currentPitch = pitchForDegree(context, degree, octave);
        if (nextPitch === currentPitch) continue;
        const boundary = bar * 16;
        events.push(eventFor(context, lane, degree, octave, startStep, boundary - startStep, random));
        degree = nextDegree;
        startStep = boundary;
      }
    }

    events.push(eventFor(context, lane, degree, octave, startStep, lengthSteps - startStep, random));
  }

  return sortedPattern(lengthSteps, events);
}

function eventsForLane(pattern: Pattern, lane: number): NoteEvent[] {
  return pattern.events.filter((event) => event.lane === lane).map((event) => ({ ...event }));
}

function mutateDronePattern(base: Pattern, seed: number, intensity: 1 | 2 | 3 | 4, params: DroneParams, context: MusicalContext): Pattern {
  const candidate = generateDronePattern(mutationSeed(seed, intensity), params, context);
  if (intensity === 4 || base.lengthSteps !== candidate.lengthSteps || base.events.length === 0) return candidate;

  const anchor = eventsForLane(base, 0);
  if (intensity === 3) {
    return sortedPattern(base.lengthSteps, [...anchor, ...candidate.events.filter((event) => event.lane !== 0)]);
  }

  const lane = Math.min(params.voices - 1, intensity);
  if (intensity === 2) {
    const retained = base.events.filter((event) => event.lane !== lane).map((event) => ({ ...event }));
    return sortedPattern(base.lengthSteps, [...retained, ...eventsForLane(candidate, lane)]);
  }

  const events = base.events.map((event) => ({ ...event }));
  const index = events.findIndex((event) => event.lane === lane);
  if (index >= 0) {
    const source = candidate.events.find((event) => event.lane === lane);
    const velocity = source?.velocity === events[index]!.velocity
      ? Math.min(127, events[index]!.velocity + 1)
      : source?.velocity ?? events[index]!.velocity;
    events[index] = { ...events[index]!, velocity };
  }
  return sortedPattern(base.lengthSteps, events);
}

export const droneGenerator: Generator<DroneParams> = {
  id: 'drone',
  defaults: { field: 0, bars: 2, voices: 3, octave: 3, spread: 68, change: 24, tension: 18 },
  paramSchema: droneParamSchema,
  generate: generateDronePattern,
  mutate: mutateDronePattern,
};
