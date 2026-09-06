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
  synth?: Omit<ModuleSpec, 'type'>;
}

const MAX_DEMO_MODULES = 3;
const MAX_DRUM_SOUNDS = 4;
const GENRE_SIZES: Readonly<Record<DemoGenre, number>> = {
  'Minimal Techno': 7,
  'Minimal House Techno': 7,
  'Ambient Techno & Breakbeats': 6,
};

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
  if (type === 'drone') return [
    params,
    { ...params, change: clamp(params.change + 14, 0, 100), tension: clamp(params.tension + 8, 0, 100) },
    { ...params, voices: clamp(params.voices - 1, 2, 4), change: Math.round(params.change * 0.4), tension: Math.round(params.tension * 0.5), spread: clamp(params.spread - 10, 0, 100) },
    { ...params, voices: clamp(params.voices + 1, 2, 4), change: clamp(params.change + 22, 0, 100), tension: clamp(params.tension + 18, 0, 100), spread: clamp(params.spread + 12, 0, 100) },
    { ...params, field: (params.field + 1) % 6 },
    { ...params, bars: clamp(params.bars + 1, 0, 3), change: clamp(params.change + 10, 0, 100) },
    { ...params, octave: clamp(params.octave + 1, 1, 5), spread: clamp(params.spread + 8, 0, 100) },
    { ...params, field: (params.field + 3) % 6, tension: clamp(params.tension + 12, 0, 100) },
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
  // A demo declares at most four drum sounds. Every pattern slot stays inside that
  // set, so a variant may thin or displace a lane but can never introduce a fifth one.
  const voiced = lanes.map((lane) => lane.length > 0);
  const base = (variant: readonly (readonly number[])[], swing = spec.swing, humanize = spec.humanize): Record<string, number> => ({
    steps: length,
    groove: spec.groove,
    swing,
    humanize,
    overrideLanes: 255,
    ...Object.fromEntries(Array.from({ length: 8 }, (_, lane) => [
      `lane${lane}`,
      voiced[lane] ? laneMask(variant[lane] ?? []) : 0,
    ])),
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
  const sounds = spec.lanes.filter((lane) => lane.length > 0).length;
  if (sounds > MAX_DRUM_SOUNDS) {
    throw new RangeError(`${spec.name} uses ${sounds} drum sounds; the demo limit is ${MAX_DRUM_SOUNDS}.`);
  }
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
  // Synth is the usual lead voice but is no longer mandatory: the beatless Drone and
  // sequencer pieces are complete without it.
  if (spec.synth !== undefined) modules.push(createGeneratedModule(spec.slug, { type: 'synth', ...spec.synth }, modules.length));
  if (modules.length > MAX_DEMO_MODULES) throw new RangeError(`${spec.name} exceeds the ${MAX_DEMO_MODULES}-module demo limit.`);
  if (modules.length < 2) throw new RangeError(`${spec.name} needs at least two modules.`);

  const rackId = `rack-${spec.slug}`;
  const rack: RackState = { bpm: spec.bpm, key: spec.key, modules, mix: spec.mix };
  const project = createProject(rack, spec.name);
  const assignments = (slot: number): Record<string, number> => Object.fromEntries(modules.map((module) => [module.id, slot]));
  return {
    ...project,
    id: `demo-project-${spec.slug}`,
    racks: [{ id: rackId, name: `${spec.name} Rack`, state: rack }],
    activeRackId: rackId,
    // Slot 2 thins every generator, slot 5 displaces without adding weight, and slot 3
    // is the densest variant, so the four scenes read as one arc rather than four takes.
    scenes: [
      { id: `scene-${spec.slug}-intro`, name: 'Intro', assignments: assignments(2) },
      { id: `scene-${spec.slug}-groove`, name: 'Groove', assignments: assignments(0) },
      { id: `scene-${spec.slug}-variation`, name: 'Variation', assignments: assignments(5) },
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

/**
 * Lane 0 kick, 1 snare, 2 closed hat, 3 open hat, 4 clap, 5 low tom, 6 rim, 7 FM tom.
 * A demo names at most four of them, so every kit is written as a sparse map and the
 * unnamed lanes stay silent in all eight pattern slots.
 */
function laneMap(map: Readonly<Record<number, readonly number[]>>): readonly (readonly number[])[] {
  return Array.from({ length: 8 }, (_, lane) => map[lane] ?? []);
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
  'ambient-pulse-canon.sequens-r.json',
  'classical-allegretto.sequens-r.json',
  'clockwork-minuet.sequens-r.json',
  'dreaming-etude.sequens-r.json',
  'gentle-fugue-pulse.sequens-r.json',
  'glass-invention.sequens-r.json',
  'luminous-rondo.sequens-r.json',
  'moonlit-nocturne.sequens-r.json',
  'pastoral-morning.sequens-r.json',
  'quiet-canon.sequens-r.json',
  'romantic-waltz-glow.sequens-r.json',
  'sweet-electro-invention.sequens-r.json',
  'velvet-sarabande.sequens-r.json',
  'water-garden.sequens-r.json',
  'winter-largo.sequens-r.json',
] as const;

/**
 * Twenty rhythm archetypes from the recorded history of electronic music, rebuilt from
 * scratch on this instrument. Each demo takes a grid and a gesture — a motorik pulse, a
 * Chicago jack, a Berlin School sequencer run, an electro kick displacement — never a
 * melody, a bass line or any other authored material from the records that inspired it.
 */
const demos: readonly DemoSpec[] = [
  {
    slug: 'basement-ledger',
    name: 'Basement Ledger',
    genre: 'Minimal Techno',
    description: '128 BPM A minor: a locked basement loop, a sub anchor under it, and one hollow Synth cell that never resolves.',
    bpm: 128,
    key: key(9, 'minor'),
    mix: mix(1, 36, 12, 16, 26),
    drums: drums('Ledger Grid', 0x1a80_0101, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 4: repeat16([4, 12]), 6: [7, 23],
    }), { groove: 3, swing: 6, humanize: 4, level: 0.46, reverbSend: 7 }),
    modules: [
      { type: 'bass', name: 'Sub Anchor', seed: 0x1a80_0102, params: { style: 4, steps: 16, range: 1, density: 26, drive: 0, octave: 2, gate: 82 }, presetId: 'bass-sub-v2', level: 0.26, pan: -6 },
    ],
    synth: {
      name: 'Hollow Cell', seed: 0x1a80_0103, params: { style: 0, steps: 32, density: 34, range: 1, octave: 4, gate: 52, repeat: 72 },
      presetId: 'synth-hollow-v2', level: 0.32, pan: 9, delaySend: 14, reverbSend: 18,
    },
  },
  {
    slug: 'rotary-hood',
    name: 'Rotary Hood',
    genre: 'Minimal Techno',
    description: '132 BPM C minor: loop-funk drive with an open hat pushing ahead of the beat and a dry acid answer cut short.',
    bpm: 132,
    key: key(0, 'minor'),
    mix: mix(1, 40, 14, 14, 30),
    drums: drums('Rotary Grid', 0x1a80_0201, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 3: [6, 14, 22, 30], 4: repeat16([4, 12]),
    }), { groove: 3, swing: 4, humanize: 4, level: 0.47, reverbSend: 6 }),
    modules: [
      { type: 'acid', name: 'Dry Cut', seed: 0x1a80_0202, params: { fill: 26, steps: 16, range: 1, decay: 18 }, presetId: 'acid-sharp-v2', level: 0.2, pan: -12, delaySend: 8 },
    ],
    synth: {
      name: 'Pulse Reply', seed: 0x1a80_0203, params: { style: 3, steps: 32, density: 46, range: 1, octave: 4, gate: 34, repeat: 44 },
      presetId: 'synth-pluck-v2', level: 0.3, pan: 10, delaySend: 16, reverbSend: 14,
    },
  },
  {
    slug: 'motorik-mile',
    name: 'Motorik Mile',
    genre: 'Minimal Techno',
    description: '130 BPM D minor: the krautrock motorik pulse on a drum machine — no swing, continuous eighth-note hats, and a block bass that never lifts.',
    bpm: 130,
    key: key(2, 'minor'),
    mix: mix(4, 30, 10, 12, 34),
    drums: drums('Motorik Bed', 0x1a80_0301, laneMap({
      0: repeat16([0, 4, 8, 12]), 1: [4, 12, 20, 28], 2: repeat16([0, 2, 4, 6, 8, 10, 12, 14]), 6: [3, 11, 19, 27],
    }), { groove: 0, swing: 0, humanize: 3, level: 0.46, reverbSend: 8 }),
    modules: [
      { type: 'bass', name: 'Block Line', seed: 0x1a80_0302, params: { style: 2, steps: 16, range: 1, density: 64, drive: 14, octave: 2, gate: 40 }, presetId: 'bass-square-v2', level: 0.26, pan: -4 },
    ],
    synth: {
      name: 'Mile Marker', seed: 0x1a80_0303, params: { style: 1, steps: 32, density: 44, range: 2, octave: 4, gate: 46, repeat: 58 },
      presetId: 'synth-bright-v2', level: 0.3, pan: 8, delaySend: 20, reverbSend: 12,
    },
  },
  {
    slug: 'purpose-signal',
    name: 'Purpose Signal',
    genre: 'Minimal Techno',
    description: '134 BPM F♯ minor: two modules only. The floor never moves, so a single high Synth figure carries the whole piece.',
    bpm: 134,
    key: key(6, 'minor'),
    mix: mix(1, 44, 18, 18, 32),
    drums: drums('Signal Floor', 0x1a80_0401, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 3: [14, 30], 4: [12, 28],
    }), { groove: 3, swing: 4, humanize: 3, level: 0.48, reverbSend: 8 }),
    modules: [],
    synth: {
      name: 'Bell Signal', seed: 0x1a80_0403, params: { style: 4, steps: 32, density: 52, range: 2, octave: 5, gate: 30, repeat: 78 },
      presetId: 'synth-bright-v2', level: 0.32, pan: 6, delaySend: 24, reverbSend: 22,
    },
  },
  {
    slug: 'chrome-cell',
    name: 'Chrome Cell',
    genre: 'Minimal Techno',
    description: '130 BPM G minor: a pure rhythm study. Sixteenth-note hats with a hole on every beat, rim on the odd steps, and Euclid rings that never line up.',
    bpm: 130,
    key: key(7, 'minor'),
    mix: mix(4, 34, 12, 10, 36),
    drums: drums('Chrome Cell', 0x1a80_0501, laneMap({
      0: repeat16([0, 4, 8, 12]),
      2: repeat16([1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]),
      5: [12, 28],
      6: repeat16([3, 11]),
    }), { groove: 1, swing: 2, humanize: 6, presetId: 'drums-broken-v2', level: 0.46, reverbSend: 6 }),
    modules: [
      { type: 'euclid', name: 'Off Ring', seed: 0x1a80_0502, params: { steps1: 5, hits1: 2, rotation1: 1, note1: 44, steps2: 7, hits2: 3, rotation2: 3, note2: 51, steps3: 11, hits3: 3, rotation3: 5, note3: 58, separateChannels: 0 }, presetId: 'euclid-circuit-v2', level: 0.12, pan: -14, delaySend: 10, reverbSend: 14 },
    ],
    synth: {
      name: 'Cell Hollow', seed: 0x1a80_0503, params: { style: 4, steps: 32, density: 38, range: 1, octave: 4, gate: 40, repeat: 66 },
      presetId: 'synth-hollow-v2', level: 0.3, pan: 10, delaySend: 14, reverbSend: 12,
    },
  },
  {
    slug: 'dial-tone-loop',
    name: 'Dial Tone Loop',
    genre: 'Minimal Techno',
    description: '125 BPM B minor: Berlin dub techno. The muted chord lands off the beat and goes straight to the returns — here the mix is the arrangement.',
    bpm: 125,
    key: key(11, 'minor'),
    mix: mix(0, 72, 38, 54, 18),
    drums: drums('Tone Floor', 0x1a80_0601, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 3: [6, 14, 22, 30], 4: repeat16([4, 12]),
    }), { groove: 3, swing: 8, humanize: 6, level: 0.44, reverbSend: 14 }),
    modules: [
      { type: 'chords', name: 'Dial Stab', seed: 0x1a80_0602, params: { length: 2, quality: 1, duration: 8, strum: 8 }, presetId: 'chords-muted-v2', level: 0.17, pan: -12, delaySend: 46, reverbSend: 52 },
    ],
    synth: {
      name: 'Line Drift', seed: 0x1a80_0603, params: { style: 5, steps: 64, density: 26, range: 2, octave: 4, gate: 84, repeat: 64 },
      presetId: 'synth-dark-v2', level: 0.32, pan: 10, delaySend: 34, reverbSend: 48,
    },
  },
  {
    slug: 'schaffel-grain',
    name: 'Schaffel Grain',
    genre: 'Minimal Techno',
    description: '126 BPM D minor: the Cologne schaffel limp — swing at 54 against a straight grid, triplet delay, and a driven bass filling the gap.',
    bpm: 126,
    key: key(2, 'minor'),
    mix: mix(3, 46, 16, 20, 28),
    drums: drums('Grain Shuffle', 0x1a80_0701, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([3, 7, 11, 15]), 4: repeat16([4, 12]), 5: [10, 26],
    }), { groove: 2, swing: 54, humanize: 8, level: 0.46, reverbSend: 10 }),
    modules: [
      { type: 'bass', name: 'Ember Roll', seed: 0x1a80_0702, params: { style: 5, steps: 16, range: 1, density: 52, drive: 58, octave: 2, gate: 46 }, presetId: 'bass-driven-v2', level: 0.24, pan: -6 },
    ],
    synth: {
      name: 'Grain Wide', seed: 0x1a80_0703, params: { style: 2, steps: 32, density: 42, range: 2, octave: 4, gate: 54, repeat: 48 },
      presetId: 'synth-wide-v2', level: 0.3, pan: 10, delaySend: 18, reverbSend: 18,
    },
  },
  {
    slug: 'jack-ledger',
    name: 'Jack Ledger',
    genre: 'Minimal House Techno',
    description: '122 BPM F minor: the Chicago jack in four sounds — straight kick, clap on 2 and 4, open hat exactly off the beat, closed hat on every eighth.',
    bpm: 122,
    key: key(5, 'minor'),
    mix: mix(1, 42, 16, 28, 20),
    drums: drums('Jack Floor', 0x1a80_0801, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([0, 2, 4, 6, 8, 10, 12, 14]), 3: repeat16([2, 6, 10, 14]), 4: repeat16([4, 12]),
    }), { groove: 0, swing: 30, humanize: 10, level: 0.44, reverbSend: 12 }),
    modules: [
      { type: 'bass', name: 'Round Anchor', seed: 0x1a80_0802, params: { style: 3, steps: 16, range: 1, density: 48, drive: 12, octave: 2, gate: 56 }, presetId: 'bass-core-v2', level: 0.26, pan: -5 },
    ],
    synth: {
      name: 'Jack Motif', seed: 0x1a80_0803, params: { style: 0, steps: 32, density: 44, range: 1, octave: 4, gate: 50, repeat: 56 },
      presetId: 'synth-core-v2', level: 0.3, pan: 9, delaySend: 16, reverbSend: 22,
    },
  },
  {
    slug: 'deep-pocket',
    name: 'Deep Pocket',
    genre: 'Minimal House Techno',
    description: '124 BPM A minor: a ninth-chord pad that never leaves, with a rim on the last sixteenth of every beat as the only clock inside it.',
    bpm: 124,
    key: key(9, 'minor'),
    mix: mix(0, 52, 22, 44, 14),
    drums: drums('Pocket Floor', 0x1a80_0901, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 4: repeat16([4, 12]), 6: repeat16([7, 15]),
    }), { groove: 0, swing: 26, humanize: 9, level: 0.42, reverbSend: 16 }),
    modules: [
      { type: 'chords', name: 'Slow Bloom', seed: 0x1a80_0902, params: { length: 4, quality: 2, duration: 16, strum: 26 }, presetId: 'chords-pad-v2', level: 0.17, pan: -14, delaySend: 12, reverbSend: 48 },
    ],
    synth: {
      name: 'Soft Arc', seed: 0x1a80_0903, params: { style: 3, steps: 32, density: 34, range: 1, octave: 4, gate: 72, repeat: 54 },
      presetId: 'synth-soft-v2', level: 0.3, pan: 10, delaySend: 20, reverbSend: 34,
    },
  },
  {
    slug: 'bucharest-tick',
    name: 'Bucharest Tick',
    genre: 'Minimal House Techno',
    description: '123 BPM D minor: rominimal. Swing 38 and humanize 16 push almost everything off the grid, and the FM tom lands twice in two bars.',
    bpm: 123,
    key: key(2, 'minor'),
    mix: mix(4, 58, 20, 26, 16),
    drums: drums('Tick Floor', 0x1a80_0a01, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([3, 7, 10, 14]), 6: [5, 13, 21, 29], 7: [11, 27],
    }), { groove: 1, swing: 38, humanize: 16, presetId: 'drums-odd-v2', level: 0.42, delaySend: 6, reverbSend: 14 }),
    modules: [
      { type: 'euclid', name: 'Skein Off', seed: 0x1a80_0a02, params: { steps1: 9, hits1: 2, rotation1: 2, note1: 46, steps2: 11, hits2: 3, rotation2: 5, note2: 53, steps3: 13, hits3: 4, rotation3: 7, note3: 60, separateChannels: 0 }, presetId: 'euclid-skein-v2', level: 0.12, pan: -16, delaySend: 22, reverbSend: 24 },
    ],
    synth: {
      name: 'Tick Hollow', seed: 0x1a80_0a03, params: { style: 5, steps: 64, density: 28, range: 2, octave: 4, gate: 58, repeat: 60 },
      presetId: 'synth-hollow-v2', level: 0.3, pan: 12, delaySend: 24, reverbSend: 22,
    },
  },
  {
    slug: 'filter-sunrise',
    name: 'Filter Sunrise',
    genre: 'Minimal House Techno',
    description: '126 BPM C minor: French filter house. One organ loop repeats unchanged and the master character does the lifting.',
    bpm: 126,
    key: key(0, 'minor'),
    mix: mix(1, 48, 18, 24, 46),
    drums: drums('Sunrise Floor', 0x1a80_0b01, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 3: [6, 14, 22, 30], 4: repeat16([4, 12]),
    }), { groove: 0, swing: 20, humanize: 8, level: 0.44, reverbSend: 10 }),
    modules: [
      { type: 'chords', name: 'Draw Loop', seed: 0x1a80_0b02, params: { length: 4, quality: 1, duration: 8, strum: 16 }, presetId: 'chords-organ-v2', level: 0.18, pan: -10, delaySend: 18, reverbSend: 22 },
    ],
    synth: {
      name: 'Twin Path', seed: 0x1a80_0b03, params: { style: 4, steps: 32, density: 50, range: 2, octave: 4, gate: 44, repeat: 52 },
      presetId: 'synth-wide-v2', level: 0.3, pan: 10, delaySend: 20, reverbSend: 18,
    },
  },
  {
    slug: 'garage-slant',
    name: 'Garage Slant',
    genre: 'Minimal House Techno',
    description: '128 BPM G minor: two-step garage. The only displaced kick in the catalog, snare on the third beat alone, swing at 58.',
    bpm: 128,
    key: key(7, 'minor'),
    mix: mix(4, 40, 16, 30, 24),
    drums: drums('Slant Break', 0x1a80_0c01, laneMap({
      0: [0, 10, 16, 26], 1: [8, 24], 2: [2, 4, 6, 12, 14, 18, 20, 22, 28, 30], 6: [7, 23],
    }), { groove: 1, swing: 58, humanize: 12, presetId: 'drums-broken-v2', level: 0.46, reverbSend: 12 }),
    modules: [
      { type: 'bass', name: 'Short Wood', seed: 0x1a80_0c02, params: { style: 5, steps: 16, range: 2, density: 42, drive: 10, octave: 2, gate: 38 }, presetId: 'bass-pluck-v2', level: 0.26, pan: -6 },
    ],
    synth: {
      name: 'Quick Pulse', seed: 0x1a80_0c03, params: { style: 1, steps: 32, density: 48, range: 2, octave: 4, gate: 32, repeat: 40 },
      presetId: 'synth-pluck-v2', level: 0.3, pan: 10, delaySend: 22, reverbSend: 20,
    },
  },
  {
    slug: 'sunday-organ',
    name: 'Sunday Organ',
    genre: 'Minimal House Techno',
    description: '120 BPM B♭ minor: the slowest house tempo here. A sustained organ, a soft clap, and a low tom that breathes once every two bars.',
    bpm: 120,
    key: key(10, 'minor'),
    mix: mix(0, 50, 20, 38, 12),
    drums: drums('Sunday Floor', 0x1a80_0d01, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 4: repeat16([4, 12]), 5: [14, 30],
    }), { groove: 0, swing: 32, humanize: 11, level: 0.42, reverbSend: 14 }),
    modules: [
      { type: 'chords', name: 'Draw Line', seed: 0x1a80_0d02, params: { length: 4, quality: 2, duration: 16, strum: 20 }, presetId: 'chords-organ-v2', level: 0.18, pan: -12, delaySend: 16, reverbSend: 34 },
    ],
    synth: {
      name: 'Soft Answer', seed: 0x1a80_0d03, params: { style: 3, steps: 32, density: 32, range: 1, octave: 4, gate: 76, repeat: 58 },
      presetId: 'synth-soft-v2', level: 0.29, pan: 10, delaySend: 18, reverbSend: 30,
    },
  },
  {
    slug: 'tech-pocket',
    name: 'Tech Pocket',
    genre: 'Minimal House Techno',
    description: '125 BPM E minor: a rolling 32-step bass with glide is the lead, and the drums stay out of its way — clap once per two bars.',
    bpm: 125,
    key: key(4, 'minor'),
    mix: mix(1, 44, 15, 22, 26),
    drums: drums('Pocket Grid', 0x1a80_0e01, laneMap({
      0: repeat16([0, 4, 8, 12]), 2: repeat16([2, 6, 10, 14]), 4: [12, 28], 6: [3, 11, 19, 27],
    }), { groove: 2, swing: 24, humanize: 9, level: 0.45, reverbSend: 10 }),
    modules: [
      { type: 'bass', name: 'Orbit Roll', seed: 0x1a80_0e02, params: { style: 2, steps: 32, range: 2, density: 62, drive: 22, octave: 2, gate: 44 }, presetId: 'bass-animated-v2', level: 0.26, pan: -6 },
    ],
    synth: {
      name: 'Pocket Pulse', seed: 0x1a80_0e03, params: { style: 0, steps: 32, density: 40, range: 1, octave: 4, gate: 36, repeat: 62 },
      presetId: 'synth-pluck-v2', level: 0.29, pan: 10, delaySend: 18, reverbSend: 16,
    },
  },
  {
    slug: 'selected-drift',
    name: 'Selected Drift',
    genre: 'Ambient Techno & Breakbeats',
    description: '96 BPM A lydian: no drums and two modules. A four-voice lydian Drone field holds everything while the Synth drops one slow phrase per cycle.',
    bpm: 96,
    key: key(9, 'lydian'),
    mix: mix(0, 66, 30, 74, 8),
    modules: [
      { type: 'drone', name: 'Air Field', seed: 0x1a80_0f02, params: { field: 1, bars: 2, voices: 3, octave: 3, spread: 78, change: 20, tension: 12 }, presetId: 'drone-air-v1', level: 0.3, delaySend: 18, reverbSend: 62 },
    ],
    synth: {
      name: 'Drift Line', seed: 0x1a80_0f03, params: { style: 5, steps: 64, density: 22, range: 2, octave: 4, gate: 94, repeat: 66 },
      presetId: 'synth-soft-v2', level: 0.32, pan: 8, delaySend: 34, reverbSend: 66,
    },
  },
  {
    slug: 'sequencer-field',
    name: 'Sequencer Field',
    genre: 'Ambient Techno & Breakbeats',
    description: '92 BPM D minor: Berlin School. The sequencer is the rhythm — a three-octave sixteenth-note Arp over a deep Drone, with no percussion and no lead voice at all.',
    bpm: 92,
    key: key(2, 'minor'),
    mix: mix(1, 70, 34, 62, 10),
    modules: [
      { type: 'arp', name: 'Copper Run', seed: 0x1a80_1002, params: { direction: 0, rate: 2, span: 3, gate: 38, followChords: 0, octave: 3 }, presetId: 'arp-copper-v2', level: 0.24, pan: -10, delaySend: 30, reverbSend: 34 },
      { type: 'drone', name: 'Deep Current', seed: 0x1a80_1003, params: { field: 0, bars: 3, voices: 3, octave: 2, spread: 58, change: 16, tension: 8 }, presetId: 'drone-deep-v1', level: 0.3, reverbSend: 58 },
    ],
  },
  {
    slug: 'amen-chapel',
    name: 'Amen Chapel',
    genre: 'Ambient Techno & Breakbeats',
    description: '168 BPM F minor: atmospheric jungle. A broken four-sound break against a pad moving at a third of its speed — the gap between the two is the piece.',
    bpm: 168,
    key: key(5, 'minor'),
    mix: mix(0, 62, 26, 58, 14),
    drums: drums('Chapel Break', 0x1a80_1101, laneMap({
      0: [0, 10, 18, 27], 1: [4, 12, 20, 28], 2: [2, 6, 14, 22, 30], 6: [7, 25],
    }), { groove: 1, swing: 14, humanize: 10, presetId: 'drums-broken-v2', level: 0.4, delaySend: 8, reverbSend: 20 }),
    modules: [
      { type: 'chords', name: 'Chapel Bloom', seed: 0x1a80_1102, params: { length: 4, quality: 2, duration: 32, strum: 30 }, presetId: 'chords-pad-v2', level: 0.17, pan: -14, delaySend: 14, reverbSend: 58 },
    ],
    synth: {
      name: 'Glass Current', seed: 0x1a80_1103, params: { style: 5, steps: 64, density: 24, range: 2, octave: 5, gate: 86, repeat: 58 },
      presetId: 'synth-glass-v2', level: 0.3, pan: 12, delaySend: 30, reverbSend: 54,
    },
  },
  {
    slug: 'autobahn-coast',
    name: 'Autobahn Coast',
    genre: 'Ambient Techno & Breakbeats',
    description: '108 BPM C minor: electro of the Kraftwerk line. Six displaced kicks per two bars, snare on the third beat only, and a square bass doubling the kick an octave up.',
    bpm: 108,
    key: key(0, 'minor'),
    mix: mix(1, 38, 14, 20, 40),
    drums: drums('Coast Machine', 0x1a80_1201, laneMap({
      0: [0, 6, 10, 16, 22, 26], 1: [8, 24], 2: repeat16([0, 2, 4, 6, 8, 10, 12, 14]), 6: [3, 13, 19, 29],
    }), { groove: 1, swing: 0, humanize: 4, presetId: 'drums-electro-v2', level: 0.46, reverbSend: 10 }),
    modules: [
      { type: 'bass', name: 'Block Octave', seed: 0x1a80_1202, params: { style: 0, steps: 16, range: 1, density: 56, drive: 20, octave: 2, gate: 44 }, presetId: 'bass-square-v2', level: 0.26, pan: -5 },
    ],
    synth: {
      name: 'Day Line', seed: 0x1a80_1203, params: { style: 1, steps: 32, density: 46, range: 2, octave: 4, gate: 40, repeat: 54 },
      presetId: 'synth-bright-v2', level: 0.3, pan: 10, delaySend: 22, reverbSend: 18,
    },
  },
  {
    slug: 'tilt-machine',
    name: 'Tilt Machine',
    genre: 'Ambient Techno & Breakbeats',
    description: '112 BPM F♯ phrygian: nothing lands where you expect. Odd-step kicks, a late snare, hats grouped in threes, and humanize at 20 so it reads as played.',
    bpm: 112,
    key: key(6, 'phrygian'),
    mix: mix(4, 64, 24, 36, 22),
    drums: drums('Tilt Kit', 0x1a80_1301, laneMap({
      0: [0, 7, 13, 16, 23, 29], 1: [10, 26], 2: [2, 3, 6, 9, 11, 14, 18, 19, 22, 25, 27, 30], 7: [5, 21],
    }), { groove: 1, swing: 6, humanize: 20, presetId: 'drums-odd-v2', level: 0.44, delaySend: 10, reverbSend: 16 }),
    modules: [
      { type: 'euclid', name: 'Shards', seed: 0x1a80_1302, params: { steps1: 7, hits1: 3, rotation1: 2, note1: 50, steps2: 11, hits2: 4, rotation2: 6, note2: 57, steps3: 13, hits3: 5, rotation3: 9, note3: 64, separateChannels: 0 }, presetId: 'euclid-shards-v2', level: 0.12, pan: -16, delaySend: 26, reverbSend: 30 },
    ],
    synth: {
      name: 'Glass Tilt', seed: 0x1a80_1303, params: { style: 2, steps: 64, density: 36, range: 2, octave: 4, gate: 44, repeat: 34 },
      presetId: 'synth-glass-v2', level: 0.29, pan: 12, delaySend: 26, reverbSend: 28,
    },
  },
  {
    slug: 'tape-haze',
    name: 'Tape Haze',
    genre: 'Ambient Techno & Breakbeats',
    description: '84 BPM D minor: the slowest project in the catalog. Halftime drums over a night Drone, with the Synth on maximum glide to imitate tape drag.',
    bpm: 84,
    key: key(2, 'minor'),
    mix: mix(0, 68, 28, 56, 10),
    drums: drums('Haze Weight', 0x1a80_1401, laneMap({
      0: [0, 10, 16, 26], 1: [8, 24], 2: [4, 12, 20, 28], 6: [14, 30],
    }), { groove: 1, swing: 20, humanize: 22, presetId: 'drums-halftime-v2', level: 0.38, delaySend: 10, reverbSend: 24 }),
    modules: [
      { type: 'drone', name: 'Night Bloom', seed: 0x1a80_1402, params: { field: 4, bars: 2, voices: 3, octave: 3, spread: 82, change: 26, tension: 16 }, presetId: 'drone-night-v1', level: 0.28, delaySend: 14, reverbSend: 54 },
    ],
    synth: {
      name: 'Warp Line', seed: 0x1a80_1403, params: { style: 5, steps: 64, density: 24, range: 1, octave: 4, gate: 90, repeat: 70 },
      presetId: 'synth-dark-v2', level: 0.3, pan: 10, delaySend: 32, reverbSend: 50,
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
  const expected = GENRE_SIZES[genre];
  if (genreDemos.length !== expected) throw new RangeError(`${genre} must contain exactly ${expected} demo projects.`);
  return genreDemos;
});

writeFileSync(resolve(OUTPUT_DIR, 'index.json'), `${JSON.stringify({
  projects: catalogDemos.map(({ name, slug, genre, description }) => ({ name, file: `${slug}.sequens-r.json`, genre, description })),
}, null, 2)}\n`, 'utf8');

console.log(`Generated ${demos.length} demo projects in ${OUTPUT_DIR}.`);
