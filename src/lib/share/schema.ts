import type { ModuleType, ParamSchema } from '../core/pattern';
import { GENERATORS } from '../generators';

export const MODULE_TYPES = ['drums', 'bass', 'acid', 'chords', 'arp', 'euclid', 'piano', 'cc', 'mod', 'synth'] as const satisfies readonly ModuleType[];

export const PARAM_SCHEMAS: Readonly<Record<ModuleType, ParamSchema>> = {
  drums: GENERATORS.drums.paramSchema,
  bass: GENERATORS.bass.paramSchema,
  acid: GENERATORS.acid.paramSchema,
  chords: GENERATORS.chords.paramSchema,
  arp: GENERATORS.arp.paramSchema,
  euclid: GENERATORS.euclid.paramSchema,
  piano: GENERATORS.piano.paramSchema,
  cc: GENERATORS.cc.paramSchema,
  mod: GENERATORS.mod.paramSchema,
  synth: GENERATORS.synth.paramSchema,
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
