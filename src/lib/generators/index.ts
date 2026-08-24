import type { Generator, ModuleType, ParamSchema, Pattern, MusicalContext } from '../core/pattern';
import { acidGenerator } from './acid';
import { bassGenerator } from './bass';
import { chordsGenerator } from './chords';
import { drumsGenerator } from './drums';
import { mixerGenerator } from './mixer';
import { arpGenerator } from './arp';
import { euclidGenerator } from './euclid';
import { pianoGenerator } from './piano';
import { ccGenerator } from './cc';
import { modGenerator } from './mod';

export type NumericParams = Record<string, number>;

export interface RegisteredGenerator {
  readonly id: ModuleType;
  readonly defaults: NumericParams;
  readonly paramSchema: ParamSchema;
  generate(seed: number, params: NumericParams, context: MusicalContext): Pattern;
  mutate(base: Pattern, seed: number, intensity: 1 | 2 | 3 | 4, params: NumericParams, context: MusicalContext): Pattern;
}

function register<P extends object>(generator: Generator<P>): RegisteredGenerator {
  return {
    id: generator.id,
    defaults: generator.defaults as NumericParams,
    paramSchema: generator.paramSchema,
    generate: (seed, params, context) => generator.generate(seed, params as P, context),
    mutate: (base, seed, intensity, params, context) => generator.mutate(base, seed, intensity, params as P, context),
  };
}

export const GENERATORS: Readonly<Record<ModuleType, RegisteredGenerator>> = {
  drums: register(drumsGenerator),
  bass: register(bassGenerator),
  acid: register(acidGenerator),
  chords: register(chordsGenerator),
  mixer: register(mixerGenerator),
  arp: register(arpGenerator),
  euclid: register(euclidGenerator),
  piano: register(pianoGenerator),
  cc: register(ccGenerator),
  mod: register(modGenerator),
};

export { acidGenerator, arpGenerator, bassGenerator, ccGenerator, chordsGenerator, drumsGenerator, euclidGenerator, mixerGenerator, modGenerator, pianoGenerator };
