declare const currentTime: number;
declare const sampleRate: number;
declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

interface AcidTrigger {
  type: 'trigger';
  startTime: number;
  duration: number;
  frequency: number;
  slide: boolean;
  accent: boolean;
}

interface AcidPanic {
  type: 'panic';
  time: number;
}

type AcidMessage = AcidTrigger | AcidPanic;

/** Four cascaded trapezoidal-integrator one-poles with zero-delay feedback. */
class SequensAcidProcessor extends AudioWorkletProcessor {
  readonly #events: AcidTrigger[] = [];
  readonly #state = new Float64Array(4);
  #phase = 0;
  #frequency = 110;
  #slideFrom = 110;
  #slideStart = 0;
  #slideEnd = 0;
  #noteStart = Number.NEGATIVE_INFINITY;
  #noteDuration = 0.1;
  #accent = false;
  #panicTime: number | null = null;

  constructor() {
    super();
    this.port.onmessage = (message: MessageEvent<AcidMessage>) => {
      if (message.data.type === 'panic') {
        this.#events.length = 0;
        this.#panicTime = message.data.time;
        return;
      }
      this.#events.push(message.data);
      this.#events.sort((left, right) => left.startTime - right.startTime);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]?.[0];
    if (output === undefined) return true;
    for (let index = 0; index < output.length; index += 1) {
      const time = currentTime + index / sampleRate;
      if (this.#panicTime !== null && time >= this.#panicTime) {
        this.#noteStart = Number.NEGATIVE_INFINITY;
        this.#panicTime = null;
      }
      while (this.#events[0] !== undefined && this.#events[0]!.startTime <= time) this.#activate(this.#events.shift()!);

      const age = time - this.#noteStart;
      const envelope = this.#envelope(age);
      const frequency = this.#frequencyAt(time);
      this.#phase = (this.#phase + frequency / sampleRate) % 1;
      const saw = this.#phase * 2 - 1;
      const cutoffPeak = this.#accent ? 3_200 : 1_850;
      const cutoff = 380 + (cutoffPeak - 380) * Math.exp(-5 * Math.max(0, age) / Math.max(0.04, this.#noteDuration));
      output[index] = this.#ladder(Math.tanh(saw * 1.35), cutoff, this.#accent ? 3.65 : 3.35) * envelope;
    }
    return true;
  }

  #activate(event: AcidTrigger): void {
    this.#slideFrom = this.#frequencyAt(event.startTime);
    this.#slideStart = event.startTime;
    this.#slideEnd = event.slide ? event.startTime + Math.min(0.09, event.duration * 0.5) : event.startTime;
    this.#frequency = event.frequency;
    this.#noteStart = event.startTime;
    this.#noteDuration = Math.max(0.04, event.duration);
    this.#accent = event.accent;
  }

  #frequencyAt(time: number): number {
    if (this.#slideEnd <= this.#slideStart || time >= this.#slideEnd) return this.#frequency;
    const progress = Math.max(0, Math.min(1, (time - this.#slideStart) / (this.#slideEnd - this.#slideStart)));
    return this.#slideFrom * (this.#frequency / Math.max(1, this.#slideFrom)) ** progress;
  }

  #envelope(age: number): number {
    if (age < 0 || age >= this.#noteDuration) return 0;
    const peak = this.#accent ? 0.34 : 0.23;
    if (age < 0.004) return peak * age / 0.004;
    return peak * Math.exp(-6 * (age - 0.004) / Math.max(0.01, this.#noteDuration - 0.004));
  }

  #onePole(input: number, stage: number, coefficient: number): number {
    const state = this.#state[stage] ?? 0;
    const delta = (input - state) * coefficient;
    const output = delta + state;
    this.#state[stage] = output + delta;
    return output;
  }

  #ladder(input: number, cutoff: number, resonance: number): number {
    const normalizedCutoff = Math.max(40, Math.min(sampleRate * 0.45, cutoff));
    const g = Math.tan(Math.PI * normalizedCutoff / sampleRate);
    const coefficient = g / (1 + g);
    const c2 = coefficient * coefficient;
    const c3 = c2 * coefficient;
    const c4 = c3 * coefficient;
    const sigma = c3 * this.#state[0]! + c2 * this.#state[1]! + coefficient * this.#state[2]! + this.#state[3]!;
    const drive = (input - resonance * sigma) / (1 + resonance * c4);
    const first = this.#onePole(drive, 0, coefficient);
    const second = this.#onePole(first, 1, coefficient);
    const third = this.#onePole(second, 2, coefficient);
    return this.#onePole(third, 3, coefficient);
  }
}

registerProcessor('sequens-acid', SequensAcidProcessor);
