import { collectWindowEvents } from '../audio/scheduler';
import type { EngineModuleSnapshot, EngineSnapshot } from '../audio/types';
import { AcidVoice } from '../audio/voices/acid';
import { DrumKitVoice } from '../audio/voices/drumkit';
import { PolyVoice } from '../audio/voices/poly';
import type { RackState } from '../state/rack';
import { toEngineSnapshot } from '../state/rack';
import { beatsToSeconds } from '../core/time';
import { isControlModule } from '../core/pattern';

const SAMPLE_RATE = 44_100;
const BEATS_PER_BAR = 4;

function createVoice(context: OfflineAudioContext, destination: AudioNode, module: EngineModuleSnapshot): AcidVoice | DrumKitVoice | PolyVoice | null {
  if (module.type === 'drums') return new DrumKitVoice(context, destination);
  if (module.type === 'acid') return new AcidVoice(context, destination);
  if (isControlModule(module.type)) return null;
  return new PolyVoice(context, destination, module.type === 'bass' ? 'square' : 'triangle');
}

export async function renderRackAudio(rack: RackState, bars: number, moduleId: string | null = null): Promise<AudioBuffer> {
  if (![1, 2, 4, 8].includes(bars)) throw new RangeError('WAV bounce length must be 1, 2, 4, or 8 bars.');
  const duration = beatsToSeconds(bars * BEATS_PER_BAR, rack.bpm);
  const context = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = new DynamicsCompressorNode(context, { threshold: -3, knee: 3, ratio: 20, attack: 0.003, release: 0.12 });
  master.connect(context.destination);
  const source = toEngineSnapshot(rack);
  const modules = source.modules.filter((module) => !isControlModule(module.type) && module.monitor && (moduleId === null || module.id === moduleId));
  const snapshot: EngineSnapshot = { bpm: source.bpm, modules };
  const voices = new Map<string, AcidVoice | DrumKitVoice | PolyVoice>();
  for (const module of modules) {
    const bus = new GainNode(context, { gain: module.level });
    bus.connect(master);
    const voice = createVoice(context, bus, module);
    if (voice !== null) voices.set(module.id, voice);
  }
  for (const note of collectWindowEvents(snapshot, 0, bars * BEATS_PER_BAR, 0)) {
    const voice = voices.get(note.moduleId);
    if (voice instanceof DrumKitVoice) voice.trigger(note.event, note.time);
    else voice?.trigger(note.event, note.time, note.duration);
  }
  return context.startRendering();
}
