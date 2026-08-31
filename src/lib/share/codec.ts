import { SCALE_NAMES, type ModuleType, type ScaleName } from '../core/pattern';
import { decodeCbor, encodeCbor, type CborValue } from './cbor';
import { MODULE_TYPES, PARAM_SCHEMAS, validateParams } from './schema';
import type { ShareableModule, ShareableRack } from './types';
import {
  DEFAULT_RACK_MIX,
  normalizeRackMixState,
  normalizeSoundState,
  presetById,
  SOUND_PARAM_SCHEMAS,
  SOUND_PRESET_IDS,
  validateRackMixState,
  type RackMixState,
  type SoundState,
} from '../audio/sound';

export const PATCH_SCHEMA_VERSION = 5;
const COMPATIBLE_PATCH_SCHEMA_VERSIONS = [4, PATCH_SCHEMA_VERSION] as const;
const FORMAT = 'deflate-raw' as ConstructorParameters<typeof CompressionStream>[0];
const RETIRED_MIXER_MODULE_CODE = 4;
const RETIRED_MIXER_PRESET_CODE = 4;

function moduleTypeCode(type: ModuleType): number {
  const index = MODULE_TYPES.indexOf(type);
  return index < RETIRED_MIXER_MODULE_CODE ? index : index + 1;
}

function moduleTypeForCode(code: number): ModuleType | undefined {
  if (code === RETIRED_MIXER_MODULE_CODE) return undefined;
  return MODULE_TYPES[code < RETIRED_MIXER_MODULE_CODE ? code : code - 1];
}

function soundPresetCode(presetId: string): number {
  const index = SOUND_PRESET_IDS.indexOf(presetId);
  return index < RETIRED_MIXER_PRESET_CODE ? index : index + 1;
}

function soundPresetIdForCode(code: number): string | undefined {
  if (code === RETIRED_MIXER_PRESET_CODE) return undefined;
  return SOUND_PRESET_IDS[code < RETIRED_MIXER_PRESET_CODE ? code : code - 1];
}

function expectArray(value: CborValue, label: string): readonly CborValue[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function expectInteger(value: CborValue | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new TypeError(`${label} must be an integer.`);
  return value;
}

function normalizeModule(module: ShareableModule): ShareableModule {
  if (module.type === 'piano') throw new RangeError('Piano roll modules must be exported as a project, not shared by link.');
  if (!Number.isInteger(module.seed) || module.seed < 0 || module.seed > 0xffffffff) {
    throw new RangeError('Module seed must be a uint32.');
  }
  validateParams(module.type, module.params);
  const params: Record<string, number> = {};
  for (const definition of PARAM_SCHEMAS[module.type]) {
    params[definition.key] = module.params[definition.key] ?? definition.defaultValue;
  }
  const sound = module.sound === undefined ? undefined : normalizeSoundState(module.type, module.sound);
  return { type: module.type, seed: module.seed >>> 0, params, ...(sound === undefined ? {} : { sound }) };
}

export function normalizeRack(rack: ShareableRack): ShareableRack {
  if (!Number.isFinite(rack.bpm) || rack.bpm < 20 || rack.bpm > 300 || Math.round(rack.bpm * 10) !== rack.bpm * 10) {
    throw new RangeError('BPM must be between 20 and 300 with 0.1 resolution.');
  }
  if (!Number.isInteger(rack.key.root) || rack.key.root < 0 || rack.key.root > 11) throw new RangeError('Invalid key root.');
  if (!SCALE_NAMES.includes(rack.key.scale)) throw new RangeError('Invalid scale.');
  if (rack.modules.length < 1 || rack.modules.length > 16) throw new RangeError('A shared rack must contain 1 to 16 modules.');
  const mix = rack.mix === undefined ? undefined : normalizeRackMixState(rack.mix);
  return {
    bpm: rack.bpm,
    key: { ...rack.key },
    modules: rack.modules.map(normalizeModule),
    ...(mix === undefined ? {} : { mix }),
  };
}

function compactParams(module: ShareableModule): readonly CborValue[] {
  const schema = PARAM_SCHEMAS[module.type];
  const values: CborValue[] = schema.map((definition) => {
    const value = module.params[definition.key] ?? definition.defaultValue;
    return value === definition.defaultValue ? null : value;
  });
  while (values.at(-1) === null) values.pop();
  return values;
}

function compactSound(type: ModuleType, sound: SoundState): readonly CborValue[] {
  const preset = presetById(sound.presetId);
  const values: CborValue[] = SOUND_PARAM_SCHEMAS[type].map((definition) => {
    const value = sound.params[definition.key]!;
    return value === preset.params[definition.key] ? null : value;
  });
  while (values.at(-1) === null) values.pop();
  const tuple: CborValue[] = [soundPresetCode(sound.presetId), values];
  const output = [sound.pan + 100, sound.delaySend, sound.reverbSend];
  if (sound.pan !== 0 || sound.delaySend !== 0 || sound.reverbSend !== 0) tuple.push(...output);
  return tuple;
}

const MIX_KEYS = ['delayDivision', 'delayFeedback', 'delayReturn', 'reverbReturn', 'masterCharacter'] as const satisfies readonly (keyof RackMixState)[];

function compactMix(mix: RackMixState): readonly CborValue[] {
  validateRackMixState(mix);
  const values: CborValue[] = MIX_KEYS.map((key) => mix[key] === DEFAULT_RACK_MIX[key] ? null : mix[key]);
  while (values.at(-1) === null) values.pop();
  return values;
}

function toTuple(rack: ShareableRack): CborValue {
  const normalized = normalizeRack(rack);
  return [
    Math.round(normalized.bpm * 10),
    normalized.key.root,
    SCALE_NAMES.indexOf(normalized.key.scale),
    normalized.modules.map((module) => [
      moduleTypeCode(module.type),
      module.seed,
      compactParams(module),
      ...(module.sound === undefined ? [] : [compactSound(module.type, module.sound)]),
    ]),
    ...(normalized.mix === undefined ? [] : [compactMix(normalized.mix)]),
  ];
}

function decodeSound(type: ModuleType, value: CborValue): SoundState {
  const tuple = expectArray(value, 'Module sound');
  const presetId = soundPresetIdForCode(expectInteger(tuple[0], 'Sound preset'));
  if (presetId === undefined) throw new RangeError('Unknown sound preset index.');
  const preset = presetById(presetId);
  if (preset.moduleType !== type) throw new RangeError(`${presetId} cannot be used by ${type}.`);
  const encodedParams = expectArray(tuple[1] ?? [], 'Sound params');
  const schema = SOUND_PARAM_SCHEMAS[type];
  if (encodedParams.length > schema.length) throw new RangeError('Sound state has unknown parameters.');
  const params: Record<string, number> = {};
  for (let index = 0; index < schema.length; index += 1) {
    const definition = schema[index]!;
    const encoded = encodedParams[index];
    params[definition.key] = encoded === undefined || encoded === null
      ? preset.params[definition.key]!
      : expectInteger(encoded, `${type}.sound.${definition.key}`);
  }
  return normalizeSoundState(type, {
    engineVersion: 2,
    presetId,
    params,
    pan: tuple[2] === undefined ? 0 : expectInteger(tuple[2], `${type}.pan`) - 100,
    delaySend: tuple[3] === undefined ? 0 : expectInteger(tuple[3], `${type}.delaySend`),
    reverbSend: tuple[4] === undefined ? 0 : expectInteger(tuple[4], `${type}.reverbSend`),
  });
}

function decodeModule(value: CborValue): ShareableModule {
  const tuple = expectArray(value, 'Module');
  const type = moduleTypeForCode(expectInteger(tuple[0], 'Module type'));
  if (type === undefined) throw new RangeError('Unknown module type.');
  const seed = expectInteger(tuple[1], 'Module seed');
  const encodedParams = expectArray(tuple[2] ?? [], 'Module params');
  const schema = PARAM_SCHEMAS[type];
  if (encodedParams.length > schema.length) throw new RangeError('Module has unknown parameters.');
  const params: Record<string, number> = {};
  for (let index = 0; index < schema.length; index += 1) {
    const definition = schema[index]!;
    const encoded = encodedParams[index];
    params[definition.key] = encoded === undefined || encoded === null
      ? definition.defaultValue
      : expectInteger(encoded, `${type}.${definition.key}`);
  }
  const sound = tuple[3] === undefined ? undefined : decodeSound(type, tuple[3]);
  return normalizeModule({ type, seed, params, ...(sound === undefined ? {} : { sound }) });
}

function decodeMix(value: CborValue): RackMixState {
  const tuple = expectArray(value, 'Rack mix');
  if (tuple.length > MIX_KEYS.length) throw new RangeError('Rack mix has unknown parameters.');
  return normalizeRackMixState(Object.fromEntries(MIX_KEYS.map((key, index) => [key, tuple[index] === undefined || tuple[index] === null ? DEFAULT_RACK_MIX[key] : expectInteger(tuple[index], `mix.${key}`)])));
}

function fromTuple(value: CborValue): ShareableRack {
  const tuple = expectArray(value, 'Rack');
  const scale = SCALE_NAMES[expectInteger(tuple[2], 'Scale')];
  if (scale === undefined) throw new RangeError('Unknown scale.');
  const modules = expectArray(tuple[3] ?? [], 'Modules').map(decodeModule);
  const mix = tuple[4] === undefined ? undefined : decodeMix(tuple[4]);
  return normalizeRack({
    bpm: expectInteger(tuple[0], 'BPM') / 10,
    key: { root: expectInteger(tuple[1], 'Root'), scale },
    modules,
    ...(mix === undefined ? {} : { mix }),
  });
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const output = new Blob([body]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

export async function serializeRack(rack: ShareableRack): Promise<Uint8Array> {
  const body = encodeCbor(toTuple(rack));
  const versioned = new Uint8Array(body.length + 1);
  versioned[0] = PATCH_SCHEMA_VERSION;
  versioned.set(body, 1);
  return transform(versioned, new CompressionStream(FORMAT));
}

export async function deserializeRack(compressed: Uint8Array): Promise<ShareableRack> {
  const versioned = await transform(compressed, new DecompressionStream(FORMAT));
  const version = versioned[0];
  if (!COMPATIBLE_PATCH_SCHEMA_VERSIONS.includes(version as (typeof COMPATIBLE_PATCH_SCHEMA_VERSIONS)[number])) {
    throw new RangeError(`Unsupported patch schema version ${String(version)}.`);
  }
  return fromTuple(decodeCbor(versioned.subarray(1)));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError('Invalid base64url patch.');
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
