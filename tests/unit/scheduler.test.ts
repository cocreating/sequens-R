import { describe, expect, it } from 'vitest';
import { collectWindowEvents } from '../../src/lib/audio/scheduler';
import type { EngineSnapshot } from '../../src/lib/audio/types';

const pattern = {
  lengthSteps: 4,
  stepsPerBeat: 4,
  events: [{ startStep: 0, durationSteps: 1, pitch: 60, velocity: 100 }],
} as const;

function snapshot(overrides: Partial<EngineSnapshot['modules'][number]> = {}): EngineSnapshot {
  return {
    bpm: 120,
    modules: [{ id: 'bass-1', type: 'bass', pattern, mute: false, solo: false, monitor: true, level: 1, ...overrides }],
  };
}

describe('look-ahead event collection', () => {
  it('loops patterns using absolute audio-context time', () => {
    const notes = collectWindowEvents(snapshot(), 0, 2.1, 10);
    expect(notes.map((note) => note.time)).toEqual([10, 10.5, 11]);
    expect(notes.every((note) => note.duration === 0.125)).toBe(true);
  });

  it('honours monitor, mute, and solo in the immutable snapshot', () => {
    expect(collectWindowEvents(snapshot({ mute: true }), 0, 1, 0)).toEqual([]);
    expect(collectWindowEvents(snapshot({ monitor: false }), 0, 1, 0)).toEqual([]);
    const withSolo: EngineSnapshot = {
      bpm: 120,
      modules: [
        snapshot().modules[0]!,
        { ...snapshot().modules[0]!, id: 'bass-2', solo: true },
      ],
    };
    expect(collectWindowEvents(withSolo, 0, 1, 0).map((note) => note.moduleId)).toEqual(['bass-2']);
  });
});
