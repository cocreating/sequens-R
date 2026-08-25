import { collectWindowEvents } from '../audio/scheduler';
import type { EngineSnapshot } from '../audio/types';
import type { RackState } from '../state/rack';
import { toEngineSnapshot, toSoundSnapshot } from '../state/rack';
import { beatsToSeconds } from '../core/time';
import { isControlModule } from '../core/pattern';
import acidWorkletUrl from '../audio/acid.worklet.ts?worker&url';
import { VOICE_FACTORY, type InternalVoice } from '../audio/voice-factory';
import { analyzeAudio, pcmFromAudioBuffer, type AudioAnalysis } from '../audio/analysis';
import { RackAudioGraph, type RackModuleStrip } from '../audio/rack-graph';

const SAMPLE_RATE = 44_100;
const BEATS_PER_BAR = 4;

export async function renderRackAudio(rack: RackState, bars: number, moduleId: string | null = null): Promise<AudioBuffer> {
  if (![1, 2, 4, 8].includes(bars)) throw new RangeError('WAV bounce length must be 1, 2, 4, or 8 bars.');
  const musicalDuration = beatsToSeconds(bars * BEATS_PER_BAR, rack.bpm);
  const tailDuration = 2;
  const duration = musicalDuration + tailDuration;
  const context = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  await context.audioWorklet.addModule(acidWorkletUrl);
  const source = toEngineSnapshot(rack);
  const sounds = toSoundSnapshot(rack);
  const anySolo = source.modules.some((module) => module.solo);
  const modules = source.modules.filter((module) => !isControlModule(module.type)
    && module.monitor
    && !module.mute
    && (!anySolo || module.solo)
    && (moduleId === null || module.id === moduleId));
  const snapshot: EngineSnapshot = { bpm: source.bpm, modules };
  const graph = new RackAudioGraph(context, context.destination, rack.bpm, sounds.mix);
  const voices = new Map<string, InternalVoice>();
  const strips: RackModuleStrip[] = [];
  for (const module of modules) {
    const sound = sounds.modules.find((candidate) => candidate.id === module.id);
    if (sound === undefined) throw new RangeError(`Missing sound snapshot for ${module.id}.`);
    const strip = graph.createModuleStrip(sound.sound, module.level);
    strips.push(strip);
    const voice = VOICE_FACTORY.create(context, sound, strip.input);
    if (voice !== null) voices.set(module.id, voice);
  }
  for (const note of collectWindowEvents(snapshot, 0, bars * BEATS_PER_BAR, 0)) {
    const voice = voices.get(note.moduleId);
    voice?.trigger(note.event, note.time, note.duration);
  }
  graph.fadeOut(duration - 0.02, duration);
  const rendered = await context.startRendering();
  for (const voice of voices.values()) voice.dispose(duration);
  for (const strip of strips) strip.disconnect();
  graph.dispose();
  return rendered;
}

export async function renderRackAnalysis(rack: RackState, bars: number, moduleId: string | null = null): Promise<AudioAnalysis> {
  const buffer = await renderRackAudio(rack, bars, moduleId);
  return analyzeAudio(pcmFromAudioBuffer(buffer));
}
