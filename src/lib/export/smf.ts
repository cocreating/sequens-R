import type { RackModule, RackState } from '../state/rack';
import { modulePattern } from '../state/rack';

const PPQ = 480;
const BEATS_PER_BAR = 4;

interface TimedMidiEvent {
  tick: number;
  order: number;
  bytes: readonly number[];
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function variableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>>= 7) > 0) buffer = (buffer << 8) | ((value & 0x7f) | 0x80);
  while (true) {
    bytes.push(buffer & 0xff);
    if ((buffer & 0x80) === 0) return bytes;
    buffer >>>= 8;
  }
}

function utf8(value: string): number[] {
  return [...new TextEncoder().encode(value)];
}

function chunk(id: string, data: readonly number[]): number[] {
  return [...utf8(id), ...uint32(data.length), ...data];
}

function track(events: readonly TimedMidiEvent[], endTick: number, name?: string): number[] {
  const sorted = [...events].sort((left, right) => left.tick - right.tick || left.order - right.order);
  const data: number[] = [];
  let previousTick = 0;
  if (name !== undefined) {
    const nameBytes = utf8(name);
    data.push(0, 0xff, 0x03, ...variableLength(nameBytes.length), ...nameBytes);
  }
  for (const event of sorted) {
    data.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  data.push(...variableLength(Math.max(0, endTick - previousTick)), 0xff, 0x2f, 0);
  return chunk('MTrk', data);
}

function conductorTrack(bpm: number, endTick: number): number[] {
  const microseconds = Math.round(60_000_000 / bpm);
  return track([
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (microseconds >>> 16) & 0xff, (microseconds >>> 8) & 0xff, microseconds & 0xff] },
    { tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
  ], endTick, 'sequens-R');
}

function moduleTrack(module: RackModule, rack: RackState, bars: number): number[] {
  const pattern = modulePattern(module, rack.key, rack.modules);
  const totalBeats = bars * BEATS_PER_BAR;
  const events: TimedMidiEvent[] = [];
  for (const note of pattern.events) {
    const laneLength = note.lane === undefined ? undefined : pattern.laneLengths?.[note.lane];
    const cycleBeats = (laneLength ?? pattern.lengthSteps) / pattern.stepsPerBeat;
    for (let cycleBeat = 0; cycleBeat < totalBeats; cycleBeat += cycleBeats) {
      const startBeat = cycleBeat + note.startStep / pattern.stepsPerBeat;
      if (startBeat >= totalBeats) continue;
      const channel = Math.max(0, Math.min(15, (note.channel ?? module.midi.channel + (note.channelOffset ?? 0)) - 1));
      const startTick = Math.round(startBeat * PPQ);
      if (note.cc !== undefined && note.value !== undefined) {
        events.push({ tick: startTick, order: 1, bytes: [0xb0 | channel, note.cc & 0x7f, note.value & 0x7f] });
        continue;
      }
      const endBeat = Math.min(totalBeats, startBeat + note.durationSteps / pattern.stepsPerBeat);
      const endTick = Math.max(startTick + 1, Math.round(endBeat * PPQ));
      events.push({ tick: startTick, order: 1, bytes: [0x90 | channel, note.pitch & 0x7f, note.velocity & 0x7f] });
      events.push({ tick: endTick, order: 0, bytes: [0x80 | channel, note.pitch & 0x7f, 0] });
    }
  }
  return track(events, totalBeats * PPQ, module.name);
}

export function createSmfType1(rack: RackState, bars: number, moduleId: string | null = null): Uint8Array {
  if (![1, 2, 4, 8].includes(bars)) throw new RangeError('MIDI export length must be 1, 2, 4, or 8 bars.');
  const modules = rack.modules.filter((module) => module.type !== 'mixer' && (moduleId === null || module.id === moduleId));
  if (moduleId !== null && modules.length === 0) throw new RangeError('The requested MIDI module does not exist.');
  const endTick = bars * BEATS_PER_BAR * PPQ;
  const header = chunk('MThd', [...uint16(1), ...uint16(modules.length + 1), ...uint16(PPQ)]);
  return new Uint8Array([...header, ...conductorTrack(rack.bpm, endTick), ...modules.flatMap((module) => moduleTrack(module, rack, bars))]);
}
