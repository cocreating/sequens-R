import type { ModuleType, ParamDefinition, ParamSchema } from '../core/pattern';

export const SOUND_ENGINE_VERSION = 2 as const;

export interface SoundState {
  engineVersion: typeof SOUND_ENGINE_VERSION;
  presetId: string;
  params: Record<string, number>;
  pan: number;
  delaySend: number;
  reverbSend: number;
}

export interface RackMixState {
  delayDivision: number;
  delayFeedback: number;
  delayReturn: number;
  reverbReturn: number;
  masterCharacter: number;
}

export interface SoundPreset {
  id: string;
  engineVersion: typeof SOUND_ENGINE_VERSION;
  moduleType: ModuleType;
  label: string;
  params: Readonly<Record<string, number>>;
  outputTrimDb: number;
  provenance: 'procedural' | { assetId: string; license: string; source: string };
}

export const DEFAULT_RACK_MIX: Readonly<RackMixState> = Object.freeze({
  delayDivision: 2,
  delayFeedback: 35,
  delayReturn: 0,
  reverbReturn: 0,
  masterCharacter: 0,
});

export const RACK_MIX_SCHEMA: ParamSchema = Object.freeze([
  { key: 'delayDivision', label: 'Delay division', min: 0, max: 5, step: 1, defaultValue: 2, options: ['1/4', '1/8', '1/8 dotted', '1/8 triplet', '1/16', '1/16 dotted'], control: 'select' },
  { key: 'delayFeedback', label: 'Delay feedback', min: 0, max: 90, step: 1, defaultValue: 35, unit: '%', control: 'knob' },
  { key: 'delayReturn', label: 'Delay return', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
  { key: 'reverbReturn', label: 'Reverb return', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
  { key: 'masterCharacter', label: 'Master character', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
]);

const COMMON_OUTPUT_SCHEMA = Object.freeze({
  pan: { key: 'pan', label: 'Pan', min: -100, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
  delaySend: { key: 'delaySend', label: 'Delay send', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
  reverbSend: { key: 'reverbSend', label: 'Reverb send', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
} satisfies Record<'pan' | 'delaySend' | 'reverbSend', ParamDefinition>);

export const SOUND_OUTPUT_SCHEMA: ParamSchema = Object.freeze(Object.values(COMMON_OUTPUT_SCHEMA));

const silentSchema: ParamSchema = Object.freeze([]);

function defineSchema(definitions: ParamDefinition[]): ParamSchema {
  return Object.freeze(definitions);
}

export const SOUND_PARAM_SCHEMAS: Readonly<Record<ModuleType, ParamSchema>> = Object.freeze({
  drums: defineSchema([
    { key: 'tone', label: 'Tone', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%', control: 'knob' },
    { key: 'punch', label: 'Punch', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%', control: 'knob' },
    { key: 'decay', label: 'Decay', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%', control: 'knob' },
  ]),
  bass: defineSchema([
    { key: 'wave', label: 'Wave', min: 0, max: 2, step: 1, defaultValue: 1, options: ['Sine', 'Square', 'Saw'], control: 'segmented' },
    { key: 'cutoff', label: 'Cutoff', min: 0, max: 100, step: 1, defaultValue: 58, unit: '%', control: 'knob' },
    { key: 'resonance', label: 'Resonance', min: 0, max: 100, step: 1, defaultValue: 18, unit: '%', control: 'knob' },
    { key: 'envelope', label: 'Envelope', min: 0, max: 100, step: 1, defaultValue: 46, unit: '%', control: 'knob' },
    { key: 'drive', label: 'Drive', min: 0, max: 100, step: 1, defaultValue: 0, unit: '%', control: 'knob' },
    { key: 'glide', label: 'Glide', min: 0, max: 100, step: 1, defaultValue: 12, unit: '%', control: 'knob' },
    { key: 'sub', label: 'Sub', min: 0, max: 100, step: 1, defaultValue: 35, unit: '%', control: 'knob' },
  ]),
  acid: defineSchema([
    { key: 'wave', label: 'Wave', min: 0, max: 1, step: 1, defaultValue: 0, options: ['Saw', 'Square'], control: 'segmented' },
    { key: 'cutoff', label: 'Cutoff', min: 0, max: 100, step: 1, defaultValue: 52, unit: '%', control: 'knob' },
    { key: 'resonance', label: 'Resonance', min: 0, max: 100, step: 1, defaultValue: 62, unit: '%', control: 'knob' },
    { key: 'envAmount', label: 'Env amount', min: 0, max: 100, step: 1, defaultValue: 58, unit: '%', control: 'knob' },
    { key: 'decay', label: 'Decay', min: 0, max: 100, step: 1, defaultValue: 48, unit: '%', control: 'knob' },
    { key: 'accent', label: 'Accent', min: 0, max: 100, step: 1, defaultValue: 65, unit: '%', control: 'knob' },
    { key: 'slide', label: 'Slide', min: 0, max: 100, step: 1, defaultValue: 35, unit: '%', control: 'knob' },
    { key: 'drive', label: 'Drive', min: 0, max: 100, step: 1, defaultValue: 10, unit: '%', control: 'knob' },
  ]),
  chords: defineSchema([
    { key: 'tone', label: 'Tone', min: 0, max: 100, step: 1, defaultValue: 48, unit: '%', control: 'knob' },
    { key: 'attack', label: 'Attack', min: 0, max: 100, step: 1, defaultValue: 28, unit: '%', control: 'knob' },
    { key: 'release', label: 'Release', min: 0, max: 100, step: 1, defaultValue: 62, unit: '%', control: 'knob' },
    { key: 'width', label: 'Width', min: 0, max: 100, step: 1, defaultValue: 55, unit: '%', control: 'knob' },
    { key: 'chorus', label: 'Chorus', min: 0, max: 100, step: 1, defaultValue: 24, unit: '%', control: 'knob' },
  ]),
  mixer: silentSchema,
  arp: defineSchema([
    { key: 'tone', label: 'Tone', min: 0, max: 100, step: 1, defaultValue: 52, unit: '%', control: 'knob' },
    { key: 'brightness', label: 'Brightness', min: 0, max: 100, step: 1, defaultValue: 58, unit: '%', control: 'knob' },
    { key: 'decay', label: 'Decay', min: 0, max: 100, step: 1, defaultValue: 42, unit: '%', control: 'knob' },
    { key: 'character', label: 'Character', min: 0, max: 100, step: 1, defaultValue: 22, unit: '%', control: 'knob' },
  ]),
  euclid: defineSchema([
    { key: 'tone', label: 'Tone', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%', control: 'knob' },
    { key: 'decay', label: 'Decay', min: 0, max: 100, step: 1, defaultValue: 45, unit: '%', control: 'knob' },
    { key: 'spread', label: 'Spread', min: 0, max: 100, step: 1, defaultValue: 42, unit: '%', control: 'knob' },
  ]),
  piano: defineSchema([
    { key: 'tone', label: 'Tone', min: 0, max: 100, step: 1, defaultValue: 52, unit: '%', control: 'knob' },
    { key: 'bell', label: 'Bell', min: 0, max: 100, step: 1, defaultValue: 34, unit: '%', control: 'knob' },
    { key: 'decay', label: 'Decay', min: 0, max: 100, step: 1, defaultValue: 58, unit: '%', control: 'knob' },
    { key: 'tremolo', label: 'Tremolo', min: 0, max: 100, step: 1, defaultValue: 12, unit: '%', control: 'knob' },
  ]),
  cc: silentSchema,
  mod: silentSchema,
});

function defaultsFor(type: ModuleType): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(SOUND_PARAM_SCHEMAS[type].map((definition) => [definition.key, definition.defaultValue])));
}

type PresetRow = Omit<SoundPreset, 'engineVersion' | 'outputTrimDb' | 'provenance'> & { outputTrimDb?: number };

const PRESET_ROWS = [
  { id: 'legacy-drums-v1', moduleType: 'drums', label: 'Legacy Drums', params: defaultsFor('drums') },
  { id: 'drums-core-v2', moduleType: 'drums', label: 'Foundation', params: { tone: 55, punch: 65, decay: 45 }, outputTrimDb: 6 },
  { id: 'legacy-bass-v1', moduleType: 'bass', label: 'Legacy Bass', params: defaultsFor('bass') },
  { id: 'bass-core-v2', moduleType: 'bass', label: 'Roundhouse', params: { wave: 1, cutoff: 55, resonance: 18, envelope: 42, drive: 10, glide: 8, sub: 38 }, outputTrimDb: 7 },
  { id: 'legacy-acid-v1', moduleType: 'acid', label: 'Legacy Acid', params: defaultsFor('acid') },
  { id: 'acid-core-v2', moduleType: 'acid', label: 'Pulsewire', params: { wave: 0, cutoff: 55, resonance: 64, envAmount: 60, decay: 45, accent: 65, slide: 35, drive: 12 }, outputTrimDb: 14.2 },
  { id: 'legacy-chords-v1', moduleType: 'chords', label: 'Legacy Chords', params: defaultsFor('chords') },
  { id: 'chords-core-v2', moduleType: 'chords', label: 'Core Chords', params: defaultsFor('chords') },
  { id: 'legacy-mixer-v1', moduleType: 'mixer', label: 'Legacy silent control', params: defaultsFor('mixer') },
  { id: 'silent-mixer-v2', moduleType: 'mixer', label: 'Silent control', params: defaultsFor('mixer') },
  { id: 'legacy-arp-v1', moduleType: 'arp', label: 'Legacy Arp', params: defaultsFor('arp') },
  { id: 'arp-core-v2', moduleType: 'arp', label: 'Core Arp', params: defaultsFor('arp') },
  { id: 'legacy-euclid-v1', moduleType: 'euclid', label: 'Legacy Euclid', params: defaultsFor('euclid') },
  { id: 'euclid-core-v2', moduleType: 'euclid', label: 'Core Palette', params: defaultsFor('euclid') },
  { id: 'legacy-piano-v1', moduleType: 'piano', label: 'Legacy Piano', params: defaultsFor('piano') },
  { id: 'piano-core-v2', moduleType: 'piano', label: 'Core Piano', params: defaultsFor('piano') },
  { id: 'legacy-cc-v1', moduleType: 'cc', label: 'Legacy silent control', params: defaultsFor('cc') },
  { id: 'silent-cc-v2', moduleType: 'cc', label: 'Silent control', params: defaultsFor('cc') },
  { id: 'legacy-mod-v1', moduleType: 'mod', label: 'Legacy silent control', params: defaultsFor('mod') },
  { id: 'silent-mod-v2', moduleType: 'mod', label: 'Silent control', params: defaultsFor('mod') },
  { id: 'drums-broken-v2', moduleType: 'drums', label: 'Fracture', params: { tone: 70, punch: 52, decay: 32 }, outputTrimDb: 9 },
  { id: 'drums-latin-v2', moduleType: 'drums', label: 'Solar', params: { tone: 62, punch: 45, decay: 38 }, outputTrimDb: 8 },
  { id: 'drums-electro-v2', moduleType: 'drums', label: 'Voltage', params: { tone: 78, punch: 72, decay: 50 }, outputTrimDb: 6.5 },
  { id: 'drums-halftime-v2', moduleType: 'drums', label: 'Weight', params: { tone: 38, punch: 78, decay: 70 }, outputTrimDb: 6.5 },
  { id: 'drums-odd-v2', moduleType: 'drums', label: 'Tilt', params: { tone: 65, punch: 58, decay: 42 }, outputTrimDb: 7.5 },
  { id: 'bass-clean-v2', moduleType: 'bass', label: 'Clearline', params: { wave: 0, cutoff: 72, resonance: 10, envelope: 30, drive: 0, glide: 5, sub: 20 }, outputTrimDb: 10.7 },
  { id: 'bass-pluck-v2', moduleType: 'bass', label: 'Shortwood', params: { wave: 2, cutoff: 48, resonance: 28, envelope: 78, drive: 8, glide: 0, sub: 18 }, outputTrimDb: 11 },
  { id: 'bass-sub-v2', moduleType: 'bass', label: 'Undertow', params: { wave: 0, cutoff: 32, resonance: 8, envelope: 20, drive: 0, glide: 18, sub: 85 }, outputTrimDb: 9.9 },
  { id: 'bass-driven-v2', moduleType: 'bass', label: 'Ember', params: { wave: 2, cutoff: 58, resonance: 35, envelope: 55, drive: 68, glide: 10, sub: 35 }, outputTrimDb: 6.3 },
  { id: 'bass-animated-v2', moduleType: 'bass', label: 'Orbit', params: { wave: 2, cutoff: 62, resonance: 48, envelope: 70, drive: 25, glide: 55, sub: 25 }, outputTrimDb: 8 },
  { id: 'bass-square-v2', moduleType: 'bass', label: 'Block', params: { wave: 1, cutoff: 44, resonance: 22, envelope: 38, drive: 18, glide: 4, sub: 45 }, outputTrimDb: 5.8 },
  { id: 'bass-deep-v2', moduleType: 'bass', label: 'Nightfloor', params: { wave: 0, cutoff: 40, resonance: 42, envelope: 50, drive: 32, glide: 28, sub: 65 }, outputTrimDb: 5.9 },
  { id: 'acid-clean-v2', moduleType: 'acid', label: 'Clearcut', params: { wave: 0, cutoff: 72, resonance: 30, envAmount: 45, decay: 30, accent: 40, slide: 15, drive: 5 }, outputTrimDb: 15.7 },
  { id: 'acid-hollow-v2', moduleType: 'acid', label: 'Hollow', params: { wave: 1, cutoff: 35, resonance: 75, envAmount: 60, decay: 62, accent: 55, slide: 42, drive: 8 }, outputTrimDb: 12.5 },
  { id: 'acid-sharp-v2', moduleType: 'acid', label: 'Razorleaf', params: { wave: 0, cutoff: 68, resonance: 82, envAmount: 75, decay: 28, accent: 80, slide: 25, drive: 20 }, outputTrimDb: 12.9 },
  { id: 'acid-rubber-v2', moduleType: 'acid', label: 'Rubberline', params: { wave: 1, cutoff: 48, resonance: 58, envAmount: 52, decay: 70, accent: 50, slide: 68, drive: 12 }, outputTrimDb: 11 },
  { id: 'acid-animated-v2', moduleType: 'acid', label: 'Neoncoil', params: { wave: 0, cutoff: 62, resonance: 72, envAmount: 88, decay: 52, accent: 85, slide: 55, drive: 30 }, outputTrimDb: 12.4 },
  { id: 'acid-dark-v2', moduleType: 'acid', label: 'Nighttrace', params: { wave: 1, cutoff: 28, resonance: 88, envAmount: 70, decay: 78, accent: 60, slide: 75, drive: 18 }, outputTrimDb: 10 },
  { id: 'acid-driven-v2', moduleType: 'acid', label: 'Scorch', params: { wave: 0, cutoff: 58, resonance: 52, envAmount: 48, decay: 36, accent: 75, slide: 20, drive: 78 }, outputTrimDb: 7.1 },
  { id: 'acid-liquid-v2', moduleType: 'acid', label: 'Liquidstep', params: { wave: 1, cutoff: 45, resonance: 68, envAmount: 82, decay: 65, accent: 70, slide: 90, drive: 22 }, outputTrimDb: 11 },
  { id: 'acid-short-v2', moduleType: 'acid', label: 'Pinpoint', params: { wave: 1, cutoff: 76, resonance: 38, envAmount: 35, decay: 18, accent: 90, slide: 8, drive: 35 }, outputTrimDb: 9.1 },
  { id: 'acid-low-v2', moduleType: 'acid', label: 'Lowcurrent', params: { wave: 0, cutoff: 25, resonance: 60, envAmount: 40, decay: 85, accent: 45, slide: 50, drive: 15 }, outputTrimDb: 12.2 },
  { id: 'acid-bright-v2', moduleType: 'acid', label: 'Glasswire', params: { wave: 0, cutoff: 85, resonance: 92, envAmount: 65, decay: 40, accent: 70, slide: 32, drive: 45 }, outputTrimDb: 13.9 },
] satisfies readonly PresetRow[];

export const SOUND_PRESETS: readonly SoundPreset[] = Object.freeze(PRESET_ROWS.map((preset) => Object.freeze({
  ...preset,
  engineVersion: SOUND_ENGINE_VERSION,
  outputTrimDb: preset.outputTrimDb ?? 0,
  provenance: 'procedural' as const,
})));
export const SOUND_PRESET_IDS: readonly string[] = Object.freeze(SOUND_PRESETS.map(({ id }) => id));

const DEFAULT_PRESET_IDS: Readonly<Record<ModuleType, string>> = Object.freeze({
  drums: 'drums-core-v2', bass: 'bass-core-v2', acid: 'acid-core-v2', chords: 'chords-core-v2', mixer: 'silent-mixer-v2',
  arp: 'arp-core-v2', euclid: 'euclid-core-v2', piano: 'piano-core-v2', cc: 'silent-cc-v2', mod: 'silent-mod-v2',
});

function legacyPresetId(type: ModuleType): string {
  return `legacy-${type}-v1`;
}

function assertQuantized(value: number, definition: ParamDefinition, label: string): void {
  if (!Number.isInteger(value) || value < definition.min || value > definition.max || (value - definition.min) % definition.step !== 0) {
    throw new RangeError(`${label} is outside its sound schema.`);
  }
}

export function presetsFor(type: ModuleType): readonly SoundPreset[] {
  return SOUND_PRESETS.filter((preset) => preset.moduleType === type);
}

export function presetById(id: string): SoundPreset {
  const preset = SOUND_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new RangeError(`Unknown sound preset ${id}.`);
  return preset;
}

export function validatePresetCatalog(catalog: readonly SoundPreset[]): void {
  const ids = new Set<string>();
  for (const preset of catalog) {
    if (ids.has(preset.id)) throw new RangeError(`Duplicate sound preset id ${preset.id}.`);
    ids.add(preset.id);
    if (preset.engineVersion !== SOUND_ENGINE_VERSION) throw new RangeError(`${preset.id} has an unsupported engine version.`);
    if (!Number.isFinite(preset.outputTrimDb)) throw new RangeError(`${preset.id} has a non-finite output trim.`);
    if (preset.provenance !== 'procedural') {
      if (preset.provenance.assetId.trim() === '' || preset.provenance.license.trim() === '' || preset.provenance.source.trim() === '') {
        throw new RangeError(`${preset.id} has incomplete asset provenance.`);
      }
    }
    validateSoundParams(preset.moduleType, preset.params);
  }
}

export function validateSoundParams(type: ModuleType, params: Readonly<Record<string, number>>): void {
  const schema = SOUND_PARAM_SCHEMAS[type];
  const expected = new Set(schema.map(({ key }) => key));
  for (const key of Object.keys(params)) if (!expected.has(key)) throw new RangeError(`${type}.${key} is not a known sound parameter.`);
  for (const definition of schema) {
    if (!(definition.key in params)) throw new RangeError(`${type}.${definition.key} is missing from sound state.`);
    assertQuantized(params[definition.key]!, definition, `${type}.${definition.key}`);
  }
}

export function validateSoundState(type: ModuleType, sound: SoundState): void {
  if (sound.engineVersion !== SOUND_ENGINE_VERSION) throw new RangeError('Unsupported sound engine version.');
  const preset = presetById(sound.presetId);
  if (preset.moduleType !== type) throw new RangeError(`${sound.presetId} cannot be used by ${type}.`);
  validateSoundParams(type, sound.params);
  assertQuantized(sound.pan, COMMON_OUTPUT_SCHEMA.pan, `${type}.pan`);
  assertQuantized(sound.delaySend, COMMON_OUTPUT_SCHEMA.delaySend, `${type}.delaySend`);
  assertQuantized(sound.reverbSend, COMMON_OUTPUT_SCHEMA.reverbSend, `${type}.reverbSend`);
  if ((type === 'mixer' || type === 'cc' || type === 'mod') && (sound.pan !== 0 || sound.delaySend !== 0 || sound.reverbSend !== 0)) {
    throw new RangeError(`${type} is silent and cannot use audio sends or pan.`);
  }
}

export function validateRackMixState(mix: RackMixState): void {
  for (const definition of RACK_MIX_SCHEMA) assertQuantized(mix[definition.key as keyof RackMixState], definition, `mix.${definition.key}`);
}

export function soundForPreset(type: ModuleType, presetId: string, output?: Pick<SoundState, 'pan' | 'delaySend' | 'reverbSend'>): SoundState {
  const preset = presetById(presetId);
  if (preset.moduleType !== type) throw new RangeError(`${presetId} cannot be used by ${type}.`);
  const silent = type === 'mixer' || type === 'cc' || type === 'mod';
  return {
    engineVersion: SOUND_ENGINE_VERSION,
    presetId,
    params: { ...preset.params },
    pan: silent ? 0 : output?.pan ?? 0,
    delaySend: silent ? 0 : output?.delaySend ?? 0,
    reverbSend: silent ? 0 : output?.reverbSend ?? 0,
  };
}

export function createDefaultSound(type: ModuleType): SoundState {
  return soundForPreset(type, DEFAULT_PRESET_IDS[type]);
}

export function createLegacySound(type: ModuleType): SoundState {
  return soundForPreset(type, legacyPresetId(type));
}

export function isLegacySound(sound: SoundState): boolean {
  return sound.presetId.startsWith('legacy-') && sound.presetId.endsWith('-v1');
}

export function normalizeSoundState(type: ModuleType, value: unknown): SoundState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${type} sound state must be an object.`);
  const source = value as Record<string, unknown>;
  if (source.engineVersion !== SOUND_ENGINE_VERSION || typeof source.presetId !== 'string' || typeof source.params !== 'object' || source.params === null || Array.isArray(source.params)) {
    throw new TypeError(`${type} sound state is malformed.`);
  }
  const params = Object.fromEntries(Object.entries(source.params as Record<string, unknown>).map(([key, entry]) => {
    if (typeof entry !== 'number') throw new TypeError(`${type}.${key} must be numeric.`);
    return [key, entry];
  }));
  const sound: SoundState = {
    engineVersion: SOUND_ENGINE_VERSION,
    presetId: source.presetId,
    params,
    pan: Number(source.pan),
    delaySend: Number(source.delaySend),
    reverbSend: Number(source.reverbSend),
  };
  validateSoundState(type, sound);
  return sound;
}

export function normalizeRackMixState(value: unknown): RackMixState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Rack mix state must be an object.');
  const source = value as Record<string, unknown>;
  const mix = Object.fromEntries(RACK_MIX_SCHEMA.map(({ key }) => [key, Number(source[key])])) as unknown as RackMixState;
  validateRackMixState(mix);
  return mix;
}

validatePresetCatalog(SOUND_PRESETS);
