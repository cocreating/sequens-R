import { isControlModule, type ModuleType, type NoteEvent } from '../core/pattern';
import type { SoundState } from './sound';
import { validateSoundState } from './sound';
import { AcidVoice } from './voices/acid';
import { ProceduralDrumVoice } from './voices/procedural-drums';
import { BassVoice } from './voices/bass';
import { ChordVoice } from './voices/chords';
import { ArpVoice } from './voices/arp';
import { PianoVoice } from './voices/piano';
import { EuclidVoice } from './voices/euclid';
import { SynthVoice } from './voices/synth';

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
  readonly maxVoiceCount: number;
}

export interface VoiceLimits {
  chordVoices: number;
  arpVoices: number;
  pianoVoices: number;
}

export const FULL_VOICE_LIMITS: Readonly<VoiceLimits> = Object.freeze({ chordVoices: 8, arpVoices: 4, pianoVoices: 8 });
export const MOBILE_VOICE_LIMITS: Readonly<VoiceLimits> = Object.freeze({ chordVoices: 5, arpVoices: 3, pianoVoices: 4 });

export interface VoiceIdentity {
  moduleType: ModuleType;
  presetId: string;
  implementationId: 'procedural-drums-v2' | 'procedural-bass-v2' | 'procedural-acid-v2' | 'procedural-chords-v2' | 'procedural-arp-v2' | 'procedural-euclid-v2' | 'procedural-piano-v2' | 'procedural-synth-v1' | 'silent-cc-v2' | 'silent-mod-v2' | 'silent-control-v2';
}

export class VoiceFactory {
  create(context: BaseAudioContext, module: VoiceModuleSnapshot, destination: AudioNode, limits: Readonly<VoiceLimits> = FULL_VOICE_LIMITS): InternalVoice | null {
    validateSoundState(module.type, module.sound as SoundState);
    // CC is an external MIDI control surface by contract. Keep its null voice
    // explicit so it cannot accidentally enter a future internal DSP path.
    if (module.type === 'cc') return null;
    // Mod likewise emits external MIDI CC LFOs only in Phase 7. It must never
    // turn into an implicit internal modulation/audio route.
    if (module.type === 'mod') return null;
    if (isControlModule(module.type)) return null;
    if (module.type === 'drums') return new ProceduralDrumVoice(context, destination, module.sound);
    if (module.type === 'bass') return new BassVoice(context, destination, module.sound);
    if (module.type === 'acid') return new AcidVoice(context, destination, module.sound);
    if (module.type === 'chords') return new ChordVoice(context, destination, module.sound, limits.chordVoices);
    if (module.type === 'arp') return new ArpVoice(context, destination, module.sound, limits.arpVoices);
    if (module.type === 'euclid') return new EuclidVoice(context, destination, module.sound);
    if (module.type === 'synth') return new SynthVoice(context, destination, module.sound);
    return new PianoVoice(context, destination, module.sound, limits.pianoVoices);
  }

  identify(module: VoiceModuleSnapshot): VoiceIdentity {
    validateSoundState(module.type, module.sound as SoundState);
    let implementationId: VoiceIdentity['implementationId'];
    if (module.type === 'cc') implementationId = 'silent-cc-v2';
    else if (module.type === 'mod') implementationId = 'silent-mod-v2';
    else if (isControlModule(module.type)) implementationId = 'silent-control-v2';
    else if (module.type === 'drums') implementationId = 'procedural-drums-v2';
    else if (module.type === 'bass') implementationId = 'procedural-bass-v2';
    else if (module.type === 'acid') implementationId = 'procedural-acid-v2';
    else if (module.type === 'chords') implementationId = 'procedural-chords-v2';
    else if (module.type === 'arp') implementationId = 'procedural-arp-v2';
    else if (module.type === 'euclid') implementationId = 'procedural-euclid-v2';
    else if (module.type === 'synth') implementationId = 'procedural-synth-v1';
    else implementationId = 'procedural-piano-v2';
    return { moduleType: module.type, presetId: module.sound.presetId, implementationId };
  }
}

export const VOICE_FACTORY = new VoiceFactory();
