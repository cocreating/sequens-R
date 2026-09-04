import type { ModuleType } from '../core/pattern';

/**
 * Module identity colours. Only the `id` is persisted and validated, so these
 * values are presentation and can change without touching the project schema.
 *
 * The studio refresh (AD-017) moved module identity from a whole-plate
 * background tint to a 4px spine, so these are now the full-strength hues from
 * the handoff rather than the former near-black tints. The names still describe
 * them: ember is the Drums orange, forest the Bass green, plum the Chords
 * magenta, steel the CC grey.
 */
export const MODULE_COLOR_OPTIONS = [
  { id: 'graphite', label: 'Graphite', value: 'oklch(72% 0.02 250)' },
  { id: 'navy', label: 'Navy', value: 'oklch(74% 0.13 250)' },
  { id: 'indigo', label: 'Indigo', value: 'oklch(74% 0.14 280)' },
  { id: 'plum', label: 'Plum', value: 'oklch(74% 0.15 320)' },
  { id: 'burgundy', label: 'Burgundy', value: 'oklch(72% 0.12 15)' },
  { id: 'ember', label: 'Ember', value: 'oklch(72% 0.16 45)' },
  { id: 'olive', label: 'Olive', value: 'oklch(78% 0.15 100)' },
  { id: 'forest', label: 'Forest', value: 'oklch(74% 0.14 160)' },
  { id: 'teal', label: 'Teal', value: 'oklch(76% 0.13 195)' },
  { id: 'steel', label: 'Steel', value: 'oklch(70% 0.03 250)' },
  { id: 'cobalt', label: 'Cobalt', value: 'oklch(74% 0.14 265)' },
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
