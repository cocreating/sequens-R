import type { ModuleType } from '../core/pattern';
import { AudioScheduler } from './scheduler';
import type { EngineModuleSnapshot, EngineSnapshot, ScheduledNote } from './types';
import { AcidVoice } from './voices/acid';
import { DrumKitVoice } from './voices/drumkit';
import { PolyVoice } from './voices/poly';
import clockWorkletUrl from './clock.worklet.ts?worker&url';

interface ModuleVoice {
  type: ModuleType;
  bus: GainNode;
  voice: AcidVoice | DrumKitVoice | PolyVoice | null;
}

const EMPTY_SNAPSHOT: EngineSnapshot = { bpm: 118, modules: [] };

export class AudioEngine {
  #context: AudioContext | null = null;
  #scheduler: AudioScheduler | null = null;
  #clock: AudioWorkletNode | null = null;
  #clockSink: GainNode | null = null;
  #master: DynamicsCompressorNode | null = null;
  #snapshot: EngineSnapshot = EMPTY_SNAPSHOT;
  readonly #voices = new Map<string, ModuleVoice>();

  get ready(): boolean {
    return this.#context !== null;
  }

  get playing(): boolean {
    return this.#scheduler?.playing ?? false;
  }

  get latencySeconds(): number | null {
    if (this.#context === null) return null;
    return this.#context.baseLatency + (this.#context.outputLatency ?? 0);
  }

  get schedulerMessageJitterMs(): number | null {
    return this.#scheduler?.messageJitterMs ?? null;
  }

  async initialize(): Promise<void> {
    if (this.#context !== null) {
      if (this.#context.state === 'suspended') await this.#context.resume();
      return;
    }
    const context = new AudioContext({ latencyHint: 'interactive' });
    await context.audioWorklet.addModule(clockWorkletUrl);
    const master = new DynamicsCompressorNode(context, {
      threshold: -3,
      knee: 3,
      ratio: 20,
      attack: 0.003,
      release: 0.12,
    });
    master.connect(context.destination);
    const scheduler = new AudioScheduler(context, this.#snapshot, (note) => this.#schedule(note));
    const clock = new AudioWorkletNode(context, 'sequens-clock', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    const clockSink = new GainNode(context, { gain: 0 });
    clock.connect(clockSink).connect(context.destination);
    scheduler.attachClock(clock);
    this.#context = context;
    this.#master = master;
    this.#scheduler = scheduler;
    this.#clock = clock;
    this.#clockSink = clockSink;
    this.#syncVoices(this.#snapshot.modules);
  }

  publish(snapshot: EngineSnapshot): void {
    this.#snapshot = snapshot;
    this.#syncVoices(snapshot.modules);
    this.#scheduler?.publish(snapshot);
  }

  async play(): Promise<void> {
    await this.initialize();
    await this.#context!.resume();
    this.#scheduler!.start();
  }

  stop(): void {
    this.#scheduler?.stop();
    this.panic();
  }

  panic(): void {
    const now = this.#context?.currentTime ?? 0;
    for (const module of this.#voices.values()) {
      module.bus.gain.cancelScheduledValues(now);
      module.bus.gain.setValueAtTime(0, now);
      module.voice?.panic(now);
    }
    this.#applyLevels(this.#snapshot.modules, now + 0.01);
  }

  #schedule(note: ScheduledNote): void {
    const module = this.#voices.get(note.moduleId);
    if (module === undefined || module.voice === null) return;
    if (module.voice instanceof DrumKitVoice) module.voice.trigger(note.event, note.time);
    else module.voice.trigger(note.event, note.time, note.duration);
  }

  #makeVoice(module: EngineModuleSnapshot): ModuleVoice {
    const context = this.#context!;
    const bus = new GainNode(context, { gain: module.level });
    bus.connect(this.#master!);
    const voice = module.type === 'drums'
      ? new DrumKitVoice(context, bus)
      : module.type === 'acid'
        ? new AcidVoice(context, bus)
        : module.type === 'mixer'
          ? null
          : new PolyVoice(context, bus, module.type === 'bass' ? 'square' : 'triangle');
    return { type: module.type, bus, voice };
  }

  #applyLevels(modules: readonly EngineModuleSnapshot[], time: number): void {
    const anySolo = modules.some((module) => module.solo);
    for (const module of modules) {
      const voice = this.#voices.get(module.id);
      if (voice === undefined) continue;
      const audible = module.monitor && !module.mute && (!anySolo || module.solo);
      voice.bus.gain.setValueAtTime(audible ? module.level : 0, time);
    }
  }

  #syncVoices(modules: readonly EngineModuleSnapshot[]): void {
    if (this.#context === null) return;
    const moduleIds = new Set(modules.map((module) => module.id));
    for (const [id, module] of this.#voices) {
      if (!moduleIds.has(id)) {
        const now = this.#context.currentTime;
        const disconnectAt = now + 0.008;
        module.bus.gain.cancelAndHoldAtTime(now);
        module.bus.gain.linearRampToValueAtTime(0, disconnectAt);
        module.voice?.panic(disconnectAt);
        window.setTimeout(() => module.bus.disconnect(), 12);
        this.#voices.delete(id);
      }
    }
    for (const module of modules) {
      const current = this.#voices.get(module.id);
      if (current === undefined || current.type !== module.type) {
        current?.bus.disconnect();
        this.#voices.set(module.id, this.#makeVoice(module));
      }
    }
    this.#applyLevels(modules, this.#context.currentTime);
  }
}
