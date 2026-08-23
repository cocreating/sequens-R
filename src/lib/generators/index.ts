import type { Generator, ModuleType, ParamSchema, Pattern, MusicalContext } from '../core/pattern';
import { acidGenerator } from './acid';
import { bassGenerator } from './bass';
import { chordsGenerator } from './chords';
import { drumsGenerator } from './drums';
import { mixerGenerator } from './mixer';

export type NumericParams = Record<string, number>;

export interface RegisteredGenerator {
  readonly id: ModuleType;
  readonly defaults: NumericParams;
  readonly paramSchema: ParamSchema;
  generate(seed: number, params: NumericParams, context: MusicalContext): Pattern;
}

function register<P extends object>(generator: Generator<P>): RegisteredGenerator {
  return {
    id: generator.id,
    defaults: generator.defaults as NumericParams,
    paramSchema: generator.paramSchema,
    generate: (seed, params, context) => generator.generate(seed, params as P, context),
  };
}

export const GENERATORS: Readonly<Record<ModuleType, RegisteredGenerator>> = {
  drums: register(drumsGenerator),
  bass: register(bassGenerator),
  acid: register(acidGenerator),
  chords: register(chordsGenerator),
  mixer: register(mixerGenerator),
};

export { acidGenerator, bassGenerator, chordsGenerator, drumsGenerator, mixerGenerator };
