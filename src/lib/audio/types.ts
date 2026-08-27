import type { ModuleType, NoteEvent, Pattern } from '../core/pattern';
import type { RackMixState, SoundState } from './sound';

export interface EngineModuleSnapshot {
  id: string;
  type: ModuleType;
  pattern: Pattern;
  mute: boolean;
  solo: boolean;
  monitor: boolean;
  level: number;
  midi: { portId: string | null; channel: number };
}

export interface EngineSnapshot {
  bpm: number;
  modules: readonly EngineModuleSnapshot[];
}

export interface SoundModuleSnapshot {
  id: string;
  type: ModuleType;
  sound: Readonly<SoundState>;
}

export interface RackSoundSnapshot {
  mix: Readonly<RackMixState>;
  modules: readonly Readonly<SoundModuleSnapshot>[];
}

export interface ScheduledNote {
  moduleId: string;
  moduleType: ModuleType;
  event: NoteEvent;
  time: number;
  duration: number;
}

export interface ClockTickMessage {
  type: 'tick';
  contextTime: number;
  active: boolean;
}
