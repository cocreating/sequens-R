import type { ModuleType, MusicalKey, Pattern, ScaleName } from '../core/pattern';
import { GENERATORS, type NumericParams } from '../generators';
import { normalizeRack } from '../share/codec';
import type { ShareableRack } from '../share/types';
import type { EngineSnapshot } from '../audio/types';
import { mutationSeed } from '../generators/shared';

export interface PatternSlot {
  seed: number;
  params: NumericParams;
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
} & Record<string, unknown>;

export interface RackState {
  bpm: number;
  key: MusicalKey;
  modules: RackModule[];
}

const DEFAULT_NAMES: Readonly<Record<ModuleType, string>> = {
  drums: 'Drums',
  bass: 'Bass',
  acid: 'Acid',
  chords: 'Chords',
  mixer: 'Mixer',
};

let nextModuleId = 0;

function createId(type: ModuleType): string {
  nextModuleId += 1;
  return `${type}-${nextModuleId}`;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function cloneSlot(slot: PatternSlot): PatternSlot {
  return { seed: slot.seed >>> 0, params: { ...slot.params } };
}

function createSlots(seed: number, params: NumericParams): PatternSlot[] {
  return Array.from({ length: 8 }, (_, index) => ({
    seed: index === 0 ? seed >>> 0 : (seed ^ Math.imul(index, 0x9e3779b9)) >>> 0,
    params: { ...params },
  }));
}

export function createModule(type: ModuleType, seed = randomSeed(), params?: Readonly<Record<string, number>>): RackModule {
  const normalizedParams = { ...GENERATORS[type].defaults, ...params };
  return {
    id: createId(type),
    type,
    name: DEFAULT_NAMES[type],
    seed,
    params: normalizedParams,
    slots: createSlots(seed, normalizedParams),
    activeSlot: 0,
    mutation: { on: false, intensity: 2, everyNLoops: 1, revert: null },
    shareable: true,
    collapsed: false,
    mute: false,
    solo: false,
    monitor: true,
    level: type === 'drums' ? 0.82 : type === 'mixer' ? 0 : 0.68,
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
  const slot = { seed: seed >>> 0, params: { ...module.params } };
  const slots = module.slots.map((current, index) => index === module.activeSlot ? slot : cloneSlot(current));
  return { ...module, seed: slot.seed, slots };
}

export function setModuleParams(module: RackModule, params: NumericParams): RackModule {
  const slot = { seed: module.seed, params: { ...params } };
  const slots = module.slots.map((current, index) => index === module.activeSlot ? slot : cloneSlot(current));
  return { ...module, params: slot.params, slots };
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
  const revert = { seed: module.seed, params: { ...module.params } };
  const mutated = setModuleSeed(module, mutationSeed(module.seed, module.mutation.intensity));
  return { ...mutated, mutation: { ...module.mutation, revert } };
}

export function revertModule(module: RackModule): RackModule {
  const revert = module.mutation.revert;
  if (revert === null) return module;
  const restored = setModuleParams(setModuleSeed(module, revert.seed), revert.params);
  return { ...restored, mutation: { ...module.mutation, revert: null } };
}

export function createRackState(shared: ShareableRack): RackState {
  const rack = normalizeRack(shared);
  return {
    bpm: rack.bpm,
    key: { ...rack.key },
    modules: rack.modules.map((module) => createModule(module.type, module.seed, module.params)),
  };
}

export function modulePattern(module: RackModule, key: MusicalKey): Pattern {
  return GENERATORS[module.type].generate(module.seed, module.params, { key, bars: 1 });
}

export function toEngineSnapshot(rack: RackState): EngineSnapshot {
  const snapshot: EngineSnapshot = {
    bpm: rack.bpm,
    modules: rack.modules.map((module) => Object.freeze({
      id: module.id,
      type: module.type,
      pattern: Object.freeze(modulePattern(module, rack.key)),
      mute: module.mute,
      solo: module.solo,
      monitor: module.monitor,
      level: module.level,
    })),
  };
  Object.freeze(snapshot.modules);
  return Object.freeze(snapshot);
}

export function toShareableRack(rack: RackState): ShareableRack {
  return {
    bpm: rack.bpm,
    key: { ...rack.key },
    modules: rack.modules.map((module) => ({ type: module.type, seed: module.seed, params: { ...module.params } })),
  };
}

export function randomizeRack(rack: RackState): RackState {
  return {
    ...rack,
    modules: rack.modules.map((module) => module.type === 'mixer' ? module : setModuleSeed(module, randomSeed())),
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
