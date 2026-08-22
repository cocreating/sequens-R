import type { ModuleType, MusicalKey } from '../core/pattern';

export interface ShareableModule {
  type: ModuleType;
  seed: number;
  params: Readonly<Record<string, number>>;
}

export interface ShareableRack {
  bpm: number;
  key: MusicalKey;
  modules: readonly ShareableModule[];
}
