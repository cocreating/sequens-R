import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModuleType, MusicalKey, ScaleName } from '../src/lib/core/pattern';
import { soundForPreset, type RackMixState } from '../src/lib/audio/sound';
import { createProject, projectToJson, type ProjectDocument } from '../src/lib/project/model';
import { createModule, type PatternSlot, type RackModule, type RackState } from '../src/lib/state/rack';

type SoundModuleType = Exclude<ModuleType, 'cc' | 'mod'>;
const DEMO_GENRES = ['Minimal Techno', 'Minimal House Techno', 'Ambient Techno & Breakbeats'] as const;
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
  synth: Omit<ModuleSpec, 'type'>;
}

const OUTPUT_DIR = resolve(process.cwd(), 'public/projects');
const CREATED_AT = Date.UTC(2026, 7, 31, 10, 0, 0);

const DEFAULT_COLORS: Readonly<Record<ModuleType, RackModule['color']>> = {
  drums: 'ember',
  bass: 'forest',
  acid: 'olive',
  chords: 'plum',
  arp: 'navy',
  euclid: 'teal',
  piano: 'indigo',
  cc: 'steel',
  mod: 'burgundy',
  synth: 'cobalt',
  drone: 'graphite',
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
  if (type === 'synth') return [
    params,
    { ...params, style: (params.style + 1) % 6, density: clamp(params.density + 10, 0, 100), repeat: clamp(params.repeat - 8, 0, 100) },
    { ...params, density: Math.round(params.density * 0.48), gate: clamp(params.gate + 18, 10, 100), repeat: clamp(params.repeat + 20, 0, 100) },
    { ...params, style: (params.style + 4) % 6, density: clamp(params.density + 22, 0, 100), range: clamp(params.range + 1, 1, 3) },
    { ...params, density: Math.round(params.density * 0.62), octave: clamp(params.octave - 1, 2, 6), gate: clamp(params.gate + 10, 10, 100) },
    { ...params, style: 5, repeat: clamp(params.repeat + 28, 0, 100) },
    { ...params, style: (params.style + 2) % 6, octave: clamp(params.octave + 1, 2, 6), gate: clamp(params.gate - 16, 10, 100) },
    { ...params, style: 4, density: clamp(params.density + 16, 0, 100), repeat: clamp(params.repeat - 18, 0, 100) },
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

function buildProject(spec: DemoSpec): ProjectDocument {
  const modules: RackModule[] = [];
  if (spec.drums !== undefined) modules.push(createDrums(spec.slug, spec.drums, modules.length));
  for (const moduleSpec of spec.modules) modules.push(createGeneratedModule(spec.slug, moduleSpec, modules.length));
  modules.push(createGeneratedModule(spec.slug, { type: 'synth', ...spec.synth }, modules.length));
  if (modules.length > 3) throw new RangeError(`${spec.name} exceeds the three-module demo limit.`);
  if (!modules.some(({ type }) => type === 'synth')) throw new RangeError(`${spec.name} must contain Synth.`);

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
      { id: `scene-${spec.slug}-groove`, name: 'Groove', assignments: assignments(0) },
      { id: `scene-${spec.slug}-variation`, name: 'Variation', assignments: assignments(1) },
      { id: `scene-${spec.slug}-peak`, name: 'Peak', assignments: assignments(3) },
    ],
    settings: { genre: spec.genre, demo: true },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

const key = (root: number, scale: ScaleName): MusicalKey => ({ root, scale });
const mix = (delayDivision: number, delayFeedback: number, delayReturn: number, reverbReturn: number, masterCharacter: number): RackMixState => ({
  delayDivision, delayFeedback, delayReturn, reverbReturn, masterCharacter,
});

function drums(name: string, seed: number, lanes: readonly (readonly number[])[], options: Partial<Pick<DrumSpec, 'groove' | 'swing' | 'humanize' | 'presetId' | 'level' | 'delaySend' | 'reverbSend'>> = {}): DrumSpec {
  return {
    name,
    seed,
    steps: 32,
    groove: options.groove ?? 3,
    swing: options.swing ?? 8,
    humanize: options.humanize ?? 6,
    lanes,
    presetId: options.presetId ?? 'drums-core-v2',
    level: options.level ?? 0.46,
    ...(options.delaySend === undefined ? {} : { delaySend: options.delaySend }),
    reverbSend: options.reverbSend ?? 10,
  };
}

function minimalTechnoDrums(name: string, seed: number, swing = 8): DrumSpec {
  return drums(name, seed, [
    repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([2, 6, 10, 14]),
    repeat16([6, 14]), repeat16([12]), [], repeat16([3, 11]), [15, 31],
  ], { swing, humanize: 5, level: 0.48, reverbSend: 7 });
}

function minimalHouseDrums(name: string, seed: number, swing = 28): DrumSpec {
  return drums(name, seed, [
    repeat16([0, 4, 8, 12]), repeat16([4, 12]), repeat16([2, 6, 10, 14]),
    repeat16([2, 6, 10, 14]), repeat16([4, 12]), repeat16([7, 15]), repeat16([3, 11]), [14, 30],
  ], { groove: 0, swing, humanize: 10, level: 0.44, reverbSend: 12 });
}

function breakbeatDrums(name: string, seed: number, ambient = false): DrumSpec {
  return drums(name, seed, [
    [0, 10, 16, 19, 27], [4, 12, 20, 28], [2, 6, 9, 14, 18, 22, 25, 30],
    [6, 15, 22, 31], [12, 28], [9, 25], [3, 13, 19, 29], [15, 31],
  ], { groove: 1, swing: ambient ? 22 : 14, humanize: ambient ? 18 : 10, presetId: ambient ? 'drums-odd-v2' : 'drums-broken-v2', level: ambient ? 0.3 : 0.48, delaySend: ambient ? 12 : 4, reverbSend: ambient ? 34 : 10 });
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
    genre: 'Minimal Techno',
    description: '124 BPM D dorian: a locked minimal-techno grid, dry acid punctuation, and a glassy Orbit Synth motif.',
    bpm: 124,
    key: key(2, 'dorian'),
    mix: mix(4, 38, 14, 18, 24),
    drums: minimalTechnoDrums('Glass Grid', 0x12400101, 6),
    modules: [
      { type: 'acid', name: 'Dry Etch', seed: 0x12400102, params: { fill: 24, steps: 16, range: 1, decay: 20 }, presetId: 'acid-sharp-v2', level: 0.21, pan: -12, delaySend: 8 },
    ],
    synth: {
      name: 'Glass Orbit', seed: 0x12400105, params: { style: 4, steps: 32, density: 54, range: 2, octave: 4, gate: 48, repeat: 32 },
      presetId: 'synth-glass-v2', level: 0.34, pan: 10, delaySend: 18, reverbSend: 18,
    },
  },
  {
    slug: 'moonlit-nocturne',
    name: 'Moonlit Nocturne',
    genre: 'Ambient Techno & Breakbeats',
    description: '92 BPM C♯ minor: beatless ambient techno with a dark drifting Synth phrase suspended over one slow chord veil.',
    bpm: 92,
    key: key(1, 'minor'),
    mix: mix(0, 68, 34, 72, 10),
    modules: [
      { type: 'chords', name: 'Moon Veil', seed: 0x09200202, params: { length: 4, quality: 1, duration: 24, strum: 18 }, presetId: 'chords-dark-v2', level: 0.18, pan: -12, reverbSend: 64 },
    ],
    synth: {
      name: 'Night Signal', seed: 0x09200205, params: { style: 5, steps: 64, density: 24, range: 2, octave: 4, gate: 92, repeat: 70 },
      presetId: 'synth-dark-v2', level: 0.38, pan: 10, delaySend: 34, reverbSend: 62,
    },
  },
  {
    slug: 'pastoral-morning',
    name: 'Pastoral Morning',
    genre: 'Minimal House Techno',
    description: '122 BPM F minor: soft swung house drums, muted chord air, and a restrained Synth answer for an early-morning floor.',
    bpm: 122,
    key: key(5, 'minor'),
    mix: mix(2, 44, 16, 34, 18),
    drums: minimalHouseDrums('Morning Floor', 0x12200301, 30),
    modules: [
      { type: 'chords', name: 'Pastoral Air', seed: 0x12200302, params: { length: 4, quality: 1, duration: 12, strum: 22 }, presetId: 'chords-muted-v2', level: 0.16, pan: -14, reverbSend: 34 },
    ],
    synth: {
      name: 'Morning Answer', seed: 0x12200305, params: { style: 3, steps: 32, density: 42, range: 1, octave: 4, gate: 68, repeat: 52 },
      presetId: 'synth-soft-v2', level: 0.32, pan: 10, delaySend: 18, reverbSend: 32,
    },
  },
  {
    slug: 'quiet-canon',
    name: 'Quiet Canon',
    genre: 'Minimal Techno',
    description: '120 BPM C minor: a low-density techno pulse with a round bass anchor and repeating Motif Synth cadence.',
    bpm: 120,
    key: key(0, 'minor'),
    mix: mix(4, 42, 14, 20, 22),
    drums: minimalTechnoDrums('Quiet Machine', 0x12000401, 10),
    modules: [
      { type: 'bass', name: 'Canon Floor', seed: 0x12000402, params: { style: 4, steps: 16, range: 1, density: 28, drive: 8, octave: 2, gate: 74 }, presetId: 'bass-clean-v2', level: 0.28, pan: -5 },
    ],
    synth: {
      name: 'Quiet Motif', seed: 0x12000405, params: { style: 0, steps: 32, density: 38, range: 1, octave: 4, gate: 58, repeat: 68 },
      presetId: 'synth-core-v2', level: 0.32, pan: 9, delaySend: 14, reverbSend: 20,
    },
  },
  {
    slug: 'water-garden',
    name: 'Water Garden',
    genre: 'Ambient Techno & Breakbeats',
    description: '98 BPM D♭ lydian: washed broken drums, irregular tuned droplets, and a sparse glass Synth current.',
    bpm: 98,
    key: key(1, 'lydian'),
    mix: mix(0, 66, 34, 66, 12),
    drums: breakbeatDrums('Water Breaks', 0x09800501, true),
    modules: [
      { type: 'euclid', name: 'Garden Drops', seed: 0x09800502, params: { steps1: 7, hits1: 2, rotation1: 1, note1: 49, steps2: 9, hits2: 3, rotation2: 4, note2: 56, steps3: 11, hits3: 3, rotation3: 2, note3: 63, separateChannels: 0 }, presetId: 'euclid-tide-v2', level: 0.13, pan: -16, delaySend: 34, reverbSend: 58 },
    ],
    synth: {
      name: 'Glass Current', seed: 0x09800505, params: { style: 5, steps: 64, density: 30, range: 2, octave: 5, gate: 84, repeat: 58 },
      presetId: 'synth-glass-v2', level: 0.29, pan: 14, delaySend: 38, reverbSend: 58,
    },
  },
  {
    slug: 'velvet-sarabande',
    name: 'Velvet Sarabande',
    genre: 'Minimal House Techno',
    description: '124 BPM G minor: a velvet minimal-house pocket with plucked bass and a wide repeating Synth phrase.',
    bpm: 124,
    key: key(7, 'minor'),
    mix: mix(2, 46, 16, 28, 20),
    drums: minimalHouseDrums('Velvet Floor', 0x12400601, 34),
    modules: [
      { type: 'bass', name: 'Velvet Pocket', seed: 0x12400602, params: { style: 1, steps: 32, range: 1, density: 42, drive: 8, octave: 2, gate: 52 }, presetId: 'bass-pluck-v2', level: 0.3, pan: -6 },
    ],
    synth: {
      name: 'Velvet Path', seed: 0x12400605, params: { style: 4, steps: 32, density: 46, range: 2, octave: 4, gate: 54, repeat: 56 },
      presetId: 'synth-wide-v2', level: 0.31, pan: 11, delaySend: 18, reverbSend: 26,
    },
  },
  {
    slug: 'winter-largo',
    name: 'Winter Largo',
    genre: 'Minimal Techno',
    description: '116 BPM E minor: a cold two-module techno study with an exposed kick grid and long dark Synth drift.',
    bpm: 116,
    key: key(4, 'minor'),
    mix: mix(4, 52, 20, 36, 16),
    drums: minimalTechnoDrums('Frozen Grid', 0x11600701, 4),
    modules: [],
    synth: {
      name: 'Frozen Drift', seed: 0x11600705, params: { style: 5, steps: 64, density: 26, range: 2, octave: 3, gate: 96, repeat: 76 },
      presetId: 'synth-dark-v2', level: 0.38, pan: 6, delaySend: 26, reverbSend: 38,
    },
  },
  {
    slug: 'classical-allegretto',
    name: 'Classical Allegretto',
    genre: 'Minimal House Techno',
    description: '126 BPM B♭ minor: a bright minimal-house cadence with clipped keys and a clean climbing Synth lead.',
    bpm: 126,
    key: key(10, 'minor'),
    mix: mix(2, 40, 14, 24, 22),
    drums: minimalHouseDrums('Allegretto Floor', 0x12600801, 24),
    modules: [
      { type: 'chords', name: 'Clipped Keys', seed: 0x12600802, params: { length: 4, quality: 1, duration: 8, strum: 12 }, presetId: 'chords-keys-v2', level: 0.16, pan: -12, reverbSend: 20 },
    ],
    synth: {
      name: 'Allegretto Climb', seed: 0x12600805, params: { style: 1, steps: 32, density: 52, range: 2, octave: 4, gate: 44, repeat: 30 },
      presetId: 'synth-bright-v2', level: 0.31, pan: 10, delaySend: 14, reverbSend: 20,
    },
  },
  {
    slug: 'clockwork-minuet',
    name: 'Clockwork Minuet',
    genre: 'Minimal Techno',
    description: '126 BPM A minor: hyper-precise minimal techno with tiny Euclidean ticks and a hollow repeating Synth mechanism.',
    bpm: 126,
    key: key(9, 'minor'),
    mix: mix(3, 38, 14, 22, 28),
    drums: minimalTechnoDrums('Clockwork Grid', 0x12600901, 2),
    modules: [
      { type: 'euclid', name: 'Clockwork Ticks', seed: 0x12600902, params: { steps1: 5, hits1: 2, rotation1: 1, note1: 45, steps2: 8, hits2: 3, rotation2: 2, note2: 52, steps3: 12, hits3: 3, rotation3: 5, note3: 57, separateChannels: 0 }, presetId: 'euclid-circuit-v2', level: 0.12, pan: -14, delaySend: 8, reverbSend: 22 },
    ],
    synth: {
      name: 'Hollow Mechanism', seed: 0x12600905, params: { style: 0, steps: 32, density: 62, range: 1, octave: 4, gate: 34, repeat: 72 },
      presetId: 'synth-hollow-v2', level: 0.3, pan: 12, delaySend: 12, reverbSend: 18,
    },
  },
  {
    slug: 'romantic-waltz-glow',
    name: 'Romantic Waltz Glow',
    genre: 'Minimal House Techno',
    description: '120 BPM E♭ minor: an after-hours house glide with wide chord haze and a soft Synth answer moving through the pocket.',
    bpm: 120,
    key: key(3, 'minor'),
    mix: mix(1, 54, 22, 48, 16),
    drums: minimalHouseDrums('Afterhours Floor', 0x12001001, 38),
    modules: [
      { type: 'chords', name: 'Afterhours Haze', seed: 0x12001002, params: { length: 4, quality: 1, duration: 16, strum: 34 }, presetId: 'chords-wide-v2', level: 0.17, pan: -12, reverbSend: 46 },
    ],
    synth: {
      name: 'Glow Answer', seed: 0x12001005, params: { style: 3, steps: 32, density: 40, range: 2, octave: 4, gate: 72, repeat: 56 },
      presetId: 'synth-soft-v2', level: 0.3, pan: 11, delaySend: 24, reverbSend: 42,
    },
  },
  {
    slug: 'gentle-fugue-pulse',
    name: 'Gentle Fugue Pulse',
    genre: 'Minimal Techno',
    description: '128 BPM D minor: a direct minimal-techno drive, clipped acid reply, and a fast falling Synth phrase with restrained motion.',
    bpm: 128,
    key: key(2, 'minor'),
    mix: mix(4, 36, 12, 18, 30),
    drums: minimalTechnoDrums('Fugue Drive', 0x12801101, 4),
    modules: [
      { type: 'acid', name: 'Clipped Reply', seed: 0x12801102, params: { fill: 30, steps: 16, range: 1, decay: 18 }, presetId: 'acid-core-v2', level: 0.2, pan: -14, delaySend: 8 },
    ],
    synth: {
      name: 'Falling Subject', seed: 0x12801105, params: { style: 2, steps: 32, density: 58, range: 2, octave: 4, gate: 38, repeat: 40 },
      presetId: 'synth-pluck-v2', level: 0.3, pan: 10, delaySend: 12, reverbSend: 16,
    },
  },
  {
    slug: 'dreaming-etude',
    name: 'Dreaming Étude',
    genre: 'Ambient Techno & Breakbeats',
    description: '86 BPM B minor: a beatless ambient-techno study with slow Euclidean lights and a soft 64-step Synth drift.',
    bpm: 86,
    key: key(11, 'minor'),
    mix: mix(0, 72, 36, 76, 8),
    modules: [
      { type: 'euclid', name: 'Dream Lights', seed: 0x08601202, params: { steps1: 7, hits1: 2, rotation1: 0, note1: 47, steps2: 11, hits2: 3, rotation2: 3, note2: 54, steps3: 13, hits3: 3, rotation3: 6, note3: 59, separateChannels: 0 }, presetId: 'euclid-tide-v2', level: 0.12, pan: -18, delaySend: 38, reverbSend: 66 },
    ],
    synth: {
      name: 'Dream Drift', seed: 0x08601205, params: { style: 5, steps: 64, density: 20, range: 3, octave: 4, gate: 100, repeat: 74 },
      presetId: 'synth-soft-v2', level: 0.36, pan: 10, delaySend: 42, reverbSend: 68,
    },
  },
  {
    slug: 'sweet-electro-invention',
    name: 'Sweet Electro Invention',
    genre: 'Ambient Techno & Breakbeats',
    description: '130 BPM E minor: a compact electro breakbeat with round sub movement and a bright syncopated Synth spark.',
    bpm: 130,
    key: key(4, 'minor'),
    mix: mix(3, 42, 18, 24, 34),
    drums: breakbeatDrums('Sweet Breaks', 0x13001301),
    modules: [
      { type: 'bass', name: 'Round Voltage', seed: 0x13001302, params: { style: 3, steps: 32, range: 1, density: 38, drive: 14, octave: 1, gate: 62 }, presetId: 'bass-square-v2', level: 0.32, pan: -5 },
    ],
    synth: {
      name: 'Electric Spark', seed: 0x13001305, params: { style: 3, steps: 32, density: 66, range: 2, octave: 5, gate: 34, repeat: 28 },
      presetId: 'synth-bright-v2', level: 0.28, pan: 12, delaySend: 18, reverbSend: 20,
    },
  },
  {
    slug: 'ambient-pulse-canon',
    name: 'Ambient Pulse Canon',
    genre: 'Ambient Techno & Breakbeats',
    description: '108 BPM A dorian: an ambient broken pulse with clear low motion and a wide Orbit Synth dialogue.',
    bpm: 108,
    key: key(9, 'dorian'),
    mix: mix(2, 54, 24, 52, 18),
    drums: breakbeatDrums('Ambient Breaks', 0x10801401, true),
    modules: [
      { type: 'bass', name: 'Low Current', seed: 0x10801402, params: { style: 4, steps: 32, range: 1, density: 24, drive: 0, octave: 2, gate: 88 }, presetId: 'bass-clean-v2', level: 0.22, pan: -5, reverbSend: 18 },
    ],
    synth: {
      name: 'Pulse Orbit', seed: 0x10801405, params: { style: 4, steps: 64, density: 34, range: 2, octave: 4, gate: 78, repeat: 62 },
      presetId: 'synth-wide-v2', level: 0.32, pan: 12, delaySend: 30, reverbSend: 48,
    },
  },
  {
    slug: 'luminous-rondo',
    name: 'Luminous Rondo',
    genre: 'Minimal House Techno',
    description: '128 BPM C mixolydian: luminous tech-house drums, a short bass groove, and a glass Synth rondo above the floor.',
    bpm: 128,
    key: key(0, 'mixolydian'),
    mix: mix(2, 38, 12, 22, 28),
    drums: minimalHouseDrums('Luminous Floor', 0x12801501, 22),
    modules: [
      { type: 'bass', name: 'Rondo Pocket', seed: 0x12801502, params: { style: 1, steps: 16, range: 1, density: 46, drive: 10, octave: 2, gate: 48 }, presetId: 'bass-pluck-v2', level: 0.28, pan: -6 },
    ],
    synth: {
      name: 'Luminous Rondo', seed: 0x12801505, params: { style: 4, steps: 32, density: 58, range: 2, octave: 4, gate: 42, repeat: 38 },
      presetId: 'synth-glass-v2', level: 0.3, pan: 10, delaySend: 16, reverbSend: 20,
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
