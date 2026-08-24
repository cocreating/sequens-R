import { describe, expect, it, vi } from 'vitest';
import { MidiManager, type MidiManagerState } from '../../src/lib/midi/manager';
import { MidiTimeBridge } from '../../src/lib/midi/time-bridge';
import type { MidiAccessLike, MidiEnvironment, MidiOutputLike } from '../../src/lib/midi/types';

class MockOutput implements MidiOutputLike {
  readonly id = 'port-1';
  readonly name = 'Test Synth';
  readonly manufacturer = 'Test';
  readonly state = 'connected' as const;
  readonly connection = 'open' as const;
  readonly sent: Array<{ data: number[]; timestamp: number | undefined }> = [];
  clearCount = 0;
  async open(): Promise<void> {}
  send(data: Iterable<number>, timestamp?: number): void {
    this.sent.push({ data: [...data], timestamp });
  }
  clear(): void { this.clearCount += 1; }
}

class MockAccess extends EventTarget implements MidiAccessLike {
  readonly outputs: ReadonlyMap<string, MidiOutputLike>;
  constructor(output: MidiOutputLike) {
    super();
    this.outputs = new Map([[output.id, output]]);
  }
}

function setup(): { manager: MidiManager; output: MockOutput; states: MidiManagerState[]; environment: MidiEnvironment } {
  const output = new MockOutput();
  const access = new MockAccess(output);
  const states: MidiManagerState[] = [];
  const environment: MidiEnvironment = {
    requestAccess: vi.fn(async () => access),
    queryPermission: vi.fn(async () => 'prompt'),
    now: () => 0,
  };
  return { manager: new MidiManager(environment, (state) => states.push(state)), output, states, environment };
}

describe('MIDI facade', () => {
  it('inspects permission without requesting device access', async () => {
    const { manager, environment, states } = setup();
    await manager.inspectPermission();
    expect(environment.queryPermission).toHaveBeenCalledOnce();
    expect(environment.requestAccess).not.toHaveBeenCalled();
    expect(states.at(-1)?.permission).toBe('prompt');
  });

  it('timestamps routed notes and sends clock transport only to enabled ports', async () => {
    const { manager, output } = setup();
    await manager.connect();
    manager.setClock(output.id, true);
    manager.start(1000);
    manager.clock(1010);
    manager.note({ portId: output.id, channel: 3 }, { pitch: 64, velocity: 99 }, 1020, 125);
    manager.clear();
    manager.stop(1200);
    manager.resume(1250);
    expect(output.clearCount).toBe(1);
    expect(output.sent).toEqual([
      { data: [0xfa], timestamp: 1000 },
      { data: [0xf8], timestamp: 1010 },
      { data: [0x92, 64, 99], timestamp: 1020 },
      { data: [0x82, 64, 0], timestamp: 1145 },
      { data: [0xfc], timestamp: 1200 },
      { data: [0xfb], timestamp: 1250 },
    ]);
  });

  it('uses the audio output timestamp to bridge context time', () => {
    const bridge = new MidiTimeBridge({ getOutputTimestamp: () => ({ contextTime: 2, performanceTime: 2500 }) });
    expect(bridge.toPerformanceTime(3.25)).toBe(3750);
  });

  it('silences one routed channel immediately and after the look-ahead window', async () => {
    const { manager, output } = setup();
    await manager.connect();
    manager.silence({ portId: output.id, channel: 4 }, 2000);
    expect(output.sent).toEqual([
      { data: [0xb3, 123, 0], timestamp: 2000 },
      { data: [0xb3, 120, 0], timestamp: 2000 },
      { data: [0xb3, 123, 0], timestamp: 2160 },
      { data: [0xb3, 120, 0], timestamp: 2160 },
    ]);
  });
});
