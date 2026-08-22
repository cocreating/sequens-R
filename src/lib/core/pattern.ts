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
export type ModuleType = 'drums' | 'bass' | 'acid' | 'chords' | 'mixer';

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
}

export interface ParamDefinition {
  key: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  label: string;
  unit?: string;
}

export type ParamSchema = readonly ParamDefinition[];

export interface Generator<P extends object> {
  readonly id: ModuleType;
  readonly defaults: P;
  readonly paramSchema: ParamSchema;
  generate(seed: number, params: P, context: MusicalContext): Pattern;
  mutate(base: Pattern, seed: number, intensity: 1 | 2 | 3 | 4, params: P, context: MusicalContext): Pattern;
}
