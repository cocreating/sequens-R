import { assertBpm, beatsToSeconds, quantizeUp } from '../core/time';
import type { ClockTickMessage, EngineSnapshot, ScheduledNote } from './types';

const LOOK_AHEAD_SECONDS = 0.15;
const START_DELAY_SECONDS = 0.05;
const SNAPSHOT_BOUNDARY_BEATS = 4;

interface PendingSnapshot {
  snapshot: EngineSnapshot;
  boundaryBeat: number;
}

export function collectWindowEvents(
  snapshot: EngineSnapshot,
  fromBeat: number,
  toBeat: number,
  originTime: number,
): ScheduledNote[] {
  if (toBeat <= fromBeat) return [];
  const anySolo = snapshot.modules.some((module) => module.solo);
  const scheduled: ScheduledNote[] = [];

  for (const module of snapshot.modules) {
    if (module.type === 'mixer' || module.mute || !module.monitor || (anySolo && !module.solo)) continue;
    const cycleBeats = module.pattern.lengthSteps / module.pattern.stepsPerBeat;
    if (cycleBeats <= 0) continue;
    const firstCycle = Math.floor(fromBeat / cycleBeats);
    const finalCycle = Math.ceil(toBeat / cycleBeats);
    for (let cycle = firstCycle; cycle <= finalCycle; cycle += 1) {
      for (const event of module.pattern.events) {
        const eventBeat = cycle * cycleBeats + event.startStep / module.pattern.stepsPerBeat;
        if (eventBeat < fromBeat || eventBeat >= toBeat) continue;
        scheduled.push({
          moduleId: module.id,
          moduleType: module.type,
          event,
          time: originTime + beatsToSeconds(eventBeat, snapshot.bpm),
          duration: beatsToSeconds(event.durationSteps / module.pattern.stepsPerBeat, snapshot.bpm),
        });
      }
    }
  }
  return scheduled.sort((left, right) => left.time - right.time);
}

export class AudioScheduler {
  readonly #context: AudioContext;
  readonly #scheduleNote: (note: ScheduledNote) => void;
  #clock: AudioWorkletNode | null = null;
  #snapshot: EngineSnapshot;
  #pending: PendingSnapshot | null = null;
  #originTime = 0;
  #scheduledUntil = 0;
  #playing = false;
  readonly #timingOffsets: number[] = [];

  constructor(context: AudioContext, initialSnapshot: EngineSnapshot, scheduleNote: (note: ScheduledNote) => void) {
    assertBpm(initialSnapshot.bpm);
    this.#context = context;
    this.#snapshot = initialSnapshot;
    this.#scheduleNote = scheduleNote;
  }

  attachClock(clock: AudioWorkletNode): void {
    this.#clock = clock;
    clock.port.onmessage = (message: MessageEvent<ClockTickMessage>) => {
      if (message.data.type === 'tick') {
        this.#recordTiming(message.data.contextTime);
        this.#tick(message.data.contextTime);
      }
    };
  }

  get messageJitterMs(): number | null {
    if (this.#timingOffsets.length < 10) return null;
    const mean = this.#timingOffsets.reduce((sum, value) => sum + value, 0) / this.#timingOffsets.length;
    const variance = this.#timingOffsets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / this.#timingOffsets.length;
    return Math.sqrt(variance);
  }

  publish(snapshot: EngineSnapshot): void {
    assertBpm(snapshot.bpm);
    if (!this.#playing) {
      this.#snapshot = snapshot;
      this.#pending = null;
      return;
    }
    const safeTime = Math.max(this.#context.currentTime, this.#scheduledUntil);
    const safeBeat = this.#timeToBeat(safeTime);
    this.#pending = { snapshot, boundaryBeat: quantizeUp(safeBeat, SNAPSHOT_BOUNDARY_BEATS) };
  }

  start(): void {
    if (this.#playing) return;
    this.#playing = true;
    this.#originTime = this.#context.currentTime + START_DELAY_SECONDS;
    this.#scheduledUntil = this.#originTime;
    this.#tick(this.#context.currentTime);
  }

  stop(): void {
    this.#playing = false;
    this.#pending = null;
    this.#scheduledUntil = 0;
  }

  get playing(): boolean {
    return this.#playing;
  }

  #timeToBeat(time: number): number {
    return Math.max(0, (time - this.#originTime) * this.#snapshot.bpm / 60);
  }

  #beatToTime(beat: number): number {
    return this.#originTime + beatsToSeconds(beat, this.#snapshot.bpm);
  }

  #emitWindow(fromTime: number, toTime: number): void {
    if (toTime <= fromTime) return;
    const fromBeat = this.#timeToBeat(fromTime);
    const toBeat = this.#timeToBeat(toTime);
    for (const note of collectWindowEvents(this.#snapshot, fromBeat, toBeat, this.#originTime)) {
      this.#scheduleNote(note);
    }
  }

  #applyPending(boundaryTime: number): void {
    const pending = this.#pending;
    if (pending === null) return;
    this.#snapshot = pending.snapshot;
    this.#originTime = boundaryTime - beatsToSeconds(pending.boundaryBeat, this.#snapshot.bpm);
    this.#pending = null;
  }

  #tick(contextTime: number): void {
    if (!this.#playing) return;
    const windowEnd = Math.max(contextTime, this.#context.currentTime) + LOOK_AHEAD_SECONDS;
    if (windowEnd <= this.#scheduledUntil) return;

    const pending = this.#pending;
    if (pending !== null) {
      const boundaryTime = this.#beatToTime(pending.boundaryBeat);
      if (boundaryTime < windowEnd) {
        this.#emitWindow(this.#scheduledUntil, boundaryTime);
        this.#applyPending(boundaryTime);
        this.#emitWindow(boundaryTime, windowEnd);
        this.#scheduledUntil = windowEnd;
        return;
      }
    }
    this.#emitWindow(this.#scheduledUntil, windowEnd);
    this.#scheduledUntil = windowEnd;
  }

  #recordTiming(contextTime: number): void {
    const timestamp = this.#context.getOutputTimestamp();
    if (timestamp.performanceTime === undefined || timestamp.contextTime === undefined) return;
    const expectedPerformanceTime = timestamp.performanceTime + (contextTime - timestamp.contextTime) * 1000;
    this.#timingOffsets.push(performance.now() - expectedPerformanceTime);
    if (this.#timingOffsets.length > 256) this.#timingOffsets.shift();
  }
}
