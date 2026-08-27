import { isControlModule, type ModuleType } from '../core/pattern';
import { AudioScheduler } from './scheduler';
import type { EngineModuleSnapshot, EngineSnapshot, RackSoundSnapshot, ScheduledNote, SoundModuleSnapshot } from './types';
import clockWorkletUrl from './clock.worklet.ts?worker&url';
import acidWorkletUrl from './acid.worklet.ts?worker&url';
import { MidiTimeBridge } from '../midi/time-bridge';
import type { MidiSink } from '../midi/types';
import { createDefaultSound, DEFAULT_RACK_MIX } from './sound';
import { FULL_VOICE_LIMITS, MOBILE_VOICE_LIMITS, VOICE_FACTORY, type InternalVoice, type VoiceLimits } from './voice-factory';
import { audibleLevelPower, RackAudioGraph, type MeterReading, type RackModuleStrip } from './rack-graph';

interface ModuleVoice {
  type: ModuleType;
  strip: RackModuleStrip | null;
  voice: InternalVoice | null;
  presetId: string;
  crossfadeUntil: number;
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
  voiceBudget: number;
  droppedInternalNotes: number;
  masterMeter: MeterReading;
  moduleMeters: Readonly<Record<string, MeterReading>>;
}

const EMPTY_SNAPSHOT: EngineSnapshot = { bpm: 118, modules: [] };
const EMPTY_SOUND_SNAPSHOT: RackSoundSnapshot = { mix: DEFAULT_RACK_MIX, modules: [] };

interface LiveVoiceProfile {
  limits: Readonly<VoiceLimits>;
  budget: number;
}

function defaultLiveVoiceProfile(): LiveVoiceProfile {
  const mobileSurface = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse) and (max-width: 64rem)').matches;
  return mobileSurface
    ? { limits: MOBILE_VOICE_LIMITS, budget: 32 }
    : { limits: FULL_VOICE_LIMITS, budget: 64 };
}

export class AudioEngine {
  #context: AudioContext | null = null;
  #scheduler: AudioScheduler | null = null;
  #clock: AudioWorkletNode | null = null;
  #clockSink: GainNode | null = null;
  #graph: RackAudioGraph | null = null;
  #snapshot: EngineSnapshot = EMPTY_SNAPSHOT;
  #soundSnapshot: RackSoundSnapshot = EMPTY_SOUND_SNAPSHOT;
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
  readonly #voiceLimits: Readonly<VoiceLimits>;
  readonly #voiceBudget: number;
  #droppedInternalNotes = 0;
  #meteringEnabled = false;
  #moduleById = new Map<string, EngineModuleSnapshot>();
  #anySolo = false;

  constructor(onBar: ((bar: number) => void) | null = null, midi: MidiSink | null = null, onPosition: ((beat: number | null) => void) | null = null, voiceProfile: LiveVoiceProfile = defaultLiveVoiceProfile()) {
    this.#onBar = onBar;
    this.#midi = midi;
    this.#onPosition = onPosition;
    this.#voiceLimits = voiceProfile.limits;
    this.#voiceBudget = voiceProfile.budget;
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
    const moduleMeters: Record<string, MeterReading> = {};
    for (const [id, module] of this.#voices) {
      activeVoices += module.voice?.activeVoiceCount ?? 0;
      if (module.strip !== null) moduleMeters[id] = module.strip.readMeter();
    }
    return {
      state: this.state,
      latencySeconds: this.latencySeconds,
      schedulerJitterMs: this.schedulerMessageJitterMs,
      activeVoices,
      renderCapacitySupported: this.#renderCapacity !== null,
      averageRenderLoad: this.#averageRenderLoad,
      peakRenderLoad: this.#peakRenderLoad,
      underrunRatio: this.#underrunRatio,
      voiceBudget: this.#voiceBudget,
      droppedInternalNotes: this.#droppedInternalNotes,
      masterMeter: this.#graph?.readMasterMeter() ?? { peakDbfs: -120, rmsDbfs: -120 },
      moduleMeters,
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
    const graph = new RackAudioGraph(context, context.destination, this.#snapshot.bpm, this.#soundSnapshot.mix, audibleLevelPower(this.#snapshot.modules));
    this.#midiTime = new MidiTimeBridge(context);
    this.#midiResyncTimer = window.setInterval(() => this.#midiTime?.resync(), 1000);
    const scheduler = new AudioScheduler(context, this.#snapshot, (note) => this.#schedule(note), this.#onBar, (time) => this.#scheduleClock(time), this.#onPosition);
    const clock = new AudioWorkletNode(context, 'sequens-clock', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    const clockSink = new GainNode(context, { gain: 0 });
    clock.connect(clockSink).connect(context.destination);
    scheduler.attachClock(clock);
    this.#context = context;
    this.#graph = graph;
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
    graph.applyMix(this.#soundSnapshot.mix, this.#snapshot.bpm, context.currentTime);
  }

  publish(snapshot: EngineSnapshot, soundSnapshot: RackSoundSnapshot = this.#soundSnapshot): void {
    this.#silenceMidiTransitions(this.#snapshot.modules, snapshot.modules);
    this.#snapshot = snapshot;
    this.#indexSnapshot(snapshot);
    this.#soundSnapshot = soundSnapshot;
    this.#syncVoices(snapshot.modules);
    this.#graph?.applyMix(soundSnapshot.mix, snapshot.bpm, this.#context?.currentTime ?? 0);
    this.#scheduler?.publish(snapshot);
  }

  publishSound(snapshot: RackSoundSnapshot): void {
    this.#soundSnapshot = snapshot;
    this.#syncVoices(this.#snapshot.modules);
    this.#graph?.applyMix(snapshot.mix, this.#snapshot.bpm, this.#context?.currentTime ?? 0);
  }

  setMeteringEnabled(enabled: boolean): void {
    if (this.#meteringEnabled === enabled) return;
    this.#meteringEnabled = enabled;
    for (const module of this.#voices.values()) module.strip?.setMeteringEnabled(enabled);
  }

  async play(): Promise<void> {
    if (this.#scheduler?.playing === true) return;
    await this.initialize();
    await this.#context!.resume();
    if (this.#scheduler!.playing) return;
    const resuming = this.#scheduler!.paused;
    const transportTime = this.#toPerformanceTime(this.#context!.currentTime + 0.05);
    if (resuming) this.#midi?.resume(transportTime);
    else this.#midi?.start(transportTime);
    this.#clock?.port.postMessage({ active: true });
    this.#scheduler!.start();
  }

  pause(): number | null {
    const pausedBeat = this.#scheduler?.pause() ?? null;
    if (pausedBeat === null) return null;
    this.#clock?.port.postMessage({ active: false });
    this.#midi?.clear();
    this.#midi?.stop(this.#toPerformanceTime(this.#context?.currentTime ?? 0));
    this.panic();
    return pausedBeat;
  }

  stop(): void {
    this.#scheduler?.stop();
    this.#clock?.port.postMessage({ active: false });
    this.#midi?.clear();
    this.#midi?.stop(this.#toPerformanceTime(this.#context?.currentTime ?? 0));
    this.panic();
  }

  panic(): void {
    const now = this.#context?.currentTime ?? 0;
    for (const module of this.#voices.values()) {
      module.strip?.cancelAndFade(0, now, now + 0.005);
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
    for (const module of this.#voices.values()) {
      module.voice?.dispose(this.#context.currentTime);
      module.strip?.disconnect();
    }
    this.#graph?.dispose();
    this.#voices.clear();
    this.#moduleById.clear();
    const context = this.#context;
    this.#context = null;
    this.#scheduler = null;
    this.#clock = null;
    this.#clockSink = null;
    this.#graph = null;
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
    const snapshot = this.#moduleById.get(note.moduleId);
    if (snapshot === undefined || snapshot.mute || (this.#anySolo && !snapshot.solo)) return;
    if (note.event.cc === undefined) this.#midi?.note(snapshot.midi, note.event, this.#toPerformanceTime(note.time), note.duration * 1000);
    else this.#midi?.control(snapshot.midi, note.event, this.#toPerformanceTime(note.time));
    if (module === undefined || module.voice === null || !snapshot.monitor) return;
    const moduleVoiceCount = module.voice.activeVoiceCount;
    if (moduleVoiceCount < module.voice.maxVoiceCount && this.#activeVoiceCount() >= this.#voiceBudget) {
      this.#droppedInternalNotes += 1;
      return;
    }
    module.voice.trigger(note.event, note.time, note.duration);
  }

  #activeVoiceCount(): number {
    let active = 0;
    for (const module of this.#voices.values()) active += module.voice?.activeVoiceCount ?? 0;
    return active;
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

  #soundFor(module: EngineModuleSnapshot): SoundModuleSnapshot {
    return this.#soundSnapshot.modules.find((candidate) => candidate.id === module.id) ?? {
      id: module.id,
      type: module.type,
      sound: createDefaultSound(module.type),
    };
  }

  #makeVoice(module: EngineModuleSnapshot, initialGain = module.level): ModuleVoice {
    const context = this.#context!;
    const soundModule = this.#soundFor(module);
    if (isControlModule(module.type)) return { type: module.type, strip: null, voice: null, presetId: soundModule.sound.presetId, crossfadeUntil: 0 };
    const strip = this.#graph!.createModuleStrip(soundModule.sound, initialGain, this.#meteringEnabled);
    const voice = VOICE_FACTORY.create(context, soundModule, strip.input, this.#voiceLimits);
    return { type: module.type, strip, voice, presetId: soundModule.sound.presetId, crossfadeUntil: 0 };
  }

  #silentVoice(module: EngineModuleSnapshot): ModuleVoice {
    return { type: module.type, strip: null, voice: null, presetId: this.#soundFor(module).sound.presetId, crossfadeUntil: 0 };
  }

  #retireVoice(module: ModuleVoice, time: number): void {
    const disconnectAt = time + 0.008;
    module.strip?.cancelAndFade(0, time, disconnectAt);
    module.voice?.panic(disconnectAt);
    window.setTimeout(() => {
      module.voice?.dispose(disconnectAt);
      module.strip?.disconnect();
    }, 12);
  }

  #applyLevels(modules: readonly EngineModuleSnapshot[], time: number): void {
    const anySolo = modules.some((module) => module.solo);
    for (const module of modules) {
      const voice = this.#voices.get(module.id);
      if (voice?.strip === null || voice === undefined) continue;
      const audible = module.monitor && !module.mute && (!anySolo || module.solo);
      voice.strip.applyLevel(audible ? module.level : 0, Math.max(time, voice.crossfadeUntil));
    }
    this.#graph?.applyHeadroom(audibleLevelPower(modules), time);
  }

  #syncVoices(modules: readonly EngineModuleSnapshot[]): void {
    if (this.#context === null) return;
    const moduleIds = new Set(modules.map((module) => module.id));
    for (const [id, module] of this.#voices) {
      if (!moduleIds.has(id)) {
        const now = this.#context.currentTime;
        this.#retireVoice(module, now);
        this.#voices.delete(id);
      }
    }
    const anySolo = modules.some((module) => module.solo);
    for (const module of modules) {
      const current = this.#voices.get(module.id);
      const sound = this.#soundFor(module);
      const shouldCreate = !isControlModule(module.type)
        && module.pattern.events.length > 0
        && module.monitor
        && !module.mute
        && (!anySolo || module.solo);
      if (current === undefined) {
        this.#voices.set(module.id, shouldCreate ? this.#makeVoice(module) : this.#silentVoice(module));
      } else if (!shouldCreate) {
        if (current.voice !== null || current.strip !== null) this.#retireVoice(current, this.#context.currentTime);
        this.#voices.set(module.id, this.#silentVoice(module));
      } else if (current.voice === null || current.strip === null || current.type !== module.type || current.presetId !== sound.sound.presetId) {
        const now = this.#context.currentTime;
        const crossfadeEnd = now + 0.012;
        current.strip?.cancelAndFade(0, now, crossfadeEnd);
        const replacement = this.#makeVoice(module, 0);
        replacement.crossfadeUntil = crossfadeEnd;
        replacement.strip?.cancelAndFade(module.level, now, crossfadeEnd);
        this.#voices.set(module.id, replacement);
        window.setTimeout(() => {
          current.voice?.dispose(crossfadeEnd);
          current.strip?.disconnect();
        }, 16);
      } else {
        current.strip?.applySound(sound.sound, this.#context.currentTime);
        current.voice?.applySound(sound.sound, this.#context.currentTime);
      }
    }
    this.#applyLevels(modules, this.#context.currentTime);
  }

  #indexSnapshot(snapshot: EngineSnapshot): void {
    this.#moduleById = new Map(snapshot.modules.map((module) => [module.id, module]));
    this.#anySolo = snapshot.modules.some((module) => module.solo);
  }
}
