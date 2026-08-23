import type { ModuleType, MusicalKey, Pattern, ScaleName } from '../core/pattern';
import { GENERATORS, type NumericParams } from '../generators';
import { normalizeRack } from '../share/codec';
import type { ShareableRack } from '../share/types';
import type { EngineSnapshot } from '../audio/types';

export type RackModule = {
  id: string;
  type: ModuleType;
  name: string;
  seed: number;
  params: NumericParams;
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

export function createModule(type: ModuleType, seed = randomSeed(), params?: Readonly<Record<string, number>>): RackModule {
  return {
    id: createId(type),
    type,
    name: DEFAULT_NAMES[type],
    seed,
    params: { ...GENERATORS[type].defaults, ...params },
    collapsed: false,
    mute: false,
    solo: false,
    monitor: true,
    level: type === 'drums' ? 0.82 : type === 'mixer' ? 0 : 0.68,
  };
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
    modules: rack.modules.map((module) => module.type === 'mixer' ? module : { ...module, seed: randomSeed() }),
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
  return {
    ...module,
    params: {
      ...module.params,
      overrideLanes: ((module.params.overrideLanes ?? 0) | 1 << lane) >>> 0,
      [`lane${lane}`]: mask,
    },
  };
}

export function setRackKey(rack: RackState, root: number, scale: ScaleName): RackState {
  return { ...rack, key: { root, scale } };
}
