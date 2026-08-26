import type { ShareableRack } from './types';

export const STARTER_RACK_VERSION = 2;

export const STARTER_RACK: ShareableRack = {
  bpm: 118,
  key: { root: 0, scale: 'minor' },
  modules: [
    { type: 'drums', seed: 0x53455101, params: { groove: 0 } },
    { type: 'bass', seed: 0x53455102, params: { style: 0, density: 55 } },
    { type: 'chords', seed: 0x53455103, params: { length: 4, quality: 0 } },
  ],
};
