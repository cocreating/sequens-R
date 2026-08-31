export const SCALE_NAMES = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'harmonicMinor',
  'pentMinor',
  'blues',
] as const;

export type ScaleName = (typeof SCALE_NAMES)[number];
export const CORE_MODULE_TYPES = ['drums', 'bass', 'acid', 'chords', 'synth'] as const;
export const DESKTOP_MODULE_TYPES = ['arp', 'euclid', 'piano', 'cc', 'mod'] as const;
export type CoreModuleType = (typeof CORE_MODULE_TYPES)[number];
export type DesktopModuleType = (typeof DESKTOP_MODULE_TYPES)[number];
export type ModuleType = CoreModuleType | DesktopModuleType;

export interface MusicalKey {
  root: number;
  scale: ScaleName;
}

export interface MusicalContext {
  key: MusicalKey;
  bars: number;
  chords?: readonly ChordEvent[];
}

export interface NoteEvent {
  startStep: number;
  durationSteps: number;
  pitch: number;
  velocity: number;
  slide?: boolean;
  accent?: boolean;
  lane?: number;
  /** Absolute MIDI channel for control modules, 1..16. */
  channel?: number;
  /** Offset from the module route channel, used by multi-channel generators. */
  channelOffset?: number;
  /** Present when the event is a MIDI Control Change rather than a note. */
  cc?: number;
  value?: number;
}

export interface ChordEvent {
  startStep: number;
  durationSteps: number;
  pitches: readonly number[];
}

export interface Pattern {
  lengthSteps: number;
  stepsPerBeat: number;
  events: readonly NoteEvent[];
  /** Optional independent cycle length for each lane (Euclidean rings). */
  laneLengths?: readonly number[];
}

export function isDesktopModule(type: ModuleType): type is DesktopModuleType {
  return (DESKTOP_MODULE_TYPES as readonly ModuleType[]).includes(type);
}

export function isControlModule(type: ModuleType): boolean {
  return type === 'cc' || type === 'mod';
}

export interface ParamDefinition {
  key: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  label: string;
  unit?: string;
  options?: readonly string[];
  control?: 'range' | 'select' | 'hidden' | 'knob' | 'stepper' | 'segmented' | 'switch';
}

export type ParamSchema = readonly ParamDefinition[];

export interface Generator<P extends object> {
  readonly id: ModuleType;
  readonly defaults: P;
  readonly paramSchema: ParamSchema;
  generate(seed: number, params: P, context: MusicalContext): Pattern;
  mutate(base: Pattern, seed: number, intensity: 1 | 2 | 3 | 4, params: P, context: MusicalContext): Pattern;
}
