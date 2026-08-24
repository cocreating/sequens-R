import type { MidiAccessLike, MidiEnvironment, MidiPermissionState, MidiPortInfo, MidiRoute, MidiSink } from './types';

const MIDI_CLOCK = 0xf8;
const MIDI_START = 0xfa;
const MIDI_STOP = 0xfc;

export interface MidiManagerState {
  permission: MidiPermissionState;
  connected: boolean;
  outputs: readonly MidiPortInfo[];
  clockPortIds: readonly string[];
}

export class MidiManager implements MidiSink {
  readonly #environment: MidiEnvironment;
  readonly #onState: (state: MidiManagerState) => void;
  #access: MidiAccessLike | null = null;
  #permission: MidiPermissionState = 'unknown';
  readonly #clockPorts = new Set<string>();

  constructor(environment: MidiEnvironment, onState: (state: MidiManagerState) => void) {
    this.#environment = environment;
    this.#onState = onState;
  }

  async inspectPermission(): Promise<MidiPermissionState> {
    this.#permission = await this.#environment.queryPermission();
    this.#publish();
    return this.#permission;
  }

  async connect(): Promise<void> {
    try {
      const access = await this.#environment.requestAccess();
      this.#access?.removeEventListener('statechange', this.#handleStateChange);
      this.#access = access;
      access.addEventListener('statechange', this.#handleStateChange);
      this.#permission = 'granted';
      await Promise.all([...access.outputs.values()].map((output) => output.open()));
      this.#publish();
    } catch (reason: unknown) {
      this.#permission = reason instanceof DOMException && (reason.name === 'SecurityError' || reason.name === 'NotAllowedError') ? 'denied' : await this.#environment.queryPermission();
      this.#publish();
      throw reason;
    }
  }

  disconnect(): void {
    this.#access?.removeEventListener('statechange', this.#handleStateChange);
    this.#access = null;
    this.#clockPorts.clear();
    this.#publish();
  }

  setClock(portId: string, enabled: boolean): void {
    if (enabled) this.#clockPorts.add(portId);
    else this.#clockPorts.delete(portId);
    this.#publish();
  }

  note(route: MidiRoute, event: { pitch: number; velocity: number; channel?: number; channelOffset?: number }, timestamp: number, durationMs: number): void {
    if (route.portId === null) return;
    const output = this.#output(route.portId);
    if (output === null) return;
    const channel = this.#channel(route, event);
    output.send([0x90 | channel, event.pitch & 0x7f, event.velocity & 0x7f], timestamp);
    output.send([0x80 | channel, event.pitch & 0x7f, 0], timestamp + Math.max(1, durationMs));
  }

  control(route: MidiRoute, event: { cc?: number; value?: number; channel?: number; channelOffset?: number }, timestamp: number): void {
    if (route.portId === null || event.cc === undefined || event.value === undefined) return;
    const output = this.#output(route.portId);
    if (output === null) return;
    output.send([0xb0 | this.#channel(route, event), event.cc & 0x7f, event.value & 0x7f], timestamp);
  }

  silence(route: MidiRoute, timestamp: number): void {
    if (route.portId === null) return;
    const output = this.#output(route.portId);
    if (output === null) return;
    const channel = Math.max(0, Math.min(15, Math.round(route.channel) - 1));
    for (const time of [timestamp, timestamp + 160]) {
      output.send([0xb0 | channel, 123, 0], time);
      output.send([0xb0 | channel, 120, 0], time);
    }
  }

  clock(timestamp: number): void {
    this.#sendRealtime(MIDI_CLOCK, timestamp);
  }

  start(timestamp: number): void {
    this.#sendRealtime(MIDI_START, timestamp);
  }

  stop(timestamp: number): void {
    this.#sendRealtime(MIDI_STOP, timestamp);
  }

  panic(timestamp: number): void {
    if (this.#access === null) return;
    for (const output of this.#access.outputs.values()) {
      if (output.state !== 'connected') continue;
      for (let channel = 0; channel < 16; channel += 1) {
        output.send([0xb0 | channel, 123, 0], timestamp);
        output.send([0xb0 | channel, 120, 0], timestamp);
      }
    }
  }

  readonly #handleStateChange = (): void => {
    if (this.#access !== null) {
      for (const id of this.#clockPorts) if (!this.#access.outputs.has(id)) this.#clockPorts.delete(id);
      void Promise.all([...this.#access.outputs.values()].filter((output) => output.state === 'connected').map((output) => output.open())).finally(() => this.#publish());
    }
    this.#publish();
  };

  #output(portId: string): MidiOutputLike | null {
    const output = this.#access?.outputs.get(portId);
    return output?.state === 'connected' ? output : null;
  }

  #channel(route: MidiRoute, event: { channel?: number; channelOffset?: number }): number {
    const oneBased = event.channel ?? route.channel + (event.channelOffset ?? 0);
    return Math.max(0, Math.min(15, Math.round(oneBased) - 1));
  }

  #sendRealtime(byte: number, timestamp: number): void {
    for (const portId of this.#clockPorts) this.#output(portId)?.send([byte], timestamp);
  }

  #publish(): void {
    const outputs = this.#access === null ? [] : [...this.#access.outputs.values()].map((output) => ({
      id: output.id,
      name: output.name?.trim() || 'Unnamed MIDI output',
      manufacturer: output.manufacturer?.trim() || '',
      state: output.state,
      connection: output.connection,
    }));
    this.#onState({
      permission: this.#permission,
      connected: this.#access !== null,
      outputs,
      clockPortIds: [...this.#clockPorts],
    });
  }
}

type MidiOutputLike = MidiAccessLike['outputs'] extends ReadonlyMap<string, infer Output> ? Output : never;
