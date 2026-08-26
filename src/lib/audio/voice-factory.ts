import { isControlModule, type ModuleType, type NoteEvent } from '../core/pattern';
import type { SoundState } from './sound';
import { validateSoundState } from './sound';
import { AcidVoice, LegacyAcidVoice } from './voices/acid';
import { DrumKitVoice } from './voices/drumkit';
import { PolyVoice } from './voices/poly';
import { ProceduralDrumVoice } from './voices/procedural-drums';
import { BassVoice } from './voices/bass';
import { ChordVoice } from './voices/chords';

export interface VoiceModuleSnapshot {
  type: ModuleType;
  sound: Readonly<SoundState>;
}

export interface InternalVoice {
  readonly ready?: Promise<void>;
  sync?(): Promise<void>;
  trigger(event: NoteEvent, time: number, duration: number): void;
  applySound(sound: Readonly<SoundState>, time: number): void;
  panic(time: number): void;
  dispose(time: number): void;
  readonly activeVoiceCount: number;
}

export interface VoiceIdentity {
  moduleType: ModuleType;
  presetId: string;
  implementationId: 'procedural-drums-v2' | 'procedural-bass-v2' | 'procedural-acid-v2' | 'procedural-chords-v2' | 'legacy-drums-v1' | 'legacy-acid-v1' | 'legacy-poly-square-v1' | 'legacy-poly-triangle-v1' | 'silent-control-v1';
}

type LegacyVoice = LegacyAcidVoice | DrumKitVoice | PolyVoice;

class LegacyVoiceAdapter implements InternalVoice {
  readonly #voice: LegacyVoice;

  constructor(voice: LegacyVoice) {
    this.#voice = voice;
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    if (this.#voice instanceof DrumKitVoice) this.#voice.trigger(event, time);
    else this.#voice.trigger(event, time, duration);
  }

  applySound(_sound: Readonly<SoundState>, _time: number): void {
    // Phase 7.0 deliberately keeps the pre-Phase-7 DSP path unchanged. Each
    // following voice subphase replaces this adapter with smoothed parameters.
  }

  panic(time: number): void {
    this.#voice.panic(time);
  }

  dispose(time: number): void {
    this.#voice.dispose(time);
  }

  get activeVoiceCount(): number {
    return this.#voice.activeVoiceCount;
  }
}

export class VoiceFactory {
  create(context: BaseAudioContext, module: VoiceModuleSnapshot, destination: AudioNode): InternalVoice | null {
    validateSoundState(module.type, module.sound as SoundState);
    if (isControlModule(module.type)) return null;
    if (module.type === 'drums' && module.sound.presetId !== 'legacy-drums-v1') {
      return new ProceduralDrumVoice(context, destination, module.sound);
    }
    if (module.type === 'bass' && module.sound.presetId !== 'legacy-bass-v1') {
      return new BassVoice(context, destination, module.sound);
    }
    if (module.type === 'acid' && module.sound.presetId !== 'legacy-acid-v1') {
      return new AcidVoice(context, destination, module.sound);
    }
    if (module.type === 'chords' && module.sound.presetId !== 'legacy-chords-v1') {
      return new ChordVoice(context, destination, module.sound);
    }
    const voice = module.type === 'drums'
      ? new DrumKitVoice(context, destination)
      : module.type === 'acid'
        ? new LegacyAcidVoice(context, destination)
        : new PolyVoice(context, destination, module.type === 'bass' ? 'square' : 'triangle');
    return new LegacyVoiceAdapter(voice);
  }

  identify(module: VoiceModuleSnapshot): VoiceIdentity {
    validateSoundState(module.type, module.sound as SoundState);
    const implementationId = isControlModule(module.type)
      ? 'silent-control-v1'
      : module.type === 'drums'
        ? module.sound.presetId === 'legacy-drums-v1' ? 'legacy-drums-v1' : 'procedural-drums-v2'
        : module.type === 'acid'
          ? module.sound.presetId === 'legacy-acid-v1' ? 'legacy-acid-v1' : 'procedural-acid-v2'
          : module.type === 'chords'
            ? module.sound.presetId === 'legacy-chords-v1' ? 'legacy-poly-triangle-v1' : 'procedural-chords-v2'
          : module.type === 'bass'
            ? module.sound.presetId === 'legacy-bass-v1' ? 'legacy-poly-square-v1' : 'procedural-bass-v2'
            : 'legacy-poly-triangle-v1';
    return { moduleType: module.type, presetId: module.sound.presetId, implementationId };
  }
}

export const VOICE_FACTORY = new VoiceFactory();
