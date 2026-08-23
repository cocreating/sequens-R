import { SCALE_NAMES, type ScaleName } from '../core/pattern';
import { validateParams } from '../share/schema';
import type { ShareableRack } from '../share/types';
import {
  createModule,
  createRackState,
  type MutationState,
  type PatternSlot,
  type RackModule,
  type RackState,
} from '../state/rack';

export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectRack {
  id: string;
  name: string;
  state: RackState;
}

export interface ProjectDocument {
  schemaVersion: number;
  id: string;
  name: string;
  racks: ProjectRack[];
  activeRackId: string;
  scenes: unknown[];
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

function now(): number {
  return new Date().getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function normalizeSlot(value: unknown, type: RackModule['type']): PatternSlot {
  if (!isRecord(value)) throw new TypeError('Pattern slot must be an object.');
  const seed = expectNumber(value.seed, 'Pattern seed');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Pattern seed must be a uint32.');
  if (!isRecord(value.params)) throw new TypeError('Pattern params must be an object.');
  const params = Object.fromEntries(Object.entries(value.params).map(([key, entry]) => [key, expectNumber(entry, `${type}.${key}`)]));
  validateParams(type, params);
  return { seed: seed >>> 0, params };
}

function normalizeMutation(value: unknown, type: RackModule['type']): MutationState {
  if (!isRecord(value)) return { on: false, intensity: 2, everyNLoops: 1, revert: null };
  const intensity = value.intensity;
  if (intensity !== 1 && intensity !== 2 && intensity !== 3 && intensity !== 4) throw new RangeError('Mutation intensity must be 1 to 4.');
  const everyNLoops = value.everyNLoops === undefined ? 1 : expectNumber(value.everyNLoops, 'Mutation loop interval');
  if (!Number.isInteger(everyNLoops) || everyNLoops < 1 || everyNLoops > 16) throw new RangeError('Mutation loop interval must be 1 to 16.');
  return { on: Boolean(value.on), intensity, everyNLoops, revert: value.revert === null || value.revert === undefined ? null : normalizeSlot(value.revert, type) };
}

function normalizeModule(value: unknown): RackModule {
  if (!isRecord(value)) throw new TypeError('Project module must be an object.');
  const type = value.type;
  if (type !== 'drums' && type !== 'bass' && type !== 'acid' && type !== 'chords' && type !== 'mixer') throw new RangeError('Unknown module type.');
  const rawSlots = Array.isArray(value.slots) ? value.slots : [];
  if (rawSlots.length !== 8) throw new RangeError('A module must contain exactly eight pattern slots.');
  const slots = rawSlots.map((slot) => normalizeSlot(slot, type));
  const activeSlot = expectNumber(value.activeSlot, 'Active slot');
  if (!Number.isInteger(activeSlot) || activeSlot < 0 || activeSlot > 7) throw new RangeError('Active slot must be 0 to 7.');
  const active = slots[activeSlot]!;
  const module = createModule(type, active.seed, active.params);
  return {
    ...module,
    id: expectString(value.id, 'Module id'),
    name: expectString(value.name, 'Module name'),
    slots,
    activeSlot,
    seed: active.seed,
    params: { ...active.params },
    mutation: normalizeMutation(value.mutation, type),
    collapsed: Boolean(value.collapsed),
    mute: Boolean(value.mute),
    solo: Boolean(value.solo),
    monitor: value.monitor === undefined ? true : Boolean(value.monitor),
    level: Math.max(0, Math.min(1, expectNumber(value.level, 'Module level'))),
    shareable: value.shareable === undefined ? true : Boolean(value.shareable),
  };
}

function normalizeRackState(value: unknown): RackState {
  if (!isRecord(value) || !isRecord(value.key) || !Array.isArray(value.modules)) throw new TypeError('Rack state is malformed.');
  const bpm = expectNumber(value.bpm, 'BPM');
  if (bpm < 20 || bpm > 300 || Math.round(bpm * 10) !== bpm * 10) throw new RangeError('Invalid BPM.');
  const root = expectNumber(value.key.root, 'Key root');
  const scale = value.key.scale;
  if (!Number.isInteger(root) || root < 0 || root > 11 || typeof scale !== 'string' || !SCALE_NAMES.includes(scale as ScaleName)) throw new RangeError('Invalid musical key.');
  const modules = value.modules.map(normalizeModule);
  if (modules.length < 1 || modules.length > 16) throw new RangeError('A rack must contain 1 to 16 modules.');
  return { bpm, key: { root, scale: scale as ScaleName }, modules };
}

export function createProject(rack: RackState, name = 'Untitled Project'): ProjectDocument {
  const timestamp = now();
  const rackId = crypto.randomUUID();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    racks: [{ id: rackId, name: 'Rack 1', state: structuredClone(rack) }],
    activeRackId: rackId,
    scenes: [],
    settings: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function activeProjectRack(project: ProjectDocument): ProjectRack {
  const rack = project.racks.find(({ id }) => id === project.activeRackId);
  if (rack === undefined) throw new RangeError('The active rack does not exist.');
  return rack;
}

export function updateProjectRack(project: ProjectDocument, rack: RackState, name = project.name): ProjectDocument {
  return {
    ...project,
    name,
    updatedAt: now(),
    racks: project.racks.map((entry) => entry.id === project.activeRackId ? { ...entry, state: structuredClone(rack) } : entry),
  };
}

function migrateLegacyProject(value: Record<string, unknown>): ProjectDocument {
  const rack = value.rack as ShareableRack;
  return createProject(createRackState(rack), typeof value.name === 'string' ? value.name : 'Imported Project');
}

export function migrateProject(value: unknown): ProjectDocument {
  if (!isRecord(value)) throw new TypeError('Project file must contain an object.');
  if (value.schemaVersion === 0) return migrateLegacyProject(value);
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new RangeError(`Unsupported project schema version ${String(value.schemaVersion)}.`);
  if (!Array.isArray(value.racks) || value.racks.length < 1) throw new RangeError('A project must contain at least one rack.');
  const racks = value.racks.map((entry): ProjectRack => {
    if (!isRecord(entry)) throw new TypeError('Project rack must be an object.');
    return { id: expectString(entry.id, 'Rack id'), name: expectString(entry.name, 'Rack name'), state: normalizeRackState(entry.state) };
  });
  const activeRackId = expectString(value.activeRackId, 'Active rack id');
  if (!racks.some(({ id }) => id === activeRackId)) throw new RangeError('The active rack does not exist.');
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: expectString(value.id, 'Project id'),
    name: expectString(value.name, 'Project name'),
    racks,
    activeRackId,
    scenes: Array.isArray(value.scenes) ? structuredClone(value.scenes) : [],
    settings: isRecord(value.settings) ? structuredClone(value.settings) : {},
    createdAt: expectNumber(value.createdAt, 'Created time'),
    updatedAt: expectNumber(value.updatedAt, 'Updated time'),
  };
}

export function projectToJson(project: ProjectDocument): string {
  return `${JSON.stringify(migrateProject(project), null, 2)}\n`;
}

export function projectFromJson(json: string): ProjectDocument {
  return migrateProject(JSON.parse(json) as unknown);
}

export function nonShareableModuleNames(rack: RackState): string[] {
  return rack.modules.filter(({ shareable }) => !shareable).map(({ name }) => name);
}
