import type { ModuleType, NoteEvent, Pattern } from '../core/pattern';

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
}
