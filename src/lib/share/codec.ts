import { SCALE_NAMES, type ModuleType, type ScaleName } from '../core/pattern';
import { decodeCbor, encodeCbor, type CborValue } from './cbor';
import { MODULE_TYPES, PARAM_SCHEMAS, validateParams } from './schema';
import type { ShareableModule, ShareableRack } from './types';

export const PATCH_SCHEMA_VERSION = 2;
const FORMAT = 'deflate-raw' as ConstructorParameters<typeof CompressionStream>[0];

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
  return { type: module.type, seed: module.seed >>> 0, params };
}

export function normalizeRack(rack: ShareableRack): ShareableRack {
  if (!Number.isFinite(rack.bpm) || rack.bpm < 20 || rack.bpm > 300 || Math.round(rack.bpm * 10) !== rack.bpm * 10) {
    throw new RangeError('BPM must be between 20 and 300 with 0.1 resolution.');
  }
  if (!Number.isInteger(rack.key.root) || rack.key.root < 0 || rack.key.root > 11) throw new RangeError('Invalid key root.');
  if (!SCALE_NAMES.includes(rack.key.scale)) throw new RangeError('Invalid scale.');
  if (rack.modules.length < 1 || rack.modules.length > 16) throw new RangeError('A shared rack must contain 1 to 16 modules.');
  return {
    bpm: rack.bpm,
    key: { ...rack.key },
    modules: rack.modules.map(normalizeModule),
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

function toTuple(rack: ShareableRack): CborValue {
  const normalized = normalizeRack(rack);
  return [
    Math.round(normalized.bpm * 10),
    normalized.key.root,
    SCALE_NAMES.indexOf(normalized.key.scale),
    normalized.modules.map((module) => [MODULE_TYPES.indexOf(module.type), module.seed, compactParams(module)]),
  ];
}

function decodeModule(value: CborValue): ShareableModule {
  const tuple = expectArray(value, 'Module');
  const type = MODULE_TYPES[expectInteger(tuple[0], 'Module type')];
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
  return normalizeModule({ type, seed, params });
}

function fromTuple(value: CborValue): ShareableRack {
  const tuple = expectArray(value, 'Rack');
  const scale = SCALE_NAMES[expectInteger(tuple[2], 'Scale')];
  if (scale === undefined) throw new RangeError('Unknown scale.');
  const modules = expectArray(tuple[3] ?? [], 'Modules').map(decodeModule);
  return normalizeRack({
    bpm: expectInteger(tuple[0], 'BPM') / 10,
    key: { root: expectInteger(tuple[1], 'Root'), scale },
    modules,
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
  if (version !== 1 && version !== PATCH_SCHEMA_VERSION) throw new RangeError(`Unsupported patch schema version ${String(version)}.`);
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
