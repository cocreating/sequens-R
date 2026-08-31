import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModuleType, MusicalKey, NoteEvent, Pattern, ScaleName } from '../src/lib/core/pattern';
import { soundForPreset, type RackMixState } from '../src/lib/audio/sound';
import { createProject, projectToJson, type ProjectDocument } from '../src/lib/project/model';
import { createModule, type PatternSlot, type RackModule, type RackState } from '../src/lib/state/rack';
import { pianoMelodyPattern } from '../src/lib/ui/piano-melodies';
import { PIANO_PITCH_MAX, PIANO_PITCH_MIN, setPianoEventAccent, setPianoEventVelocity } from '../src/lib/ui/piano-roll-model';

type SoundModuleType = Exclude<ModuleType, 'mixer' | 'cc' | 'mod'>;
const DEMO_GENRES = ['Neoclassical Ambient', 'Post-Classical Minimalism', 'Melodic Electronica'] as const;
type DemoGenre = (typeof DEMO_GENRES)[number];

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
  melodyId: string;
  presetId: string;
  level: number;
  pan?: number;
  delaySend?: number;
  reverbSend?: number;
}

interface DemoSpec {
  slug: string;
  name: string;
  genre: DemoGenre;
  description: string;
  bpm: number;
  key: MusicalKey;
  mix: RackMixState;
  drums?: DrumSpec;
  modules: readonly ModuleSpec[];
  piano: PianoSpec;
}

const OUTPUT_DIR = resolve(process.cwd(), 'public/projects');
const CREATED_AT = Date.UTC(2026, 7, 28, 10, 0, 0);

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
  synth: 'cobalt',
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

function pianoPatterns(base: Pattern): Pattern[] {
  const length = base.lengthSteps;
  return [
    base,
    transformPattern(base, (event) => ({ ...event, startStep: (event.startStep + 4) % length })),
    transformPattern(base, (event, index) => index % 2 === 0
      ? { ...setPianoEventVelocity(event, event.velocity - 20), durationSteps: event.durationSteps * 1.2 }
      : null),
    transformPattern(base, (event, index) => index % 3 === 0
      ? [event, {
        ...setPianoEventVelocity(event, event.velocity - 18),
        pitch: clamp(event.pitch + (event.pitch <= 71 ? 12 : -12), PIANO_PITCH_MIN, PIANO_PITCH_MAX),
      }]
      : event),
    transformPattern(base, (event) => ({ ...setPianoEventVelocity(event, event.velocity - 28), durationSteps: Math.min(length, event.durationSteps * 1.45) })),
    transformPattern(base, (event, index) => ({ ...event, pitch: clamp(event.pitch + (index % 4 === 0 ? 12 : 0), PIANO_PITCH_MIN, PIANO_PITCH_MAX) })),
    transformPattern(base, (event, index) => index % 3 !== 1 ? { ...event, startStep: (event.startStep + 8) % length } : null),
    transformPattern(base, (event, index) => ({
      ...setPianoEventVelocity(event, event.velocity + (index % 4 === 0 ? 12 : -4)),
      startStep: Math.min(length - 0.01, event.startStep + (index % 2 === 0 ? 0 : 0.12)),
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

function createPiano(slug: string, spec: PianoSpec, key: MusicalKey, index: number): RackModule {
  const melodyPattern = pianoMelodyPattern(spec.melodyId, key);
  const basePattern: Pattern = {
    ...melodyPattern,
    events: melodyPattern.events.map((event) => event.accent ? setPianoEventAccent(event, true) : event),
  };
  const lengthIndex = basePattern.lengthSteps === 16 ? 0 : basePattern.lengthSteps === 32 ? 1 : 2;
  const params = { length: lengthIndex, inKey: 1 };
  const patterns = pianoPatterns(basePattern);
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
  if (spec.drums !== undefined) modules.push(createDrums(spec.slug, spec.drums, modules.length));
  for (const moduleSpec of spec.modules) modules.push(createGeneratedModule(spec.slug, moduleSpec, modules.length));
  modules.push(createPiano(spec.slug, spec.piano, spec.key, modules.length));
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
      { id: `scene-${spec.slug}-prelude`, name: 'Prelude', assignments: assignments(4) },
      { id: `scene-${spec.slug}-theme`, name: 'Theme', assignments: assignments(0) },
      { id: `scene-${spec.slug}-variation`, name: 'Variation', assignments: assignments(1) },
      { id: `scene-${spec.slug}-finale`, name: 'Finale', assignments: assignments(3) },
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

function gentleDrums(name: string, seed: number, swing = 16, presetId = 'drums-core-v2'): DrumSpec {
  return {
    name,
    seed,
    steps: 32,
    groove: swing > 24 ? 0 : 5,
    swing,
    humanize: 12,
    lanes: [[0, 16], [8, 24], [2, 10, 18, 26], [6, 14, 22, 30], [12, 28], [], [7, 23], [31]],
    presetId,
    level: 0.36,
    reverbSend: 18,
  };
}

const retiredDemoFiles = [
  'detroit-minimal-techno.sequens-r.json',
  'deep-tech-house.sequens-r.json',
  'euphoric-trance.sequens-r.json',
  'neon-synthwave.sequens-r.json',
  'halftime-dubstep-trap.sequens-r.json',
  'ambient-idm-polymeter.sequens-r.json',
  'electro-funk-machine.sequens-r.json',
  'hardstyle-overdrive.sequens-r.json',
  'jungle-drum-and-bass.sequens-r.json',
  'nu-disco-night-drive.sequens-r.json',
] as const;

const demos: readonly DemoSpec[] = [
  {
    slug: 'glass-invention',
    name: 'Glass Invention',
    genre: 'Post-Classical Minimalism',
    description: '96 BPM D dorian: an original Baroque-style broken-triad study for expressive Piano and a quiet answering arpeggio.',
    bpm: 96,
    key: key(2, 'dorian'),
    mix: mix(1, 52, 22, 54, 16),
    modules: [
      { type: 'arp', name: 'Answering Thread', seed: 0x09600102, params: { direction: 0, rate: 1, span: 1, gate: 72, followChords: 0, octave: 3 }, presetId: 'arp-soft-v2', level: 0.17, pan: -18, delaySend: 18, reverbSend: 34 },
    ],
    piano: {
      name: 'Invention Voice', seed: 0x09600105, melodyId: 'broken-triad-run',
      presetId: 'piano-tine-v2', level: 0.5, pan: 10, delaySend: 16, reverbSend: 42,
    },
  },
  {
    slug: 'moonlit-nocturne',
    name: 'Moonlit Nocturne',
    genre: 'Neoclassical Ambient',
    description: '66 BPM C♯ minor: a Romantic-style two-bar question with felt Piano dynamics over one slow dark harmony bed.',
    bpm: 66,
    key: key(1, 'minor'),
    mix: mix(0, 68, 32, 72, 10),
    modules: [
      { type: 'chords', name: 'Nocturne Veil', seed: 0x06600202, params: { length: 4, quality: 1, duration: 24, strum: 18 }, presetId: 'chords-dark-v2', level: 0.2, pan: -10, reverbSend: 62 },
    ],
    piano: {
      name: 'Nocturne Question', seed: 0x06600205, melodyId: 'two-bar-question',
      presetId: 'piano-dark-v2', level: 0.54, pan: 8, delaySend: 20, reverbSend: 58,
    },
  },
  {
    slug: 'pastoral-morning',
    name: 'Pastoral Morning',
    genre: 'Neoclassical Ambient',
    description: '82 BPM F major: a gentle Classical answer phrase, slow-bloom harmony, and only the lightest pastoral pulse.',
    bpm: 82,
    key: key(5, 'major'),
    mix: mix(1, 46, 18, 60, 12),
    drums: gentleDrums('Pastoral Pulse', 0x08200301, 22),
    modules: [
      { type: 'chords', name: 'Meadow Harmony', seed: 0x08200302, params: { length: 4, quality: 0, duration: 20, strum: 24 }, presetId: 'chords-pad-v2', level: 0.18, pan: -14, reverbSend: 52 },
    ],
    piano: {
      name: 'Morning Answer', seed: 0x08200305, melodyId: 'gentle-answer',
      presetId: 'piano-soft-v2', level: 0.5, pan: 8, delaySend: 12, reverbSend: 44,
    },
  },
  {
    slug: 'quiet-canon',
    name: 'Quiet Canon',
    genre: 'Post-Classical Minimalism',
    description: '88 BPM C major: an original sequential canon idea shared between a warm Piano theme and a restrained dew-pluck echo.',
    bpm: 88,
    key: key(0, 'major'),
    mix: mix(2, 58, 28, 64, 14),
    modules: [
      { type: 'arp', name: 'Canon Echo', seed: 0x08800402, params: { direction: 2, rate: 0, span: 1, gate: 84, followChords: 0, octave: 3 }, presetId: 'arp-soft-v2', level: 0.14, pan: -22, delaySend: 30, reverbSend: 48 },
    ],
    piano: {
      name: 'Canon Theme', seed: 0x08800405, melodyId: 'sequence-bloom',
      presetId: 'piano-core-v2', level: 0.51, pan: 8, delaySend: 18, reverbSend: 46,
    },
  },
  {
    slug: 'water-garden',
    name: 'Water Garden',
    genre: 'Neoclassical Ambient',
    description: '74 BPM D♭ lydian: an Impressionist color weave for shimmering Piano with one slow, irregular tide underneath.',
    bpm: 74,
    key: key(1, 'lydian'),
    mix: mix(0, 72, 40, 78, 8),
    modules: [
      { type: 'euclid', name: 'Garden Tide', seed: 0x07400502, params: { steps1: 7, hits1: 2, rotation1: 1, note1: 49, steps2: 9, hits2: 3, rotation2: 4, note2: 56, steps3: 11, hits3: 3, rotation3: 2, note3: 63, separateChannels: 0 }, presetId: 'euclid-tide-v2', level: 0.14, pan: -16, delaySend: 36, reverbSend: 68 },
    ],
    piano: {
      name: 'Reflected Colors', seed: 0x07400505, melodyId: 'color-weave',
      presetId: 'piano-bell-v2', level: 0.47, pan: 12, delaySend: 34, reverbSend: 68,
    },
  },
  {
    slug: 'velvet-sarabande',
    name: 'Velvet Sarabande',
    genre: 'Post-Classical Minimalism',
    description: '62 BPM G minor: a stately Baroque-style arch with soft Piano accents and a single velvet chordal shadow.',
    bpm: 62,
    key: key(7, 'minor'),
    mix: mix(1, 54, 18, 70, 10),
    modules: [
      { type: 'chords', name: 'Sarabande Shadow', seed: 0x06200602, params: { length: 3, quality: 1, duration: 24, strum: 32 }, presetId: 'chords-core-v2', level: 0.17, pan: -12, reverbSend: 56 },
    ],
    piano: {
      name: 'Sarabande Arch', seed: 0x06200605, melodyId: 'balanced-arch',
      presetId: 'piano-soft-v2', level: 0.53, pan: 9, delaySend: 12, reverbSend: 54,
    },
  },
  {
    slug: 'winter-largo',
    name: 'Winter Largo',
    genre: 'Neoclassical Ambient',
    description: '56 BPM E minor: a Piano-only slow movement that leaves velocity, accents, note length, and space fully exposed.',
    bpm: 56,
    key: key(4, 'minor'),
    mix: mix(0, 64, 24, 76, 6),
    modules: [],
    piano: {
      name: 'Frozen Beacon', seed: 0x05600705, melodyId: 'steady-beacon',
      presetId: 'piano-dark-v2', level: 0.58, pan: 0, delaySend: 18, reverbSend: 70,
    },
  },
  {
    slug: 'classical-allegretto',
    name: 'Classical Allegretto',
    genre: 'Melodic Electronica',
    description: '112 BPM B♭ major: a bright Classical turnaround carried by articulate Piano, light bass, and a courteous chamber pulse.',
    bpm: 112,
    key: key(10, 'major'),
    mix: mix(2, 42, 14, 44, 18),
    drums: gentleDrums('Chamber Pulse', 0x11200801, 12),
    modules: [
      { type: 'bass', name: 'Cello Line', seed: 0x11200802, params: { style: 0, steps: 16, range: 1, density: 26, drive: 0, octave: 2, gate: 78 }, presetId: 'bass-clean-v2', level: 0.23, pan: -6 },
    ],
    piano: {
      name: 'Allegretto Turn', seed: 0x11200805, melodyId: 'turnaround-hook',
      presetId: 'piano-bright-v2', level: 0.49, pan: 8, delaySend: 10, reverbSend: 30,
    },
  },
  {
    slug: 'clockwork-minuet',
    name: 'Clockwork Minuet',
    genre: 'Post-Classical Minimalism',
    description: '104 BPM A minor: an offbeat Classical ladder with tiny clockwork percussion and a muted Euclidean counter-rhythm.',
    bpm: 104,
    key: key(9, 'minor'),
    mix: mix(3, 46, 18, 48, 16),
    drums: gentleDrums('Clockwork Taps', 0x10400901, 18, 'drums-odd-v2'),
    modules: [
      { type: 'euclid', name: 'Minuet Wheels', seed: 0x10400902, params: { steps1: 6, hits1: 2, rotation1: 1, note1: 45, steps2: 8, hits2: 3, rotation2: 2, note2: 52, steps3: 12, hits3: 3, rotation3: 5, note3: 57, separateChannels: 0 }, presetId: 'euclid-cairn-v2', level: 0.13, pan: -12, reverbSend: 38 },
    ],
    piano: {
      name: 'Minuet Ladder', seed: 0x10400905, melodyId: 'offbeat-ladder',
      presetId: 'piano-muted-v2', level: 0.51, pan: 10, delaySend: 14, reverbSend: 36,
    },
  },
  {
    slug: 'romantic-waltz-glow',
    name: 'Romantic Waltz Glow',
    genre: 'Melodic Electronica',
    description: '78 BPM E♭ major: a long three-part Romantic arc, glowing Piano dynamics, and one wide halo of harmony.',
    bpm: 78,
    key: key(3, 'major'),
    mix: mix(1, 62, 24, 72, 12),
    modules: [
      { type: 'chords', name: 'Waltz Halo', seed: 0x07801002, params: { length: 3, quality: 1, duration: 20, strum: 46 }, presetId: 'chords-wide-v2', level: 0.18, pan: -10, reverbSend: 64 },
    ],
    piano: {
      name: 'Three-Part Glow', seed: 0x07801005, melodyId: 'three-part-arc',
      presetId: 'piano-tremolo-v2', level: 0.5, pan: 9, delaySend: 22, reverbSend: 60,
    },
  },
  {
    slug: 'gentle-fugue-pulse',
    name: 'Gentle Fugue Pulse',
    genre: 'Post-Classical Minimalism',
    description: '100 BPM D minor: a developing contrapuntal motif, a low answering arpeggio, and a sparse modern pulse.',
    bpm: 100,
    key: key(2, 'minor'),
    mix: mix(2, 56, 24, 54, 16),
    drums: gentleDrums('Fugue Pulse', 0x10001101, 20),
    modules: [
      { type: 'arp', name: 'Lower Answer', seed: 0x10001102, params: { direction: 1, rate: 1, span: 1, gate: 76, followChords: 0, octave: 2 }, presetId: 'arp-dark-v2', level: 0.15, pan: -20, delaySend: 20, reverbSend: 42 },
    ],
    piano: {
      name: 'Developing Subject', seed: 0x10001105, melodyId: 'motif-development',
      presetId: 'piano-core-v2', level: 0.5, pan: 10, delaySend: 16, reverbSend: 44,
    },
  },
  {
    slug: 'dreaming-etude',
    name: 'Dreaming Étude',
    genre: 'Neoclassical Ambient',
    description: '70 BPM B minor: a Piano-only wide-interval étude designed to reveal the new 64-step phrasing and dynamic lane.',
    bpm: 70,
    key: key(11, 'minor'),
    mix: mix(0, 70, 30, 78, 8),
    modules: [],
    piano: {
      name: 'Wide-Interval Étude', seed: 0x07001205, melodyId: 'wide-interval-study',
      presetId: 'piano-soft-v2', level: 0.57, pan: 0, delaySend: 20, reverbSend: 68,
    },
  },
  {
    slug: 'sweet-electro-invention',
    name: 'Sweet Electro Invention',
    genre: 'Melodic Electronica',
    description: '118 BPM E minor: a friendly electronic chamber piece with syncopated Piano sparkle, soft pixels, and a featherweight beat.',
    bpm: 118,
    key: key(4, 'minor'),
    mix: mix(3, 42, 16, 42, 22),
    drums: {
      ...gentleDrums('Soft Voltage', 0x11801301, 24, 'drums-electro-v2'),
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([2, 6, 10, 14]), repeat16([6, 14]), [], [], repeat16([7]), [31]],
      level: 0.31,
    },
    modules: [
      { type: 'arp', name: 'Sugar Pixels', seed: 0x11801302, params: { direction: 2, rate: 1, span: 1, gate: 64, followChords: 0, octave: 4 }, presetId: 'arp-pixel-v2', level: 0.16, pan: -16, delaySend: 24, reverbSend: 34 },
    ],
    piano: {
      name: 'Electric Spark', seed: 0x11801305, melodyId: 'syncopated-spark',
      presetId: 'piano-tine-v2', level: 0.48, pan: 10, delaySend: 18, reverbSend: 34,
    },
  },
  {
    slug: 'ambient-pulse-canon',
    name: 'Ambient Pulse Canon',
    genre: 'Melodic Electronica',
    description: '108 BPM A dorian: a sweet octave dialogue for Piano, clear low strings, and an understated electronic heartbeat.',
    bpm: 108,
    key: key(9, 'dorian'),
    mix: mix(2, 50, 20, 56, 18),
    drums: gentleDrums('Quiet Heartbeat', 0x10801401, 26, 'drums-electro-v2'),
    modules: [
      { type: 'bass', name: 'Low String', seed: 0x10801402, params: { style: 4, steps: 32, range: 1, density: 20, drive: 0, octave: 2, gate: 86 }, presetId: 'bass-clean-v2', level: 0.2, pan: -5, reverbSend: 14 },
    ],
    piano: {
      name: 'Octave Dialogue', seed: 0x10801405, melodyId: 'octave-conversation',
      presetId: 'piano-bell-v2', level: 0.49, pan: 10, delaySend: 24, reverbSend: 46,
    },
  },
  {
    slug: 'luminous-rondo',
    name: 'Luminous Rondo',
    genre: 'Melodic Electronica',
    description: '126 BPM C mixolydian: a graceful electronic rondo with a long Piano journey, soft keys, and a warm dance-floor pulse.',
    bpm: 126,
    key: key(0, 'mixolydian'),
    mix: mix(2, 40, 14, 40, 24),
    drums: {
      ...gentleDrums('Rondo Pulse', 0x12601501, 28, 'drums-latin-v2'),
      lanes: [repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([2, 6, 10, 14]), repeat16([2, 10]), repeat16([12]), [], repeat16([7]), [31]],
      level: 0.34,
    },
    modules: [
      { type: 'chords', name: 'Luminous Keys', seed: 0x12601502, params: { length: 4, quality: 1, duration: 12, strum: 20 }, presetId: 'chords-keys-v2', level: 0.19, pan: -12, reverbSend: 30 },
    ],
    piano: {
      name: 'Rondo Journey', seed: 0x12601505, melodyId: 'longform-journey',
      presetId: 'piano-bright-v2', level: 0.47, pan: 9, delaySend: 16, reverbSend: 32,
    },
  },
];

for (const file of retiredDemoFiles) rmSync(resolve(OUTPUT_DIR, file), { force: true });

for (const demo of demos) {
  const project = buildProject(demo);
  writeFileSync(resolve(OUTPUT_DIR, `${demo.slug}.sequens-r.json`), projectToJson(project), 'utf8');
}

const catalogDemos = DEMO_GENRES.flatMap((genre) => {
  const genreDemos = demos.filter((demo) => demo.genre === genre);
  if (genreDemos.length !== 5) throw new RangeError(`${genre} must contain exactly five demo projects.`);
  return genreDemos;
});

writeFileSync(resolve(OUTPUT_DIR, 'index.json'), `${JSON.stringify({
  projects: catalogDemos.map(({ name, slug, genre, description }) => ({ name, file: `${slug}.sequens-r.json`, genre, description })),
}, null, 2)}\n`, 'utf8');

console.log(`Generated ${demos.length} demo projects in ${OUTPUT_DIR}.`);
