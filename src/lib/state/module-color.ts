import type { ModuleType } from '../core/pattern';

export const MODULE_COLOR_OPTIONS = [
  { id: 'graphite', label: 'Graphite', value: '#1a2028' },
  { id: 'navy', label: 'Navy', value: '#14233a' },
  { id: 'indigo', label: 'Indigo', value: '#221b3a' },
  { id: 'plum', label: 'Plum', value: '#321c31' },
  { id: 'burgundy', label: 'Burgundy', value: '#381d27' },
  { id: 'ember', label: 'Ember', value: '#382319' },
  { id: 'olive', label: 'Olive', value: '#2c2d18' },
  { id: 'forest', label: 'Forest', value: '#173027' },
  { id: 'teal', label: 'Teal', value: '#123135' },
  { id: 'steel', label: 'Steel', value: '#1c2932' },
  { id: 'cobalt', label: 'Cobalt', value: '#19274d' },
] as const;

export type ModuleColor = typeof MODULE_COLOR_OPTIONS[number]['id'];

const DEFAULT_MODULE_COLORS: Readonly<Record<ModuleType, ModuleColor>> = {
  drums: 'ember',
  bass: 'forest',
  acid: 'olive',
  chords: 'plum',
  arp: 'navy',
  euclid: 'teal',
  piano: 'indigo',
  cc: 'steel',
  mod: 'burgundy',
  synth: 'cobalt',
  drone: 'graphite',
};

export function defaultModuleColor(type: ModuleType): ModuleColor {
  return DEFAULT_MODULE_COLORS[type];
}

export function normalizeModuleColor(value: unknown, type: ModuleType): ModuleColor {
  if (value === undefined) return defaultModuleColor(type);
  if (typeof value === 'string' && MODULE_COLOR_OPTIONS.some((option) => option.id === value)) return value as ModuleColor;
  throw new RangeError(`Invalid ${type} module color.`);
}

export function moduleColorValue(color: ModuleColor): string {
  return MODULE_COLOR_OPTIONS.find((option) => option.id === color)?.value ?? MODULE_COLOR_OPTIONS[0].value;
}
