import { isControlModule, type ChordEvent, type ModuleType, type MusicalKey, type NoteEvent, type Pattern, type ScaleName } from '../core/pattern';
import { GENERATORS, type NumericParams } from '../generators';
import { normalizeRack } from '../share/codec';
import type { ShareableRack } from '../share/types';
import type { EngineSnapshot } from '../audio/types';
import { mutationSeed } from '../generators/shared';
import type { ProjectScene } from '../project/model';
import {
  createDefaultSound,
  createLegacySound,
  DEFAULT_RACK_MIX,
  soundForPreset,
  validateSoundState,
  type RackMixState,
  type SoundState,
} from '../audio/sound';
import type { RackSoundSnapshot } from '../audio/types';

export interface PatternSlot {
  seed: number;
  params: NumericParams;
  handEdited: boolean;
  pattern: Pattern | null;
}

export interface CcAutomationPoint {
  control: 1 | 2 | 3 | 4;
  step: number;
  value: number;
}

export interface MutationState {
  on: boolean;
  intensity: 1 | 2 | 3 | 4;
  everyNLoops: number;
  revert: PatternSlot | null;
}

export type RackModule = {
  id: string;
  type: ModuleType;
  name: string;
  seed: number;
  params: NumericParams;
  slots: PatternSlot[];
  activeSlot: number;
  mutation: MutationState;
  shareable: boolean;
  collapsed: boolean;
  mute: boolean;
  solo: boolean;
  monitor: boolean;
  level: number;
  sound: SoundState;
  midi: { portId: string | null; channel: number };
  automation: CcAutomationPoint[];
} & Record<string, unknown>;

export interface RackState {
  bpm: number;
  key: MusicalKey;
  modules: RackModule[];
  mix: RackMixState;
}

const DEFAULT_NAMES: Readonly<Record<ModuleType, string>> = {
  drums: 'Drums',
  bass: 'Bass',
  acid: 'Acid',
  chords: 'Chords',
  mixer: 'Mixer',
  arp: 'Arp',
  euclid: 'Euclid',
  piano: 'Piano roll',
  cc: 'CC Control',
  mod: 'Mod',
};

function createId(type: ModuleType): string {
  return `${type}-${crypto.randomUUID()}`;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function clonePattern(pattern: Pattern | null): Pattern | null {
  return pattern === null ? null : JSON.parse(JSON.stringify(pattern)) as unknown as Pattern;
}

function cloneSlot(slot: PatternSlot): PatternSlot {
  return { seed: slot.seed >>> 0, params: { ...slot.params }, handEdited: slot.handEdited, pattern: clonePattern(slot.pattern) };
}

function createSlots(type: ModuleType, seed: number, params: NumericParams): PatternSlot[] {
  return Array.from({ length: 8 }, (_, index) => ({
    seed: index === 0 ? seed >>> 0 : (seed ^ Math.imul(index, 0x9e3779b9)) >>> 0,
    params: { ...params },
    handEdited: type === 'piano',
    pattern: type === 'piano' ? GENERATORS.piano.generate(seed, params, { key: { root: 0, scale: 'major' }, bars: 1 }) : null,
  }));
}

export function createModule(type: ModuleType, seed = randomSeed(), params?: Readonly<Record<string, number>>, sound: SoundState = createDefaultSound(type)): RackModule {
  const normalizedParams = { ...GENERATORS[type].defaults, ...params };
  validateSoundState(type, sound);
  return {
    id: createId(type),
    type,
    name: DEFAULT_NAMES[type],
    seed,
    params: normalizedParams,
    slots: createSlots(type, seed, normalizedParams),
    activeSlot: 0,
    mutation: { on: false, intensity: 2, everyNLoops: 1, revert: null },
    shareable: type !== 'piano',
    collapsed: false,
    mute: false,
    solo: false,
    monitor: true,
    level: type === 'drums' ? 0.82 : isControlModule(type) ? 0 : 0.68,
    sound: structuredClone(sound),
    midi: { portId: null, channel: type === 'drums' ? 10 : 1 },
    automation: [],
  };
}

export function setModuleSlot(module: RackModule, index: number): RackModule {
  if (!Number.isInteger(index) || index < 0 || index >= module.slots.length || index === module.activeSlot) return module;
  const slot = module.slots[index]!;
  return {
    ...module,
    activeSlot: index,
    seed: slot.seed,
    params: { ...slot.params },
    mutation: { ...module.mutation, revert: null },
  };
}

export function setModuleSeed(module: RackModule, seed: number): RackModule {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return module;
  const current = module.slots[module.activeSlot]!;
  const slot = { seed: seed >>> 0, params: { ...module.params }, handEdited: current.handEdited, pattern: clonePattern(current.pattern) };
  const slots = module.slots.map((current, index) => index === module.activeSlot ? slot : cloneSlot(current));
  return { ...module, seed: slot.seed, slots };
}

export function setModuleParams(module: RackModule, params: NumericParams): RackModule {
  const current = module.slots[module.activeSlot]!;
  const nextPattern = module.type === 'piano' && current.pattern !== null
    ? { ...current.pattern, lengthSteps: [16, 32, 64][params.length ?? 0] ?? 16, events: current.pattern.events.filter((event) => event.startStep < ([16, 32, 64][params.length ?? 0] ?? 16)) }
    : clonePattern(current.pattern);
  const slot = { seed: module.seed, params: { ...params }, handEdited: current.handEdited, pattern: nextPattern };
  const slots = module.slots.map((current, index) => index === module.activeSlot ? slot : cloneSlot(current));
  const updated = { ...module, params: slot.params, slots };
  return module.type === 'cc' && module.automation.length > 0 ? setCcAutomation(updated, module.automation) : updated;
}

export function setMutationIntensity(module: RackModule, intensity: 1 | 2 | 3 | 4): RackModule {
  return { ...module, mutation: { ...module.mutation, intensity } };
}

export function setMutationSchedule(module: RackModule, on: boolean, everyNLoops = module.mutation.everyNLoops): RackModule {
  const normalizedLoops = Math.max(1, Math.min(16, Math.round(everyNLoops)));
  return { ...module, mutation: { ...module.mutation, on, everyNLoops: normalizedLoops } };
}

export function mutateModule(module: RackModule): RackModule {
  if (module.type === 'mixer') return module;
  const revert = cloneSlot(module.slots[module.activeSlot]!);
  const mutated = setModuleSeed(module, mutationSeed(module.seed, module.mutation.intensity));
  return { ...mutated, mutation: { ...module.mutation, revert } };
}

export function revertModule(module: RackModule): RackModule {
  const revert = module.mutation.revert;
  if (revert === null) return module;
  const restored = setModuleParams(setModuleSeed(module, revert.seed), revert.params);
  return { ...restored, mutation: { ...module.mutation, revert: null } };
}

export function createRackState(shared: ShareableRack, soundMode: 'current' | 'legacy' = 'current'): RackState {
  const rack = normalizeRack(shared);
  return {
    bpm: rack.bpm,
    key: { ...rack.key },
    modules: rack.modules.map((module) => createModule(
      module.type,
      module.seed,
      module.params,
      module.sound ?? (soundMode === 'legacy' ? createLegacySound(module.type) : createDefaultSound(module.type)),
    )),
    mix: structuredClone(rack.mix ?? DEFAULT_RACK_MIX),
  };
}

function chordContext(modules: readonly RackModule[], key: MusicalKey): readonly ChordEvent[] | undefined {
  const chords = modules.find((candidate) => candidate.type === 'chords');
  if (chords === undefined) return undefined;
  const pattern = GENERATORS.chords.generate(chords.seed, chords.params, { key, bars: 1 });
  const duration = Math.max(1, chords.params.duration ?? 16);
  const count = Math.max(1, chords.params.length ?? 4);
  return Array.from({ length: count }, (_, index) => {
    const startStep = index * duration;
    const pitches = pattern.events
      .filter((event) => event.startStep >= startStep && event.startStep < startStep + Math.min(2, duration))
      .map((event) => event.pitch);
    return { startStep, durationSteps: duration, pitches };
  }).filter(({ pitches }) => pitches.length > 0);
}

function ccAutomationPattern(module: RackModule): Pattern | null {
  if (module.type !== 'cc' || module.automation.length === 0) return null;
  const events: NoteEvent[] = module.automation.map((point) => ({
    startStep: point.step,
    durationSteps: 0.01,
    pitch: 0,
    velocity: 1,
    cc: module.params[`cc${point.control}`] ?? 0,
    value: point.value,
    channel: module.params[`channel${point.control}`] ?? 1,
    lane: point.control - 1,
  }));
  return { lengthSteps: (module.params.bars ?? 1) * 16, stepsPerBeat: 4, events: events.sort((left, right) => left.startStep - right.startStep) };
}

export function modulePattern(module: RackModule, key: MusicalKey, rackModules: readonly RackModule[] = []): Pattern {
  if (module.type === 'piano') {
    const slot = module.slots[module.activeSlot]!;
    if (slot.handEdited && slot.pattern !== null) return clonePattern(slot.pattern)!;
  }
  const automation = ccAutomationPattern(module);
  if (automation !== null) return automation;
  const chords = module.type === 'arp' && module.params.followChords === 1 ? chordContext(rackModules, key) : undefined;
  return GENERATORS[module.type].generate(module.seed, module.params, {
    key,
    bars: Math.max(1, module.params.bars ?? 1),
    ...(chords === undefined ? {} : { chords }),
  });
}

export function setManualPattern(module: RackModule, pattern: Pattern): RackModule {
  if (module.type !== 'piano') return module;
  const slot = { ...cloneSlot(module.slots[module.activeSlot]!), handEdited: true, pattern: clonePattern(pattern) };
  return {
    ...module,
    shareable: false,
    slots: module.slots.map((current, index) => index === module.activeSlot ? slot : cloneSlot(current)),
  };
}

export function setCcAutomation(module: RackModule, automation: readonly CcAutomationPoint[]): RackModule {
  if (module.type !== 'cc') return module;
  const normalized = automation
    .map((point) => ({ ...point, step: Math.max(0, Math.min((module.params.bars ?? 1) * 16 - 0.25, Math.round(point.step * 4) / 4)), value: Math.max(0, Math.min(127, Math.round(point.value))) }))
    .sort((left, right) => left.step - right.step || left.control - right.control);
  return { ...module, automation: normalized, shareable: normalized.length === 0 };
}

export function setModuleSound(module: RackModule, sound: SoundState): RackModule {
  validateSoundState(module.type, sound);
  return { ...module, sound: structuredClone(sound) };
}

export function setModuleSoundParam(module: RackModule, key: string, value: number): RackModule {
  const next = key === 'pan' || key === 'delaySend' || key === 'reverbSend'
    ? { ...module.sound, [key]: value }
    : { ...module.sound, params: { ...module.sound.params, [key]: value } };
  return setModuleSound(module, next);
}

export function selectModulePreset(module: RackModule, presetId: string): RackModule {
  return setModuleSound(module, soundForPreset(module.type, presetId, module.sound));
}

export function upgradeModuleSound(module: RackModule): RackModule {
  return setModuleSound(module, createDefaultSound(module.type));
}

export function toEngineSnapshot(rack: RackState): EngineSnapshot {
  const snapshot: EngineSnapshot = {
    bpm: rack.bpm,
    modules: rack.modules.map((module) => Object.freeze({
      id: module.id,
      type: module.type,
      pattern: Object.freeze(modulePattern(module, rack.key, rack.modules)),
      mute: module.mute,
      solo: module.solo,
      monitor: module.monitor,
      level: module.level,
      midi: { ...module.midi },
    })),
  };
  Object.freeze(snapshot.modules);
  return Object.freeze(snapshot);
}

export function toSoundSnapshot(rack: RackState): RackSoundSnapshot {
  const snapshot: RackSoundSnapshot = {
    mix: Object.freeze({ ...rack.mix }),
    modules: rack.modules.map((module) => Object.freeze({
      id: module.id,
      type: module.type,
      sound: Object.freeze({ ...module.sound, params: Object.freeze({ ...module.sound.params }) }),
    })),
  };
  Object.freeze(snapshot.modules);
  return Object.freeze(snapshot);
}

export function toShareableRack(rack: RackState): ShareableRack {
  return {
    bpm: rack.bpm,
    key: { ...rack.key },
    modules: rack.modules.map((module) => ({
      type: module.type,
      seed: module.seed,
      params: { ...module.params },
      sound: { ...module.sound, params: { ...module.sound.params } },
    })),
    mix: { ...rack.mix },
  };
}

export function randomizeRack(rack: RackState): RackState {
  return {
    ...rack,
    modules: rack.modules.map((module) => module.type === 'mixer' || module.type === 'piano' ? module : setModuleSeed(module, randomSeed())),
  };
}

export function toggleDrumStep(module: RackModule, key: MusicalKey, lane: number, step: number): RackModule {
  if (module.type !== 'drums' || lane < 0 || lane > 7 || step < 0 || step > 31) return module;
  const pattern = modulePattern(module, key);
  let mask = 0;
  for (const event of pattern.events) {
    if (event.lane === lane) mask = (mask | 1 << Math.floor(event.startStep)) >>> 0;
  }
  mask = (mask ^ 1 << step) >>> 0;
  return setModuleParams(module, {
      ...module.params,
      overrideLanes: ((module.params.overrideLanes ?? 0) | 1 << lane) >>> 0,
      [`lane${lane}`]: mask,
  });
}

export function setRackKey(rack: RackState, root: number, scale: ScaleName): RackState {
  return { ...rack, key: { root, scale } };
}

export function applyScene(rack: RackState, scene: ProjectScene): RackState {
  return {
    ...rack,
    modules: rack.modules.map((module) => {
      const slot = scene.assignments[module.id];
      return slot === undefined ? module : setModuleSlot(module, slot);
    }),
  };
}
