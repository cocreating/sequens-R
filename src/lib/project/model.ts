import { SCALE_NAMES, type NoteEvent, type Pattern, type ScaleName } from '../core/pattern';
import { MODULE_TYPES, validateParams } from '../share/schema';
import type { ShareableRack } from '../share/types';
import { createDefaultSound, DEFAULT_RACK_MIX, normalizeRackMixState, normalizeSoundState, SOUND_PRESET_IDS } from '../audio/sound';
import {
  createModule,
  createRackState,
  setCcAutomation,
  type MutationState,
  type PatternSlot,
  type RackModule,
  type RackState,
} from '../state/rack';
import { normalizeModuleColor } from '../state/module-color';

export const PROJECT_SCHEMA_VERSION = 7;
export const DEFAULT_PROJECT_NAME = 'New Project';
const LEGACY_DEFAULT_PROJECT_NAME = 'Untitled Project';

export interface ProjectRack {
  id: string;
  name: string;
  state: RackState;
}

export interface ProjectScene {
  id: string;
  name: string;
  assignments: Record<string, number>;
}

export interface ProjectDocument {
  schemaVersion: number;
  id: string;
  name: string;
  racks: ProjectRack[];
  activeRackId: string;
  scenes: ProjectScene[];
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

function normalizeEvent(value: unknown): NoteEvent {
  if (!isRecord(value)) throw new TypeError('Pattern event must be an object.');
  const event: NoteEvent = {
    startStep: expectNumber(value.startStep, 'Event start'),
    durationSteps: expectNumber(value.durationSteps, 'Event duration'),
    pitch: expectNumber(value.pitch, 'Event pitch'),
    velocity: expectNumber(value.velocity, 'Event velocity'),
  };
  for (const key of ['lane', 'channel', 'channelOffset', 'cc', 'value'] as const) {
    if (value[key] !== undefined) event[key] = expectNumber(value[key], `Event ${key}`);
  }
  if (value.slide !== undefined) event.slide = Boolean(value.slide);
  if (value.accent !== undefined) event.accent = Boolean(value.accent);
  return event;
}

function normalizePattern(value: unknown): Pattern {
  if (!isRecord(value) || !Array.isArray(value.events)) throw new TypeError('Manual pattern must be an object.');
  const lengthSteps = expectNumber(value.lengthSteps, 'Pattern length');
  const stepsPerBeat = expectNumber(value.stepsPerBeat, 'Pattern resolution');
  if (lengthSteps <= 0 || stepsPerBeat <= 0) throw new RangeError('Pattern timing must be positive.');
  const events = value.events.map(normalizeEvent);
  const laneLengths = value.laneLengths;
  return {
    lengthSteps,
    stepsPerBeat,
    events,
    ...(Array.isArray(laneLengths) ? { laneLengths: laneLengths.map((entry) => expectNumber(entry, 'Lane length')) } : {}),
  };
}

function normalizeSlot(value: unknown, type: RackModule['type']): PatternSlot {
  if (!isRecord(value)) throw new TypeError('Pattern slot must be an object.');
  const seed = expectNumber(value.seed, 'Pattern seed');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Pattern seed must be a uint32.');
  if (!isRecord(value.params)) throw new TypeError('Pattern params must be an object.');
  const params = Object.fromEntries(Object.entries(value.params).map(([key, entry]) => [key, expectNumber(entry, `${type}.${key}`)]));
  validateParams(type, params);
  const pattern = value.pattern === null || value.pattern === undefined ? null : normalizePattern(value.pattern);
  return { seed: seed >>> 0, params, handEdited: Boolean(value.handEdited), pattern };
}

function normalizeMutation(value: unknown, type: RackModule['type']): MutationState {
  if (!isRecord(value)) return { on: false, intensity: 2, everyNLoops: 1, revert: null };
  const intensity = value.intensity;
  if (intensity !== 1 && intensity !== 2 && intensity !== 3 && intensity !== 4) throw new RangeError('Mutation intensity must be 1 to 4.');
  const everyNLoops = value.everyNLoops === undefined ? 1 : expectNumber(value.everyNLoops, 'Mutation loop interval');
  if (!Number.isInteger(everyNLoops) || everyNLoops < 1 || everyNLoops > 16) throw new RangeError('Mutation loop interval must be 1 to 16.');
  return { on: Boolean(value.on), intensity, everyNLoops, revert: value.revert === null || value.revert === undefined ? null : normalizeSlot(value.revert, type) };
}

function normalizeReleasedSound(type: RackModule['type'], value: unknown, hasReleasedSound: boolean) {
  if (!hasReleasedSound || !isRecord(value) || typeof value.presetId !== 'string' || !SOUND_PRESET_IDS.includes(value.presetId)) {
    return createDefaultSound(type);
  }
  return normalizeSoundState(type, value);
}

function normalizeModule(value: unknown, hasReleasedSound: boolean): RackModule {
  if (!isRecord(value)) throw new TypeError('Project module must be an object.');
  const type = value.type;
  if (typeof type !== 'string' || !MODULE_TYPES.includes(type as RackModule['type'])) throw new RangeError('Unknown module type.');
  const normalizedType = type as RackModule['type'];
  const rawSlots = Array.isArray(value.slots) ? value.slots : [];
  if (rawSlots.length !== 8) throw new RangeError('A module must contain exactly eight pattern slots.');
  const slots = rawSlots.map((slot) => normalizeSlot(slot, normalizedType));
  const activeSlot = expectNumber(value.activeSlot, 'Active slot');
  if (!Number.isInteger(activeSlot) || activeSlot < 0 || activeSlot > 7) throw new RangeError('Active slot must be 0 to 7.');
  const active = slots[activeSlot]!;
  const sound = normalizeReleasedSound(normalizedType, value.sound, hasReleasedSound);
  const module = createModule(normalizedType, active.seed, active.params, sound);
  const automation = Array.isArray(value.automation) ? value.automation.map((entry) => {
    if (!isRecord(entry)) throw new TypeError('CC automation point must be an object.');
    const control = expectNumber(entry.control, 'CC automation control');
    if (control !== 1 && control !== 2 && control !== 3 && control !== 4) throw new RangeError('CC automation control must be 1 to 4.');
    return { control: control as 1 | 2 | 3 | 4, step: expectNumber(entry.step, 'CC automation step'), value: expectNumber(entry.value, 'CC automation value') };
  }) : [];
  if (normalizedType !== 'cc' && automation.length > 0) throw new RangeError('Only CC Control modules can contain automation.');
  const normalized: RackModule = {
    ...module,
    id: expectString(value.id, 'Module id'),
    name: expectString(value.name, 'Module name'),
    color: normalizeModuleColor(value.color, normalizedType),
    slots,
    activeSlot,
    seed: active.seed,
    params: { ...active.params },
    mutation: normalizeMutation(value.mutation, normalizedType),
    collapsed: Boolean(value.collapsed),
    mute: Boolean(value.mute),
    solo: Boolean(value.solo),
    monitor: value.monitor === undefined ? true : Boolean(value.monitor),
    level: Math.max(0, Math.min(1, expectNumber(value.level, 'Module level'))),
    sound,
    midi: normalizeMidiRoute(value.midi, type === 'drums' ? 10 : 1),
    shareable: normalizedType !== 'piano' && automation.length === 0 && (value.shareable === undefined ? true : Boolean(value.shareable)),
    automation,
  };
  return normalizedType === 'cc' ? setCcAutomation(normalized, automation) : normalized;
}

function normalizeMidiRoute(value: unknown, defaultChannel: number): { portId: string | null; channel: number } {
  if (value === undefined) return { portId: null, channel: defaultChannel };
  if (!isRecord(value)) throw new TypeError('MIDI route must be an object.');
  const portId = value.portId;
  const channel = expectNumber(value.channel, 'MIDI channel');
  if (portId !== null && typeof portId !== 'string') throw new TypeError('MIDI port id must be a string or null.');
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) throw new RangeError('MIDI channel must be 1 to 16.');
  return { portId, channel };
}

function normalizeRackState(value: unknown, hasReleasedSound: boolean): RackState {
  if (!isRecord(value) || !isRecord(value.key) || !Array.isArray(value.modules)) throw new TypeError('Rack state is malformed.');
  const bpm = expectNumber(value.bpm, 'BPM');
  if (bpm < 20 || bpm > 300 || Math.round(bpm * 10) !== bpm * 10) throw new RangeError('Invalid BPM.');
  const root = expectNumber(value.key.root, 'Key root');
  const scale = value.key.scale;
  if (!Number.isInteger(root) || root < 0 || root > 11 || typeof scale !== 'string' || !SCALE_NAMES.includes(scale as ScaleName)) throw new RangeError('Invalid musical key.');
  const modules = value.modules.map((module) => normalizeModule(module, hasReleasedSound));
  if (modules.length < 1 || modules.length > 16) throw new RangeError('A rack must contain 1 to 16 modules.');
  const mix = hasReleasedSound ? normalizeRackMixState(value.mix) : structuredClone(DEFAULT_RACK_MIX);
  return { bpm, key: { root, scale: scale as ScaleName }, modules, mix };
}

function normalizeScene(value: unknown): ProjectScene {
  if (!isRecord(value) || !isRecord(value.assignments)) throw new TypeError('Project scene must contain assignments.');
  const assignments: Record<string, number> = {};
  for (const [moduleId, rawSlot] of Object.entries(value.assignments)) {
    const slot = expectNumber(rawSlot, `Scene assignment for ${moduleId}`);
    if (!Number.isInteger(slot) || slot < 0 || slot > 7) throw new RangeError('Scene assignments must reference slots 0 to 7.');
    assignments[expectString(moduleId, 'Scene module id')] = slot;
  }
  return { id: expectString(value.id, 'Scene id'), name: expectString(value.name, 'Scene name'), assignments };
}

export function createProject(rack: RackState, name = DEFAULT_PROJECT_NAME): ProjectDocument {
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

function migrateSingleRackProject(value: Record<string, unknown>): ProjectDocument {
  const rack = value.rack as ShareableRack;
  return createProject(createRackState(rack), typeof value.name === 'string' ? value.name : 'Imported Project');
}

export function migrateProject(value: unknown): ProjectDocument {
  if (!isRecord(value)) throw new TypeError('Project file must contain an object.');
  if (value.schemaVersion === 0) return migrateSingleRackProject(value);
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4 && value.schemaVersion !== 5 && value.schemaVersion !== 6 && value.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new RangeError(`Unsupported project schema version ${String(value.schemaVersion)}.`);
  const hasReleasedSound = value.schemaVersion === 4 || value.schemaVersion === 5 || value.schemaVersion === 6 || value.schemaVersion === PROJECT_SCHEMA_VERSION;
  if (!Array.isArray(value.racks) || value.racks.length < 1) throw new RangeError('A project must contain at least one rack.');
  const racks = value.racks.map((entry): ProjectRack => {
    if (!isRecord(entry)) throw new TypeError('Project rack must be an object.');
    return { id: expectString(entry.id, 'Rack id'), name: expectString(entry.name, 'Rack name'), state: normalizeRackState(entry.state, hasReleasedSound) };
  });
  const activeRackId = expectString(value.activeRackId, 'Active rack id');
  const projectName = expectString(value.name, 'Project name');
  if (!racks.some(({ id }) => id === activeRackId)) throw new RangeError('The active rack does not exist.');
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: expectString(value.id, 'Project id'),
    name: projectName === LEGACY_DEFAULT_PROJECT_NAME ? DEFAULT_PROJECT_NAME : projectName,
    racks,
    activeRackId,
    scenes: Array.isArray(value.scenes) ? value.scenes.map(normalizeScene) : [],
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

export function captureProjectScene(project: ProjectDocument, rack: RackState, name = `Scene ${project.scenes.length + 1}`): ProjectDocument {
  const scene: ProjectScene = {
    id: crypto.randomUUID(),
    name,
    assignments: Object.fromEntries(rack.modules.map((module) => [module.id, module.activeSlot])),
  };
  return { ...project, scenes: [...project.scenes, scene], updatedAt: now() };
}

export function renameProjectScene(project: ProjectDocument, sceneId: string, name: string): ProjectDocument {
  const normalized = name.trimStart() || 'Untitled scene';
  return { ...project, scenes: project.scenes.map((scene) => scene.id === sceneId ? { ...scene, name: normalized } : scene), updatedAt: now() };
}

export function deleteProjectScene(project: ProjectDocument, sceneId: string): ProjectDocument {
  return { ...project, scenes: project.scenes.filter((scene) => scene.id !== sceneId), updatedAt: now() };
}
