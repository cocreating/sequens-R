import type { ModuleType, ParamSchema } from '../core/pattern';

export const MODULE_TYPES = ['drums', 'bass', 'acid', 'chords', 'mixer'] as const satisfies readonly ModuleType[];

export const PARAM_SCHEMAS: Readonly<Record<ModuleType, ParamSchema>> = {
  drums: [
    { key: 'steps', defaultValue: 16, min: 16, max: 32, step: 16, label: 'Steps' },
    { key: 'groove', defaultValue: 0, min: 0, max: 5, step: 1, label: 'Groove' },
    { key: 'swing', defaultValue: 0, min: 0, max: 100, step: 1, label: 'Swing', unit: '%' },
    { key: 'humanize', defaultValue: 0, min: 0, max: 100, step: 1, label: 'Humanize', unit: '%' },
  ],
  bass: [
    { key: 'style', defaultValue: 0, min: 0, max: 5, step: 1, label: 'Style' },
    { key: 'steps', defaultValue: 16, min: 4, max: 32, step: 1, label: 'Steps' },
    { key: 'range', defaultValue: 1, min: 1, max: 3, step: 1, label: 'Range', unit: 'oct' },
    { key: 'density', defaultValue: 55, min: 0, max: 100, step: 1, label: 'Density', unit: '%' },
    { key: 'drive', defaultValue: 20, min: 0, max: 100, step: 1, label: 'Drive', unit: '%' },
    { key: 'octave', defaultValue: 2, min: 1, max: 4, step: 1, label: 'Octave' },
    { key: 'gate', defaultValue: 70, min: 5, max: 100, step: 1, label: 'Gate', unit: '%' },
  ],
  acid: [
    { key: 'fill', defaultValue: 60, min: 0, max: 100, step: 1, label: 'Fill', unit: '%' },
    { key: 'steps', defaultValue: 16, min: 4, max: 32, step: 1, label: 'Steps' },
    { key: 'range', defaultValue: 2, min: 1, max: 3, step: 1, label: 'Range', unit: 'oct' },
    { key: 'decay', defaultValue: 45, min: 0, max: 100, step: 1, label: 'Decay', unit: '%' },
  ],
  chords: [
    { key: 'length', defaultValue: 4, min: 1, max: 8, step: 1, label: 'Chords' },
    { key: 'quality', defaultValue: 0, min: 0, max: 4, step: 1, label: 'Quality' },
    { key: 'duration', defaultValue: 16, min: 4, max: 32, step: 4, label: 'Duration', unit: 'steps' },
    { key: 'strum', defaultValue: 0, min: 0, max: 100, step: 1, label: 'Strum', unit: '%' },
  ],
  mixer: [],
};

export function validateParams(type: ModuleType, params: Readonly<Record<string, number>>): void {
  const schema = PARAM_SCHEMAS[type];
  for (const definition of schema) {
    const value = params[definition.key] ?? definition.defaultValue;
    if (!Number.isInteger(value) || value < definition.min || value > definition.max) {
      throw new RangeError(`${type}.${definition.key} is outside its schema.`);
    }
    if ((value - definition.min) % definition.step !== 0) {
      throw new RangeError(`${type}.${definition.key} does not match its quantization step.`);
    }
  }
}
