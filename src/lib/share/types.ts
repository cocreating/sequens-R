import type { ModuleType, MusicalKey } from '../core/pattern';
import type { RackMixState, SoundState } from '../audio/sound';

export interface ShareableModule {
  type: ModuleType;
  seed: number;
  params: Readonly<Record<string, number>>;
  sound?: SoundState;
}

export interface ShareableRack {
  bpm: number;
  key: MusicalKey;
  modules: readonly ShareableModule[];
  mix?: RackMixState;
}
