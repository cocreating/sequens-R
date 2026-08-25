import { collectWindowEvents } from '../audio/scheduler';
import type { EngineSnapshot } from '../audio/types';
import type { RackState } from '../state/rack';
import { toEngineSnapshot, toSoundSnapshot } from '../state/rack';
import { beatsToSeconds } from '../core/time';
import { isControlModule } from '../core/pattern';
import acidWorkletUrl from '../audio/acid.worklet.ts?worker&url';
import { VOICE_FACTORY, type InternalVoice } from '../audio/voice-factory';
import { analyzeAudio, pcmFromAudioBuffer, type AudioAnalysis } from '../audio/analysis';

const SAMPLE_RATE = 44_100;
const BEATS_PER_BAR = 4;

export async function renderRackAudio(rack: RackState, bars: number, moduleId: string | null = null): Promise<AudioBuffer> {
  if (![1, 2, 4, 8].includes(bars)) throw new RangeError('WAV bounce length must be 1, 2, 4, or 8 bars.');
  const duration = beatsToSeconds(bars * BEATS_PER_BAR, rack.bpm);
  const context = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  await context.audioWorklet.addModule(acidWorkletUrl);
  const master = new DynamicsCompressorNode(context, { threshold: -3, knee: 3, ratio: 20, attack: 0.003, release: 0.12 });
  master.connect(context.destination);
  const source = toEngineSnapshot(rack);
  const sounds = toSoundSnapshot(rack);
  const modules = source.modules.filter((module) => !isControlModule(module.type) && module.monitor && (moduleId === null || module.id === moduleId));
  const snapshot: EngineSnapshot = { bpm: source.bpm, modules };
  const voices = new Map<string, InternalVoice>();
  for (const module of modules) {
    const bus = new GainNode(context, { gain: module.level });
    bus.connect(master);
    const sound = sounds.modules.find((candidate) => candidate.id === module.id);
    if (sound === undefined) throw new RangeError(`Missing sound snapshot for ${module.id}.`);
    const voice = VOICE_FACTORY.create(context, sound, bus);
    if (voice !== null) voices.set(module.id, voice);
  }
  for (const note of collectWindowEvents(snapshot, 0, bars * BEATS_PER_BAR, 0)) {
    const voice = voices.get(note.moduleId);
    voice?.trigger(note.event, note.time, note.duration);
  }
  return context.startRendering();
}

export async function renderRackAnalysis(rack: RackState, bars: number, moduleId: string | null = null): Promise<AudioAnalysis> {
  const buffer = await renderRackAudio(rack, bars, moduleId);
  return analyzeAudio(pcmFromAudioBuffer(buffer));
}
