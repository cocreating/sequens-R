import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModuleType, MusicalKey, NoteEvent, Pattern, ScaleName } from '../src/lib/core/pattern';
import { SCALE_INTERVALS } from '../src/lib/core/theory/scales';
import { soundForPreset, type RackMixState } from '../src/lib/audio/sound';
import { createProject, projectToJson, type ProjectDocument } from '../src/lib/project/model';
import { createModule, type PatternSlot, type RackModule, type RackState } from '../src/lib/state/rack';

type SoundModuleType = Exclude<ModuleType, 'mixer' | 'cc' | 'mod'>;

interface ModuleSpec {
  type: Exclude<SoundModuleType, 'drums' | 'piano'>;
  name: string;
  seed: number;
  params: Record<string, number>;
  presetId: string;
  level: number;
  pan?: number;
  delaySend?: number;
  reverbSend?: number;
}

interface DrumSpec {
  name: string;
  seed: number;
  steps: 16 | 32;
  groove: number;
  swing: number;
  humanize: number;
  lanes: readonly (readonly number[])[];
  presetId: string;
  level: number;
  delaySend?: number;
  reverbSend?: number;
}

interface PianoSpec {
  name: string;
  seed: number;
  length: 16 | 32 | 64;
  events: readonly NoteEvent[];
  presetId: string;
  level: number;
  pan?: number;
  delaySend?: number;
  reverbSend?: number;
}

interface DemoSpec {
  slug: string;
  name: string;
  description: string;
  bpm: number;
  key: MusicalKey;
  mix: RackMixState;
  drums: DrumSpec;
  modules: readonly ModuleSpec[];
  piano: PianoSpec;
}

const OUTPUT_DIR = resolve(process.cwd(), 'public/projects');
const CREATED_AT = Date.UTC(2026, 7, 27, 10, 0, 0);

const DEFAULT_COLORS: Readonly<Record<ModuleType, RackModule['color']>> = {
  drums: 'ember',
  bass: 'forest',
  acid: 'olive',
  chords: 'plum',
  mixer: 'graphite',
  arp: 'navy',
  euclid: 'teal',
  piano: 'indigo',
  cc: 'steel',
  mod: 'burgundy',
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashSeed(label: string): number {
  let hash = 0x811c9dc5;
  for (const character of label) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function uniqueSteps(steps: readonly number[], length: number): number[] {
  return [...new Set(steps.map((step) => ((Math.round(step) % length) + length) % length))].sort((left, right) => left - right);
}

function repeat16(steps: readonly number[]): number[] {
  return [...steps, ...steps.map((step) => step + 16)];
}

function laneMask(steps: readonly number[]): number {
  let mask = 0;
  for (const step of steps) mask = (mask | (1 << step)) >>> 0;
  return mask;
}

function pitch(key: MusicalKey, degree: number, octave: number): number {
  const intervals = SCALE_INTERVALS[key.scale];
  const normalizedDegree = ((degree % intervals.length) + intervals.length) % intervals.length;
  const octaveOffset = Math.floor(degree / intervals.length);
  return key.root + intervals[normalizedDegree]! + (octave + octaveOffset + 1) * 12;
}

function chord(key: MusicalKey, degree: number, octave: number, quality: 'triad' | 'seventh' | 'ninth' = 'triad'): number[] {
  const offsets = quality === 'triad' ? [0, 2, 4] : quality === 'seventh' ? [0, 2, 4, 6] : [0, 2, 4, 6, 8];
  return offsets.map((offset) => pitch(key, degree + offset, octave));
}

function note(startStep: number, notePitch: number, durationSteps: number, velocity: number, extras: Pick<NoteEvent, 'accent' | 'slide'> = {}): NoteEvent {
  return { startStep, pitch: notePitch, durationSteps, velocity, ...extras };
}

function sequence(
  notePitches: readonly number[],
  length: number,
  stride = 1,
  gate = 0.72,
  velocities: readonly number[] = [104, 82, 94, 76],
  timing: readonly number[] = [0],
): NoteEvent[] {
  const events: NoteEvent[] = [];
  for (let step = 0, index = 0; step < length; step += stride, index += 1) {
    const offset = timing[index % timing.length] ?? 0;
    events.push(note(Math.max(0, step + offset), notePitches[index % notePitches.length]!, stride * gate, velocities[index % velocities.length]!));
  }
  return events;
}

function chordStabs(
  key: MusicalKey,
  starts: readonly number[],
  degrees: readonly number[],
  quality: 'triad' | 'seventh' | 'ninth',
  duration: number,
  octave = 3,
): NoteEvent[] {
  return starts.flatMap((start, index) => chord(key, degrees[index % degrees.length]!, octave, quality).map((notePitch, voice) => (
    note(start + voice * 0.035, notePitch, Math.max(0.2, duration - voice * 0.035), 100 - voice * 6)
  )));
}

function pattern(lengthSteps: number, events: readonly NoteEvent[]): Pattern {
  return {
    lengthSteps,
    stepsPerBeat: 4,
    events: [...events]
      .filter((event) => event.startStep >= 0 && event.startStep < lengthSteps && event.pitch >= 0 && event.pitch <= 127)
      .sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch),
  };
}

function transformPattern(base: Pattern, transform: (event: NoteEvent, index: number) => NoteEvent | readonly NoteEvent[] | null): Pattern {
  return pattern(base.lengthSteps, base.events.flatMap((event, index) => {
    const transformed = transform({ ...event }, index);
    return transformed === null ? [] : Array.isArray(transformed) ? transformed : [transformed as NoteEvent];
  }));
}

function pianoPatterns(length: 16 | 32 | 64, events: readonly NoteEvent[]): Pattern[] {
  const base = pattern(length, events);
  return [
    base,
    transformPattern(base, (event) => ({ ...event, startStep: (event.startStep + 4) % length })),
    transformPattern(base, (event, index) => index % 2 === 0 ? { ...event, velocity: Math.max(42, event.velocity - 20), durationSteps: event.durationSteps * 1.2 } : null),
    transformPattern(base, (event, index) => index % 3 === 0 && event.pitch <= 115
      ? [event, { ...event, pitch: event.pitch + 12, velocity: Math.max(48, event.velocity - 18) }]
      : event),
    transformPattern(base, (event) => ({ ...event, velocity: Math.max(36, event.velocity - 28), durationSteps: Math.min(length, event.durationSteps * 1.45) })),
    transformPattern(base, (event, index) => ({ ...event, pitch: clamp(event.pitch + (index % 4 === 0 ? 12 : 0), 0, 127) })),
    transformPattern(base, (event, index) => index % 3 !== 1 ? { ...event, startStep: (event.startStep + 8) % length } : null),
    transformPattern(base, (event, index) => ({
      ...event,
      startStep: Math.min(length - 0.01, event.startStep + (index % 2 === 0 ? 0 : 0.12)),
      velocity: clamp(event.velocity + (index % 4 === 0 ? 12 : -4), 1, 127),
    })),
  ];
}

function genericParamVariants(type: ModuleSpec['type'], params: Record<string, number>): Record<string, number>[] {
  if (type === 'bass') return [
    params,
    { ...params, density: clamp(params.density + 14, 0, 100), gate: clamp(params.gate - 12, 5, 100) },
    { ...params, density: Math.round(params.density * 0.42), gate: clamp(params.gate + 18, 5, 100) },
    { ...params, density: clamp(params.density + 28, 0, 100), drive: clamp(params.drive + 20, 0, 100), range: clamp(params.range + 1, 1, 3) },
    { ...params, density: Math.round(params.density * 0.65), octave: clamp(params.octave - 1, 1, 4) },
    { ...params, style: (params.style + 1) % 6 },
    { ...params, style: (params.style + 2) % 6, density: clamp(params.density + 8, 0, 100) },
    { ...params, style: (params.style + 5) % 6, gate: clamp(params.gate - 20, 5, 100) },
  ];
  if (type === 'acid') return [
    params,
    { ...params, fill: clamp(params.fill + 12, 0, 100), decay: clamp(params.decay - 8, 0, 100) },
    { ...params, fill: Math.round(params.fill * 0.35), decay: clamp(params.decay + 24, 0, 100) },
    { ...params, fill: clamp(params.fill + 28, 0, 100), range: clamp(params.range + 1, 1, 3) },
    { ...params, fill: Math.round(params.fill * 0.58) },
    { ...params, decay: clamp(params.decay + 18, 0, 100) },
    { ...params, fill: clamp(params.fill + 6, 0, 100), range: 1 },
    { ...params, fill: clamp(params.fill + 20, 0, 100), decay: clamp(params.decay - 18, 0, 100) },
  ];
  if (type === 'chords') return [
    params,
    { ...params, strum: clamp(params.strum + 18, 0, 100) },
    { ...params, strum: clamp(params.strum + 38, 0, 100), quality: params.quality === 2 ? 1 : params.quality },
    { ...params, strum: clamp(params.strum - 8, 0, 100), quality: clamp(params.quality + 1, 0, 4) },
    { ...params, quality: params.quality === 0 ? 3 : params.quality },
    { ...params, quality: params.quality === 0 ? 4 : params.quality, strum: clamp(params.strum + 10, 0, 100) },
    { ...params, length: clamp(params.length - 1, 1, 8) },
    { ...params, length: clamp(params.length + 1, 1, 8), strum: clamp(params.strum + 28, 0, 100) },
  ];
  if (type === 'arp') return [
    params,
    { ...params, direction: (params.direction + 2) % 4, gate: clamp(params.gate - 10, 5, 100) },
    { ...params, rate: clamp(params.rate - 1, 0, 3), span: clamp(params.span - 1, 1, 4), gate: clamp(params.gate + 18, 5, 100) },
    { ...params, rate: clamp(params.rate + 1, 0, 3), span: clamp(params.span + 1, 1, 4), gate: clamp(params.gate - 18, 5, 100) },
    { ...params, direction: 3, rate: clamp(params.rate - 1, 0, 3) },
    { ...params, direction: 0, span: clamp(params.span + 1, 1, 4) },
    { ...params, direction: 1, gate: clamp(params.gate + 10, 5, 100) },
    { ...params, direction: 3, rate: 3, gate: clamp(params.gate - 24, 5, 100) },
  ];
  const euclid = params;
  const normalized = (value: number, steps: number) => ((value % steps) + steps) % steps;
  return Array.from({ length: 8 }, (_, index) => ({
    ...euclid,
    rotation1: normalized(euclid.rotation1 + index, euclid.steps1),
    rotation2: normalized(euclid.rotation2 + index * 2, euclid.steps2),
    rotation3: normalized(euclid.rotation3 + index * 3, euclid.steps3),
    hits1: clamp(euclid.hits1 + (index === 3 ? 2 : index === 2 ? -2 : 0), 0, euclid.steps1),
    hits2: clamp(euclid.hits2 + (index === 3 ? 2 : index === 2 ? -1 : 0), 0, euclid.steps2),
    hits3: clamp(euclid.hits3 + (index === 3 ? 1 : index === 2 ? -1 : 0), 0, euclid.steps3),
  }));
}

function slotsForParams(slug: string, name: string, type: ModuleSpec['type'], params: Record<string, number>): PatternSlot[] {
  return genericParamVariants(type, params).map((variant, index) => ({
    seed: hashSeed(`${slug}:${name}:${index}`),
    params: { ...variant },
    handEdited: false,
    pattern: null,
  }));
}

function drumParamVariants(spec: DrumSpec): Record<string, number>[] {
  const length = spec.steps;
  const lanes = Array.from({ length: 8 }, (_, lane) => uniqueSteps(spec.lanes[lane] ?? [], length));
  const shifted = (steps: readonly number[], offset: number) => uniqueSteps(steps.map((step) => step + offset), length);
  const union = (...collections: readonly (readonly number[])[]) => uniqueSteps(collections.flat(), length);
  const allSteps = Array.from({ length }, (_, step) => step);
  const base = (variant: readonly (readonly number[])[], swing = spec.swing, humanize = spec.humanize): Record<string, number> => ({
    steps: length,
    groove: spec.groove,
    swing,
    humanize,
    overrideLanes: 255,
    ...Object.fromEntries(Array.from({ length: 8 }, (_, lane) => [`lane${lane}`, laneMask(variant[lane] ?? [])])),
  });
  return [
    base(lanes),
    base(lanes.map((lane, index) => index === 6 ? union(lane, [length - 6, length - 2]) : index === 7 ? union(lane, [length - 4, length - 3, length - 2, length - 1]) : lane)),
    base(lanes.map((lane, index) => index === 0 ? lane.filter((step) => step % 8 === 0) : index === 2 ? lane.filter((_, hit) => hit % 2 === 0) : index >= 3 ? [] : lane), Math.round(spec.swing * 0.7), Math.round(spec.humanize * 0.65)),
    base(lanes.map((lane, index) => index === 2 ? union(lane, allSteps.filter((step) => step % 2 === 0)) : index === 4 ? union(lane, [length - 12, length - 4]) : index === 7 ? union(lane, [length - 4, length - 3, length - 2, length - 1]) : lane)),
    base(lanes.map((lane, index) => index >= 5 ? shifted(lane, 1) : lane)),
    base(lanes.map((lane, index) => index === 3 ? union(lane, allSteps.filter((step) => step % 8 === 6)) : index === 6 ? shifted(lane, 2) : lane)),
    base(lanes.map((lane, index) => index === 0 || index === 1 ? lane : index === 2 ? lane.filter((step) => step % 4 === 2) : []), Math.round(spec.swing * 0.5), 0),
    base(lanes.map((lane, index) => index === 1 ? union(lane, [length - 4, length - 2]) : index === 6 || index === 7 ? union(lane, [length - 6, length - 5, length - 3, length - 2, length - 1]) : lane)),
  ];
}

function decorateModule(module: RackModule, slug: string, index: number, name: string, level: number): RackModule {
  return {
    ...module,
    id: `${module.type}-${slug}-${index + 1}`,
    name,
    color: DEFAULT_COLORS[module.type],
    mutation: { on: false, intensity: 2, everyNLoops: 4, revert: null },
    collapsed: false,
    mute: false,
    solo: false,
    monitor: true,
    level,
    automation: [],
  };
}

function createDrums(slug: string, spec: DrumSpec, index: number): RackModule {
  const variants = drumParamVariants(spec);
  const slots = variants.map((params, slotIndex): PatternSlot => ({
    seed: hashSeed(`${slug}:${spec.name}:${slotIndex}`), params, handEdited: false, pattern: null,
  }));
  const module = createModule('drums', spec.seed, variants[0], soundForPreset('drums', spec.presetId, {
    pan: 0,
    delaySend: spec.delaySend ?? 0,
    reverbSend: spec.reverbSend ?? 0,
  }));
  return {
    ...decorateModule(module, slug, index, spec.name, spec.level),
    seed: slots[0]!.seed,
    params: { ...slots[0]!.params },
    slots,
  };
}

function createGeneratedModule(slug: string, spec: ModuleSpec, index: number): RackModule {
  const slots = slotsForParams(slug, spec.name, spec.type, spec.params);
  const module = createModule(spec.type, spec.seed, spec.params, soundForPreset(spec.type, spec.presetId, {
    pan: spec.pan ?? 0,
    delaySend: spec.delaySend ?? 0,
    reverbSend: spec.reverbSend ?? 0,
  }));
  return {
    ...decorateModule(module, slug, index, spec.name, spec.level),
    seed: slots[0]!.seed,
    params: { ...slots[0]!.params },
    slots,
  };
}

function createPiano(slug: string, spec: PianoSpec, index: number): RackModule {
  const lengthIndex = spec.length === 16 ? 0 : spec.length === 32 ? 1 : 2;
  const params = { length: lengthIndex, inKey: 1 };
  const patterns = pianoPatterns(spec.length, spec.events);
  const slots = patterns.map((slotPattern, slotIndex): PatternSlot => ({
    seed: hashSeed(`${slug}:${spec.name}:${slotIndex}`),
    params: { ...params },
    handEdited: true,
    pattern: slotPattern,
  }));
  const module = createModule('piano', spec.seed, params, soundForPreset('piano', spec.presetId, {
    pan: spec.pan ?? 0,
    delaySend: spec.delaySend ?? 0,
    reverbSend: spec.reverbSend ?? 0,
  }));
  return {
    ...decorateModule(module, slug, index, spec.name, spec.level),
    seed: slots[0]!.seed,
    params,
    slots,
    shareable: false,
  };
}

function buildProject(spec: DemoSpec): ProjectDocument {
  const modules: RackModule[] = [];
  modules.push(createDrums(spec.slug, spec.drums, modules.length));
  for (const moduleSpec of spec.modules) modules.push(createGeneratedModule(spec.slug, moduleSpec, modules.length));
  modules.push(createPiano(spec.slug, spec.piano, modules.length));
  if (modules.length > 3) throw new RangeError(`${spec.name} exceeds the three-module demo limit.`);

  const rackId = `rack-${spec.slug}`;
  const rack: RackState = { bpm: spec.bpm, key: spec.key, modules, mix: spec.mix };
  const project = createProject(rack, spec.name);
  const assignments = (slot: number): Record<string, number> => Object.fromEntries(modules.map((module) => [module.id, slot]));
  return {
    ...project,
    id: `demo-project-${spec.slug}`,
    racks: [{ id: rackId, name: `${spec.name} Rack`, state: rack }],
    activeRackId: rackId,
    scenes: [
      { id: `scene-${spec.slug}-intro`, name: 'Intro', assignments: assignments(4) },
      { id: `scene-${spec.slug}-main`, name: 'Main', assignments: assignments(0) },
      { id: `scene-${spec.slug}-variation`, name: 'Variation', assignments: assignments(1) },
      { id: `scene-${spec.slug}-peak`, name: 'Peak', assignments: assignments(3) },
    ],
    settings: { genre: spec.name, demo: true },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

const key = (root: number, scale: ScaleName): MusicalKey => ({ root, scale });
const mix = (delayDivision: number, delayFeedback: number, delayReturn: number, reverbReturn: number, masterCharacter: number): RackMixState => ({
  delayDivision, delayFeedback, delayReturn, reverbReturn, masterCharacter,
});

const DETROIT = key(6, 'minor');
const HOUSE = key(9, 'minor');
const TRANCE = key(2, 'harmonicMinor');
const SYNTHWAVE = key(4, 'minor');
const DUBSTEP = key(0, 'phrygian');
const AMBIENT = key(3, 'lydian');
const ELECTRO = key(4, 'blues');
const HARDSTYLE = key(5, 'harmonicMinor');
const DNB = key(2, 'minor');
const DISCO = key(7, 'mixolydian');

const demos: readonly DemoSpec[] = [
  {
    slug: 'detroit-minimal-techno',
    name: 'Detroit Minimal Techno',
    description: '132 BPM F♯ minor: a minimal locked drum grid, micro-timed mono pulse, and one resonant acid line.',
    bpm: 132,
    key: DETROIT,
    mix: mix(4, 38, 18, 10, 42),
    drums: {
      name: '909 Grid', seed: 0x13200101, steps: 32, groove: 3, swing: 8, humanize: 7,
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([2, 6, 10, 14]), repeat16([6, 14]), repeat16([12]), repeat16([3, 11]), repeat16([7]), [15, 31]],
      presetId: 'drums-core-v2', level: 0.74, reverbSend: 5,
    },
    modules: [
      { type: 'acid', name: 'Resonant Wire', seed: 0x13200103, params: { fill: 46, steps: 16, range: 2, decay: 24 }, presetId: 'acid-sharp-v2', level: 0.38, pan: -12, delaySend: 18 },
    ],
    piano: {
      name: 'Micro Pulse', seed: 0x13200105, length: 32,
      events: sequence([pitch(DETROIT, 0, 3), pitch(DETROIT, 0, 3), pitch(DETROIT, 2, 3), pitch(DETROIT, 0, 3), pitch(DETROIT, 4, 3), pitch(DETROIT, 0, 3), pitch(DETROIT, 5, 3), pitch(DETROIT, 4, 3)], 32, 1, 0.42, [112, 72, 94, 66, 104, 74, 88, 70], [0, 0.04, -0.03, 0.08]),
      presetId: 'piano-muted-v2', level: 0.38, pan: 8, delaySend: 12,
    },
  },
  {
    slug: 'deep-tech-house',
    name: 'Deep Tech House',
    description: '125 BPM A minor: a spare swung four-on-the-floor, deep pocket bass, and upbeat minor-7 piano stabs.',
    bpm: 125,
    key: HOUSE,
    mix: mix(2, 44, 20, 22, 28),
    drums: {
      name: 'Club Drums', seed: 0x12500201, steps: 32, groove: 0, swing: 34, humanize: 12,
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([0, 2, 4, 6, 8, 10, 12, 14]), repeat16([2, 6, 10, 14]), repeat16([4, 12]), repeat16([7, 15]), repeat16([3, 11]), [14, 30]],
      presetId: 'drums-core-v2', level: 0.72, reverbSend: 8,
    },
    modules: [
      { type: 'bass', name: 'Deep Pocket', seed: 0x12500202, params: { style: 4, steps: 16, range: 1, density: 52, drive: 18, octave: 2, gate: 62 }, presetId: 'bass-deep-v2', level: 0.57 },
    ],
    piano: {
      name: 'Upbeat Stabs', seed: 0x12500205, length: 32,
      events: chordStabs(HOUSE, [2.18, 6.18, 10.18, 14.18, 18.18, 22.18, 26.18, 30.18], [0, 0, 5, 3, 0, 0, 4, 3], 'seventh', 1.15, 3),
      presetId: 'piano-tine-v2', level: 0.48, pan: 10, delaySend: 14, reverbSend: 10,
    },
  },
  {
    slug: 'euphoric-trance',
    name: 'Euphoric Trance',
    description: '142 BPM D harmonic minor: a lean driving rhythm, high triad run, and one three-octave crystal arp.',
    bpm: 142,
    key: TRANCE,
    mix: mix(2, 58, 34, 38, 34),
    drums: {
      name: 'Trance Drive', seed: 0x14200301, steps: 32, groove: 0, swing: 0, humanize: 2,
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), Array.from({ length: 32 }, (_, step) => step), repeat16([2, 6, 10, 14]), repeat16([4, 12]), repeat16([14]), repeat16([7, 15]), [28, 29, 30, 31]],
      presetId: 'drums-core-v2', level: 0.73, reverbSend: 12,
    },
    modules: [
      { type: 'arp', name: 'Crystal Runner', seed: 0x14200304, params: { direction: 2, rate: 2, span: 3, gate: 58, followChords: 0, octave: 4 }, presetId: 'arp-crystal-v2', level: 0.25, pan: 14, delaySend: 42, reverbSend: 26 },
    ],
    piano: {
      name: 'High Triad Run', seed: 0x14200305, length: 32,
      events: [0, 5, 3, 4].flatMap((degree, block) => {
        const tones = chord(TRANCE, degree, 4, 'triad');
        const order = [tones[0]!, tones[2]!, tones[1]!, tones[2]!, tones[0]! + 12, tones[2]!, tones[1]!, tones[2]!];
        return order.map((notePitch, index) => note(block * 8 + index, notePitch, 0.7, [110, 84, 96, 82][index % 4]!));
      }),
      presetId: 'piano-bright-v2', level: 0.39, pan: 8, delaySend: 36, reverbSend: 28,
    },
  },
  {
    slug: 'neon-synthwave',
    name: 'Neon Synthwave',
    description: '108 BPM E minor: a minimal gated drum machine, root–fifth–octave pulse, and simple eighth-note arp.',
    bpm: 108,
    key: SYNTHWAVE,
    mix: mix(2, 46, 24, 30, 46),
    drums: {
      name: 'Retro Machine', seed: 0x10800401, steps: 32, groove: 3, swing: 5, humanize: 8,
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([0, 2, 4, 6, 8, 10, 12, 14]), repeat16([6, 14]), repeat16([4, 12]), repeat16([10]), repeat16([3, 11]), [15, 31]],
      presetId: 'drums-electro-v2', level: 0.7, reverbSend: 18,
    },
    modules: [
      { type: 'arp', name: 'Neon Eighths', seed: 0x10800404, params: { direction: 2, rate: 1, span: 1, gate: 54, followChords: 0, octave: 4 }, presetId: 'arp-copper-v2', level: 0.28, pan: 15, delaySend: 26, reverbSend: 16 },
    ],
    piano: {
      name: 'Root Fifth Octave', seed: 0x10800405, length: 32,
      events: sequence([pitch(SYNTHWAVE, 0, 2), pitch(SYNTHWAVE, 4, 2), pitch(SYNTHWAVE, 0, 3), pitch(SYNTHWAVE, 4, 2)], 32, 2, 0.74, [112, 88, 104, 82]),
      presetId: 'piano-dark-v2', level: 0.34, pan: 4, delaySend: 8, reverbSend: 12,
    },
  },
  {
    slug: 'halftime-dubstep-trap',
    name: 'Halftime Dubstep Trap',
    description: '150 BPM C phrygian: a stripped half-time groove, sparse sub pressure, and short fractured top-line bursts.',
    bpm: 150,
    key: DUBSTEP,
    mix: mix(3, 52, 20, 18, 62),
    drums: {
      name: 'Half-Time Weight', seed: 0x15000501, steps: 32, groove: 4, swing: 18, humanize: 9,
      lanes: [[0, 11, 16, 19, 27], [8, 24], [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30], [6, 14, 22, 30], [8, 24], [15, 31], [5, 13, 21, 29], [14, 15, 30, 31]],
      presetId: 'drums-halftime-v2', level: 0.77, reverbSend: 8,
    },
    modules: [
      { type: 'bass', name: 'Sub Pressure', seed: 0x15000502, params: { style: 4, steps: 32, range: 1, density: 24, drive: 12, octave: 1, gate: 100 }, presetId: 'bass-sub-v2', level: 0.64 },
    ],
    piano: {
      name: 'Fractured Top Line', seed: 0x15000506, length: 32,
      events: [note(3, pitch(DUBSTEP, 0, 5), 0.32, 112, { slide: true }), note(3.5, pitch(DUBSTEP, 1, 5), 0.25, 82), note(7, pitch(DUBSTEP, 4, 5), 0.5, 96), note(15, pitch(DUBSTEP, 2, 6), 0.25, 118), note(15.5, pitch(DUBSTEP, 1, 6), 0.2, 88), note(23, pitch(DUBSTEP, 0, 5), 0.6, 104), note(27, pitch(DUBSTEP, 5, 5), 0.25, 110), note(27.5, pitch(DUBSTEP, 4, 5), 0.2, 78)],
      presetId: 'piano-bell-v2', level: 0.27, pan: 12, delaySend: 38, reverbSend: 18,
    },
  },
  {
    slug: 'ambient-idm-polymeter',
    name: 'Ambient IDM Polymeter',
    description: '82 BPM E♭ lydian: sparse dust, one 5/7/9 Euclidean polymeter, and long overlapping piano lights.',
    bpm: 82,
    key: AMBIENT,
    mix: mix(0, 68, 44, 68, 18),
    drums: {
      name: 'Sparse Dust', seed: 0x08200601, steps: 32, groove: 5, swing: 22, humanize: 28,
      lanes: [[0, 13, 23], [9, 25], [2, 7, 15, 20, 28], [11, 27], [18], [5, 21], [3, 14, 30], [12, 29]],
      presetId: 'drums-odd-v2', level: 0.31, delaySend: 12, reverbSend: 42,
    },
    modules: [
      { type: 'euclid', name: 'Five Seven Nine', seed: 0x08200604, params: { steps1: 5, hits1: 2, rotation1: 1, note1: 51, steps2: 7, hits2: 3, rotation2: 2, note2: 58, steps3: 9, hits3: 4, rotation3: 0, note3: 63, separateChannels: 0 }, presetId: 'euclid-tide-v2', level: 0.27, pan: 22, delaySend: 38, reverbSend: 58 },
    ],
    piano: {
      name: 'Overlapping Lights', seed: 0x08200606, length: 64,
      events: [
        note(0, pitch(AMBIENT, 0, 3), 22, 62), note(5.25, pitch(AMBIENT, 4, 3), 18, 48), note(12.5, pitch(AMBIENT, 2, 4), 25, 57),
        note(21.75, pitch(AMBIENT, 6, 3), 20, 43), note(31, pitch(AMBIENT, 3, 4), 26, 66), note(40.25, pitch(AMBIENT, 1, 4), 18, 51),
        note(49.5, pitch(AMBIENT, 5, 4), 14, 59), note(57.25, pitch(AMBIENT, 0, 5), 10, 46),
      ],
      presetId: 'piano-tremolo-v2', level: 0.38, pan: -6, delaySend: 44, reverbSend: 68,
    },
  },
  {
    slug: 'electro-funk-machine',
    name: 'Electro Funk Machine',
    description: '126 BPM E blues: a compact syncopated machine beat, scorched acid snap, and staccato low-register riff.',
    bpm: 126,
    key: ELECTRO,
    mix: mix(4, 40, 18, 12, 58),
    drums: {
      name: 'Voltage Funk', seed: 0x12600701, steps: 32, groove: 3, swing: 16, humanize: 8,
      lanes: [repeat16([0, 3, 7, 10, 14]), repeat16([4, 12]), repeat16([0, 2, 5, 8, 10, 13]), repeat16([6, 14]), repeat16([4, 11]), repeat16([2, 10]), repeat16([3, 9, 15]), [14, 15, 30, 31]],
      presetId: 'drums-electro-v2', level: 0.76, reverbSend: 6,
    },
    modules: [
      { type: 'acid', name: 'Bar-One Snap', seed: 0x12600703, params: { fill: 42, steps: 16, range: 2, decay: 22 }, presetId: 'acid-driven-v2', level: 0.36, pan: -15, delaySend: 10 },
    ],
    piano: {
      name: 'Staccato Voltage', seed: 0x12600705, length: 32,
      events: [0, 3, 6, 10, 12, 15, 19, 22, 26, 27, 30].map((start, index) => note(start, [pitch(ELECTRO, 0, 2), pitch(ELECTRO, 2, 2), pitch(ELECTRO, 3, 2), pitch(ELECTRO, 5, 2)][index % 4]!, 0.38, index % 4 === 0 ? 122 : 92, { accent: index % 4 === 0 })),
      presetId: 'piano-muted-v2', level: 0.35, pan: 9, delaySend: 12,
    },
  },
  {
    slug: 'hardstyle-overdrive',
    name: 'Hardstyle Overdrive',
    description: '156 BPM F harmonic minor: a direct zero-swing kick grid, driven octave bass, and one fast minor-key charge.',
    bpm: 156,
    key: HARDSTYLE,
    mix: mix(4, 32, 12, 24, 82),
    drums: {
      name: 'Hard Kick Grid', seed: 0x15600801, steps: 32, groove: 3, swing: 0, humanize: 0,
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), Array.from({ length: 32 }, (_, step) => step), repeat16([2, 6, 10, 14]), repeat16([4, 12]), repeat16([3, 7, 11, 15]), repeat16([1, 5, 9, 13]), [12, 13, 14, 15, 28, 29, 30, 31]],
      presetId: 'drums-electro-v2', level: 0.82, reverbSend: 8,
    },
    modules: [
      { type: 'bass', name: 'Clipped Octaves', seed: 0x15600802, params: { style: 5, steps: 32, range: 3, density: 76, drive: 88, octave: 2, gate: 42 }, presetId: 'bass-driven-v2', level: 0.56 },
    ],
    piano: {
      name: 'Minor Octave Charge', seed: 0x15600806, length: 32,
      events: sequence([pitch(HARDSTYLE, 0, 4), pitch(HARDSTYLE, 2, 4), pitch(HARDSTYLE, 4, 5), pitch(HARDSTYLE, 6, 4), pitch(HARDSTYLE, 5, 5), pitch(HARDSTYLE, 4, 4), pitch(HARDSTYLE, 2, 5), pitch(HARDSTYLE, 1, 4)], 32, 1, 0.54, [118, 96, 110, 92]),
      presetId: 'piano-bright-v2', level: 0.31, pan: 10, delaySend: 24, reverbSend: 20,
    },
  },
  {
    slug: 'jungle-drum-and-bass',
    name: 'Jungle Drum & Bass',
    description: '174 BPM D minor: a focused hand-shaped breakbeat, rolling Reese bass, and one shifting melodic hook.',
    bpm: 174,
    key: DNB,
    mix: mix(4, 48, 22, 16, 66),
    drums: {
      name: 'Jungle Break', seed: 0x17400901, steps: 32, groove: 1, swing: 12, humanize: 14,
      lanes: [[0, 10, 16, 19, 26], [4, 12, 20, 28, 31], [0, 2, 5, 7, 8, 11, 14, 16, 18, 21, 23, 24, 27, 30], [6, 15, 22, 31], [12, 28], [9, 25], [3, 13, 19, 29], [7, 14, 23, 30]],
      presetId: 'drums-broken-v2', level: 0.78, reverbSend: 7,
    },
    modules: [
      { type: 'bass', name: 'Rolling Reese', seed: 0x17400902, params: { style: 3, steps: 32, range: 2, density: 62, drive: 56, octave: 1, gate: 78 }, presetId: 'bass-animated-v2', level: 0.6 },
    ],
    piano: {
      name: 'Shifting Hook', seed: 0x17400905, length: 32,
      events: [0, 2, 3, 6, 8, 11, 14, 15, 18, 20, 23, 24, 27, 29, 30].map((start, index) => note(start, [pitch(DNB, 0, 4), pitch(DNB, 4, 4), pitch(DNB, 2, 5), pitch(DNB, 6, 4), pitch(DNB, 3, 5)][index % 5]!, index % 3 === 0 ? 1.2 : 0.56, index % 4 === 0 ? 114 : 86)),
      presetId: 'piano-tine-v2', level: 0.3, pan: 10, delaySend: 26, reverbSend: 14,
    },
  },
  {
    slug: 'nu-disco-night-drive',
    name: 'Nu-Disco Night Drive',
    description: '120 BPM G mixolydian: a light live-feel disco groove, fluid octave bass, and swung seventh-chord picking.',
    bpm: 120,
    key: DISCO,
    mix: mix(5, 42, 20, 24, 38),
    drums: {
      name: 'Live Disco Kit', seed: 0x12001001, steps: 32, groove: 0, swing: 46, humanize: 18,
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([0, 2, 4, 6, 8, 10, 12, 14]), repeat16([2, 6, 10, 14]), repeat16([4, 12]), repeat16([7, 15]), repeat16([3, 11]), [14, 15, 30, 31]],
      presetId: 'drums-latin-v2', level: 0.69, reverbSend: 14,
    },
    modules: [
      { type: 'bass', name: 'Octave Glide', seed: 0x12001002, params: { style: 1, steps: 32, range: 2, density: 62, drive: 20, octave: 2, gate: 54 }, presetId: 'bass-pluck-v2', level: 0.55 },
    ],
    piano: {
      name: 'Swing Pick', seed: 0x12001005, length: 32,
      events: Array.from({ length: 16 }, (_, index) => {
        const degree = [0, 0, 3, 4][Math.floor(index / 4) % 4]!;
        const tones = chord(DISCO, degree, 3, 'seventh');
        const start = index * 2 + (index % 2 === 1 ? 0.28 : 0);
        return note(start, tones[index % tones.length]!, 1.15, index % 4 === 0 ? 112 : 88);
      }),
      presetId: 'piano-tine-v2', level: 0.42, pan: 8, delaySend: 18, reverbSend: 14,
    },
  },
];

for (const demo of demos) {
  const project = buildProject(demo);
  writeFileSync(resolve(OUTPUT_DIR, `${demo.slug}.sequens-r.json`), projectToJson(project), 'utf8');
}

const legacyProjects = [
  {
    name: 'Basic Electro',
    file: 'basic-electro.sequens-r.json',
    description: 'A 110 BPM C minor demo with Drums and Arp modules.',
  },
  {
    name: 'Basic Electro 2',
    file: 'basic-electro2.sequens-r.json',
    description: 'A 110 BPM C minor demo featuring Mixer, Bass, Drums, and Arp modules.',
  },
] as const;

writeFileSync(resolve(OUTPUT_DIR, 'index.json'), `${JSON.stringify({
  projects: [
    ...demos.map(({ name, slug, description }) => ({ name, file: `${slug}.sequens-r.json`, description })),
    ...legacyProjects,
  ],
}, null, 2)}\n`, 'utf8');

console.log(`Generated ${demos.length} demo projects in ${OUTPUT_DIR}.`);
