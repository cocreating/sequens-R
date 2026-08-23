import type { NoteEvent } from '../../core/pattern';

function frequencyForMidi(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

export class AcidVoice {
  readonly #oscillator: OscillatorNode;
  readonly #filter: BiquadFilterNode;
  readonly #envelope: GainNode;
  #lastFrequency = 110;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#oscillator = new OscillatorNode(context, { type: 'sawtooth', frequency: this.#lastFrequency });
    this.#filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 900, Q: 10 });
    this.#envelope = new GainNode(context, { gain: 0 });
    this.#oscillator.connect(this.#filter).connect(this.#envelope).connect(destination);
    this.#oscillator.start();
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const frequency = frequencyForMidi(event.pitch);
    this.#oscillator.frequency.cancelScheduledValues(time);
    this.#oscillator.frequency.setValueAtTime(this.#lastFrequency, time);
    if (event.slide) this.#oscillator.frequency.exponentialRampToValueAtTime(frequency, time + Math.min(0.09, duration * 0.5));
    else this.#oscillator.frequency.setValueAtTime(frequency, time);
    this.#lastFrequency = frequency;

    const peak = event.accent ? 0.28 : 0.18;
    this.#filter.frequency.cancelScheduledValues(time);
    this.#filter.frequency.setValueAtTime(event.accent ? 2600 : 1500, time);
    this.#filter.frequency.exponentialRampToValueAtTime(420, time + Math.max(0.04, duration));
    this.#envelope.gain.cancelScheduledValues(time);
    this.#envelope.gain.setValueAtTime(0, time);
    this.#envelope.gain.linearRampToValueAtTime(peak, time + 0.004);
    this.#envelope.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.04, duration));
  }

  panic(time: number): void {
    this.#envelope.gain.cancelScheduledValues(time);
    this.#envelope.gain.setValueAtTime(0, time);
  }
}
