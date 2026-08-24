import type { NoteEvent } from '../core/pattern';

export type MidiPermissionState = PermissionState | 'unsupported' | 'unknown';

export interface MidiPortInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
}

export interface MidiRoute {
  portId: string | null;
  channel: number;
}

export interface MidiOutputLike {
  readonly id: string;
  readonly name: string | null;
  readonly manufacturer: string | null;
  readonly state: 'connected' | 'disconnected';
  readonly connection: 'open' | 'closed' | 'pending';
  open(): Promise<unknown>;
  send(data: Iterable<number>, timestamp?: number): void;
}

export interface MidiAccessLike extends EventTarget {
  readonly outputs: ReadonlyMap<string, MidiOutputLike>;
}

export interface MidiEnvironment {
  requestAccess(): Promise<MidiAccessLike>;
  queryPermission(): Promise<MidiPermissionState>;
  now(): number;
}

export interface MidiSink {
  note(route: MidiRoute, event: NoteEvent, timestamp: number, durationMs: number): void;
  control(route: MidiRoute, event: NoteEvent, timestamp: number): void;
  silence(route: MidiRoute, timestamp: number): void;
  clock(timestamp: number): void;
  start(timestamp: number): void;
  stop(timestamp: number): void;
  panic(timestamp: number): void;
}
