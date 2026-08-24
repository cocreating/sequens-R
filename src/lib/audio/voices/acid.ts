import type { NoteEvent } from '../../core/pattern';

function frequencyForMidi(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

export class AcidVoice {
  readonly #context: BaseAudioContext;
  readonly #node: AudioWorkletNode;
  #activeUntil = 0;

  constructor(context: BaseAudioContext, destination: AudioNode) {
    this.#context = context;
    this.#node = new AudioWorkletNode(context, 'sequens-acid', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    this.#node.connect(destination);
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    this.#activeUntil = Math.max(this.#activeUntil, time + duration);
    this.#node.port.postMessage({
      type: 'trigger',
      startTime: time,
      duration,
      frequency: frequencyForMidi(event.pitch),
      slide: event.slide === true,
      accent: event.accent === true,
    });
  }

  panic(time: number): void {
    this.#activeUntil = time;
    this.#node.port.postMessage({ type: 'panic', time });
  }

  get activeVoiceCount(): number {
    return this.#context.currentTime < this.#activeUntil ? 1 : 0;
  }
}
