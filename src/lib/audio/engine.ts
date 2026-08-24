import { isControlModule, type ModuleType } from '../core/pattern';
import { AudioScheduler } from './scheduler';
import type { EngineModuleSnapshot, EngineSnapshot, ScheduledNote } from './types';
import { AcidVoice } from './voices/acid';
import { DrumKitVoice } from './voices/drumkit';
import { PolyVoice } from './voices/poly';
import clockWorkletUrl from './clock.worklet.ts?worker&url';
import acidWorkletUrl from './acid.worklet.ts?worker&url';
import { MidiTimeBridge } from '../midi/time-bridge';
import type { MidiSink } from '../midi/types';

interface ModuleVoice {
  type: ModuleType;
  bus: GainNode;
  voice: AcidVoice | DrumKitVoice | PolyVoice | null;
}

interface RenderCapacityUpdate extends Event {
  readonly averageLoad?: number;
  readonly peakLoad?: number;
  readonly underrunRatio?: number;
}

interface RenderCapacityLike extends EventTarget {
  start(options?: { updateInterval?: number }): void;
  stop(): void;
}

interface CapacityAudioContext extends AudioContext {
  readonly renderCapacity?: RenderCapacityLike;
}

export interface AudioDiagnostics {
  state: AudioContextState | 'uninitialized';
  latencySeconds: number | null;
  schedulerJitterMs: number | null;
  activeVoices: number;
  renderCapacitySupported: boolean;
  averageRenderLoad: number | null;
  peakRenderLoad: number | null;
  underrunRatio: number | null;
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
  readonly #onBar: ((bar: number) => void) | null;
  readonly #onPosition: ((beat: number | null) => void) | null;
  readonly #midi: MidiSink | null;
  #midiTime: MidiTimeBridge | null = null;
  #midiResyncTimer: number | null = null;
  #renderCapacity: RenderCapacityLike | null = null;
  #averageRenderLoad: number | null = null;
  #peakRenderLoad: number | null = null;
  #underrunRatio: number | null = null;

  constructor(onBar: ((bar: number) => void) | null = null, midi: MidiSink | null = null, onPosition: ((beat: number | null) => void) | null = null) {
    this.#onBar = onBar;
    this.#midi = midi;
    this.#onPosition = onPosition;
  }

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

  get state(): AudioContextState | 'uninitialized' {
    return this.#context?.state ?? 'uninitialized';
  }

  get schedulerMessageJitterMs(): number | null {
    return this.#scheduler?.messageJitterMs ?? null;
  }

  get diagnostics(): AudioDiagnostics {
    let activeVoices = 0;
    for (const module of this.#voices.values()) activeVoices += module.voice?.activeVoiceCount ?? 0;
    return {
      state: this.state,
      latencySeconds: this.latencySeconds,
      schedulerJitterMs: this.schedulerMessageJitterMs,
      activeVoices,
      renderCapacitySupported: this.#renderCapacity !== null,
      averageRenderLoad: this.#averageRenderLoad,
      peakRenderLoad: this.#peakRenderLoad,
      underrunRatio: this.#underrunRatio,
    };
  }

  get outputSelectionSupported(): boolean {
    return typeof (AudioContext.prototype as AudioContext & { setSinkId?: unknown }).setSinkId === 'function';
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    await this.initialize();
    const context = this.#context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
    if (context.setSinkId === undefined) throw new Error('Audio output selection is not available in this browser.');
    await context.setSinkId(deviceId);
  }

  async resume(): Promise<void> {
    if (this.#context?.state === 'suspended') await this.#context.resume();
  }

  async initialize(): Promise<void> {
    if (this.#context !== null) {
      if (this.#context.state === 'suspended') await this.#context.resume();
      return;
    }
    const context = new AudioContext({ latencyHint: 'interactive' });
    await Promise.all([context.audioWorklet.addModule(clockWorkletUrl), context.audioWorklet.addModule(acidWorkletUrl)]);
    const master = new DynamicsCompressorNode(context, {
      threshold: -3,
      knee: 3,
      ratio: 20,
      attack: 0.003,
      release: 0.12,
    });
    master.connect(context.destination);
    this.#midiTime = new MidiTimeBridge(context);
    this.#midiResyncTimer = window.setInterval(() => this.#midiTime?.resync(), 1000);
    const scheduler = new AudioScheduler(context, this.#snapshot, (note) => this.#schedule(note), this.#onBar, (time) => this.#scheduleClock(time), this.#onPosition);
    const clock = new AudioWorkletNode(context, 'sequens-clock', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    const clockSink = new GainNode(context, { gain: 0 });
    clock.connect(clockSink).connect(context.destination);
    scheduler.attachClock(clock);
    this.#context = context;
    this.#master = master;
    this.#scheduler = scheduler;
    this.#clock = clock;
    this.#clockSink = clockSink;
    const renderCapacity = (context as CapacityAudioContext).renderCapacity;
    if (renderCapacity !== undefined) {
      this.#renderCapacity = renderCapacity;
      renderCapacity.addEventListener('update', this.#handleRenderCapacity);
      renderCapacity.start({ updateInterval: 1 });
    }
    this.#syncVoices(this.#snapshot.modules);
  }

  publish(snapshot: EngineSnapshot): void {
    this.#silenceMidiTransitions(this.#snapshot.modules, snapshot.modules);
    this.#snapshot = snapshot;
    this.#syncVoices(snapshot.modules);
    this.#scheduler?.publish(snapshot);
  }

  async play(): Promise<void> {
    if (this.#scheduler?.playing === true) return;
    await this.initialize();
    await this.#context!.resume();
    if (this.#scheduler!.playing) return;
    this.#midi?.start(this.#toPerformanceTime(this.#context!.currentTime + 0.05));
    this.#scheduler!.start();
  }

  stop(): void {
    this.#scheduler?.stop();
    this.#midi?.stop(this.#toPerformanceTime(this.#context?.currentTime ?? 0));
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
    this.#midi?.panic(this.#toPerformanceTime(now));
  }

  async destroy(): Promise<void> {
    if (this.#context === null) return;
    this.stop();
    if (this.#midiResyncTimer !== null) window.clearInterval(this.#midiResyncTimer);
    this.#midiResyncTimer = null;
    this.#renderCapacity?.stop();
    this.#renderCapacity?.removeEventListener('update', this.#handleRenderCapacity);
    this.#renderCapacity = null;
    this.#clock?.disconnect();
    this.#clockSink?.disconnect();
    this.#master?.disconnect();
    for (const module of this.#voices.values()) module.bus.disconnect();
    this.#voices.clear();
    const context = this.#context;
    this.#context = null;
    this.#scheduler = null;
    this.#clock = null;
    this.#clockSink = null;
    this.#master = null;
    this.#midiTime = null;
    await context.close();
  }

  readonly #handleRenderCapacity = (event: Event): void => {
    const update = event as RenderCapacityUpdate;
    this.#averageRenderLoad = typeof update.averageLoad === 'number' ? update.averageLoad : null;
    this.#peakRenderLoad = typeof update.peakLoad === 'number' ? update.peakLoad : null;
    this.#underrunRatio = typeof update.underrunRatio === 'number' ? update.underrunRatio : null;
  };

  #schedule(note: ScheduledNote): void {
    const module = this.#voices.get(note.moduleId);
    const snapshot = this.#snapshot.modules.find((entry) => entry.id === note.moduleId);
    const anySolo = this.#snapshot.modules.some((entry) => entry.solo);
    if (snapshot === undefined || snapshot.mute || (anySolo && !snapshot.solo)) return;
    if (note.event.cc === undefined) this.#midi?.note(snapshot.midi, note.event, this.#toPerformanceTime(note.time), note.duration * 1000);
    else this.#midi?.control(snapshot.midi, note.event, this.#toPerformanceTime(note.time));
    if (module === undefined || module.voice === null || !snapshot.monitor) return;
    if (module.voice instanceof DrumKitVoice) module.voice.trigger(note.event, note.time);
    else module.voice.trigger(note.event, note.time, note.duration);
  }

  #scheduleClock(contextTime: number): void {
    this.#midi?.clock(this.#toPerformanceTime(contextTime));
  }

  #silenceMidiTransitions(previous: readonly EngineModuleSnapshot[], next: readonly EngineModuleSnapshot[]): void {
    if (this.#context === null || this.#midi === null) return;
    const nextById = new Map(next.map((module) => [module.id, module]));
    const nextHasSolo = next.some((module) => module.solo);
    const previousHadSolo = previous.some((module) => module.solo);
    const timestamp = this.#toPerformanceTime(this.#context.currentTime);
    for (const module of previous) {
      const replacement = nextById.get(module.id);
      const routeChanged = replacement !== undefined && (replacement.midi.portId !== module.midi.portId || replacement.midi.channel !== module.midi.channel);
      const wasActive = !module.mute && (!previousHadSolo || module.solo);
      const remainsActive = replacement !== undefined && !replacement.mute && (!nextHasSolo || replacement.solo);
      if (replacement === undefined || routeChanged || (wasActive && !remainsActive)) {
        const channels = new Set([module.midi.channel]);
        for (const event of module.pattern.events) {
          if (event.cc === undefined) channels.add(event.channel ?? module.midi.channel + (event.channelOffset ?? 0));
        }
        for (const channel of channels) this.#midi.silence({ ...module.midi, channel: Math.max(1, Math.min(16, channel)) }, timestamp);
      }
    }
  }

  #toPerformanceTime(contextTime: number): number {
    return this.#midiTime?.toPerformanceTime(contextTime) ?? performance.now();
  }

  #makeVoice(module: EngineModuleSnapshot): ModuleVoice {
    const context = this.#context!;
    const bus = new GainNode(context, { gain: module.level });
    bus.connect(this.#master!);
    const voice = module.type === 'drums'
      ? new DrumKitVoice(context, bus)
      : module.type === 'acid'
        ? new AcidVoice(context, bus)
        : isControlModule(module.type)
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
