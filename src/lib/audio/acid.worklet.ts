import { AcidDspKernel, DEFAULT_ACID_DSP_PARAMS, acidAccentDepth, acidAmplitudePeak, acidDecaySeconds, acidFilterEnvelopePeak, acidSlideSeconds, clampAcid, type AcidDspParams } from './acid-dsp';

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

interface AcidSoundChange {
  type: 'sound';
  time: number;
  params: AcidDspParams;
}

interface AcidPanic {
  type: 'panic';
  time: number;
}

interface AcidSync {
  type: 'sync';
  id: number;
}

type AcidMessage = AcidTrigger | AcidSoundChange | AcidPanic | AcidSync;

class SequensAcidProcessor extends AudioWorkletProcessor {
  readonly #events: AcidTrigger[] = [];
  readonly #soundChanges: AcidSoundChange[] = [];
  readonly #kernel = new AcidDspKernel(sampleRate);
  readonly #currentParams: AcidDspParams = { ...DEFAULT_ACID_DSP_PARAMS };
  readonly #targetParams: AcidDspParams = { ...DEFAULT_ACID_DSP_PARAMS };
  #frequency = 110;
  #slideFrom = 110;
  #slideStart = 0;
  #slideEnd = 0;
  #gateEnd = Number.NEGATIVE_INFINITY;
  #outgoingSlide = false;
  #accented = false;
  #amplitudeEnvelope = 0;
  #filterEnvelope = 0;
  #attackUntil = Number.NEGATIVE_INFINITY;
  #panicTime: number | null = null;

  constructor() {
    super();
    this.port.onmessage = (message: MessageEvent<AcidMessage>) => {
      if (message.data.type === 'sync') {
        this.port.postMessage({ type: 'synced', id: message.data.id });
      } else if (message.data.type === 'panic') {
        this.#events.length = 0;
        this.#panicTime = message.data.time;
      } else if (message.data.type === 'sound') {
        this.#soundChanges.push(message.data);
        this.#soundChanges.sort((left, right) => left.time - right.time);
      } else {
        this.#events.push(message.data);
        this.#events.sort((left, right) => left.startTime - right.startTime);
      }
    };
    this.port.postMessage({ type: 'ready' });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]?.[0];
    if (output === undefined) return true;
    for (let index = 0; index < output.length; index += 1) {
      const time = currentTime + index / sampleRate;
      if (this.#panicTime !== null && time >= this.#panicTime) this.#panic();
      while (this.#soundChanges[0] !== undefined && this.#soundChanges[0]!.time <= time) this.#applySound(this.#soundChanges.shift()!.params);
      while (this.#events[0] !== undefined && this.#events[0]!.startTime <= time) this.#activate(this.#events.shift()!);
      this.#smoothParams();
      this.#advanceEnvelopes(time);
      output[index] = this.#kernel.process(this.#frequencyAt(time), this.#amplitudeEnvelope, this.#filterEnvelope, this.#accented, this.#currentParams, 1);
    }
    return true;
  }

  #activate(event: AcidTrigger): void {
    const overlaps = this.#gateEnd > event.startTime + 0.000_5;
    const glides = overlaps && this.#outgoingSlide;
    this.#slideFrom = this.#frequencyAt(event.startTime);
    this.#slideStart = event.startTime;
    this.#slideEnd = glides ? event.startTime + acidSlideSeconds(this.#currentParams.slide) : event.startTime;
    this.#frequency = clampAcid(event.frequency, 8, 20_000);
    this.#gateEnd = event.startTime + Math.max(0.015, event.duration);
    this.#outgoingSlide = event.slide;
    this.#accented = event.accent;
    if (!glides) {
      this.#amplitudeEnvelope = 0;
      this.#filterEnvelope = acidFilterEnvelopePeak(event.accent);
      this.#attackUntil = event.startTime + 0.0035;
    } else {
      this.#filterEnvelope = Math.max(this.#filterEnvelope, event.accent ? acidFilterEnvelopePeak(true) : 0.72);
    }
  }

  #frequencyAt(time: number): number {
    if (this.#slideEnd <= this.#slideStart || time >= this.#slideEnd) return this.#frequency;
    const progress = clampAcid((time - this.#slideStart) / (this.#slideEnd - this.#slideStart), 0, 1);
    return this.#slideFrom * (this.#frequency / Math.max(1, this.#slideFrom)) ** progress;
  }

  #advanceEnvelopes(time: number): void {
    const accentDepth = acidAccentDepth(this.#accented, this.#currentParams.accent);
    const amplitudePeak = acidAmplitudePeak(this.#accented, this.#currentParams.accent);
    if (time < this.#attackUntil) {
      this.#amplitudeEnvelope += (amplitudePeak - this.#amplitudeEnvelope) * Math.min(1, 1 / (sampleRate * 0.0012));
    } else if (time < this.#gateEnd) {
      const decay = acidDecaySeconds(this.#currentParams.decay);
      const sustain = 0.055 + accentDepth * 0.025;
      this.#amplitudeEnvelope = sustain + (this.#amplitudeEnvelope - sustain) * Math.exp(-1 / (sampleRate * decay));
    } else {
      this.#amplitudeEnvelope *= Math.exp(-1 / (sampleRate * 0.012));
      if (this.#amplitudeEnvelope < 0.000_01) this.#amplitudeEnvelope = 0;
    }
    const filterDecay = acidDecaySeconds(this.#currentParams.decay) * (0.58 + accentDepth * 0.35);
    this.#filterEnvelope *= Math.exp(-1 / (sampleRate * filterDecay));
  }

  #applySound(params: AcidDspParams): void {
    for (const key of Object.keys(this.#targetParams) as Array<keyof AcidDspParams>) {
      this.#targetParams[key] = clampAcid(params[key], 0, key === 'wave' ? 1 : 100);
    }
  }

  #smoothParams(): void {
    const coefficient = 1 - Math.exp(-1 / (sampleRate * 0.012));
    for (const key of Object.keys(this.#currentParams) as Array<keyof AcidDspParams>) {
      this.#currentParams[key] += (this.#targetParams[key] - this.#currentParams[key]) * coefficient;
    }
  }

  #panic(): void {
    this.#panicTime = null;
    this.#gateEnd = Number.NEGATIVE_INFINITY;
    this.#amplitudeEnvelope = 0;
    this.#filterEnvelope = 0;
    this.#kernel.reset();
  }
}

registerProcessor('sequens-acid', SequensAcidProcessor);
