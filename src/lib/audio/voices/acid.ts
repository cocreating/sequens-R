import type { NoteEvent } from '../../core/pattern';
import { DEFAULT_ACID_DSP_PARAMS, acidSlideSeconds, type AcidDspParams } from '../acid-dsp';
import type { SoundState } from '../sound';

export function frequencyForAcidMidi(pitch: number): number {
  return 440 * 2 ** ((Math.max(0, Math.min(127, pitch)) - 69) / 12);
}

export interface AcidTransitionPlan {
  overlaps: boolean;
  glides: boolean;
  retriggers: boolean;
  glideSeconds: number;
}

export function planAcidTransition(previousGateEnd: number, previousSlide: boolean, time: number, slide: number): AcidTransitionPlan {
  const overlaps = previousGateEnd > time + 0.000_5;
  const glides = overlaps && previousSlide;
  return { overlaps, glides, retriggers: !glides, glideSeconds: glides ? acidSlideSeconds(slide) : 0 };
}

function paramsFor(sound: Readonly<SoundState>): AcidDspParams {
  return {
    wave: sound.params.wave ?? DEFAULT_ACID_DSP_PARAMS.wave,
    cutoff: sound.params.cutoff ?? DEFAULT_ACID_DSP_PARAMS.cutoff,
    resonance: sound.params.resonance ?? DEFAULT_ACID_DSP_PARAMS.resonance,
    envAmount: sound.params.envAmount ?? DEFAULT_ACID_DSP_PARAMS.envAmount,
    decay: sound.params.decay ?? DEFAULT_ACID_DSP_PARAMS.decay,
    accent: sound.params.accent ?? DEFAULT_ACID_DSP_PARAMS.accent,
    slide: sound.params.slide ?? DEFAULT_ACID_DSP_PARAMS.slide,
    drive: sound.params.drive ?? DEFAULT_ACID_DSP_PARAMS.drive,
  };
}

abstract class WorkletAcidVoice {
  readonly ready: Promise<void>;
  readonly #context: BaseAudioContext;
  readonly #node: AudioWorkletNode;
  #activeUntil = 0;

  constructor(context: BaseAudioContext, destination: AudioNode) {
    this.#context = context;
    this.#node = new AudioWorkletNode(context, 'sequens-acid', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    this.ready = new Promise((resolve) => {
      this.#node.port.onmessage = (message: MessageEvent<{ type?: string }>) => {
        if (message.data.type === 'ready') resolve();
      };
    });
    this.#node.onprocessorerror = () => console.error('The Acid AudioWorklet processor stopped unexpectedly.');
    this.#node.connect(destination);
  }

  protected postSound(sound: Readonly<SoundState>, time: number): void {
    this.#node.port.postMessage({ type: 'sound', time, params: paramsFor(sound) });
  }

  protected useLegacyMode(): void {
    this.#node.port.postMessage({ type: 'legacy' });
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    this.#activeUntil = Math.max(this.#activeUntil, time + duration + 0.08);
    this.#node.port.postMessage({
      type: 'trigger',
      startTime: time,
      duration,
      frequency: frequencyForAcidMidi(event.pitch),
      slide: event.slide === true,
      accent: event.accent === true,
    });
  }

  panic(time: number): void {
    this.#activeUntil = time;
    this.#node.port.postMessage({ type: 'panic', time });
  }

  dispose(time: number): void {
    this.panic(time);
    this.#node.disconnect();
    this.#node.port.close();
  }

  get activeVoiceCount(): number {
    return this.#context.currentTime < this.#activeUntil ? 1 : 0;
  }
}

export class AcidVoice extends WorkletAcidVoice {
  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    super(context, destination);
    this.postSound(sound, context.currentTime);
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.postSound(sound, time);
  }
}

export class LegacyAcidVoice extends WorkletAcidVoice {
  constructor(context: BaseAudioContext, destination: AudioNode) {
    super(context, destination);
    this.useLegacyMode();
  }
}
