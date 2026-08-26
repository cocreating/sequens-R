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

interface AcidLegacyChange {
  type: 'legacy';
}

interface AcidSync {
  type: 'sync';
  id: number;
}

type AcidMessage = AcidTrigger | AcidSoundChange | AcidPanic | AcidLegacyChange | AcidSync;

class SequensAcidProcessor extends AudioWorkletProcessor {
  readonly #events: AcidTrigger[] = [];
  readonly #soundChanges: AcidSoundChange[] = [];
  readonly #kernel = new AcidDspKernel(sampleRate);
  readonly #currentParams: AcidDspParams = { ...DEFAULT_ACID_DSP_PARAMS };
  readonly #targetParams: AcidDspParams = { ...DEFAULT_ACID_DSP_PARAMS };
  readonly #legacyFilterState = new Float64Array(4);
  #legacy = false;
  #legacyPhase = 0;
  #legacyNoteStart = Number.NEGATIVE_INFINITY;
  #legacyNoteDuration = 0.1;
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
      if (message.data.type === 'legacy') {
        this.#legacy = true;
      } else if (message.data.type === 'sync') {
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
      output[index] = this.#legacy
        ? this.#legacySample(time)
        : this.#kernel.process(this.#frequencyAt(time), this.#amplitudeEnvelope, this.#filterEnvelope, this.#accented, this.#currentParams, 1);
    }
    return true;
  }

  #activate(event: AcidTrigger): void {
    if (this.#legacy) {
      this.#slideFrom = this.#frequencyAt(event.startTime);
      this.#slideStart = event.startTime;
      this.#slideEnd = event.slide ? event.startTime + Math.min(0.09, event.duration * 0.5) : event.startTime;
      this.#frequency = event.frequency;
      this.#legacyNoteStart = event.startTime;
      this.#legacyNoteDuration = Math.max(0.04, event.duration);
      this.#accented = event.accent;
      this.#gateEnd = event.startTime + event.duration;
      return;
    }
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
    this.#legacyFilterState.fill(0);
    this.#legacyNoteStart = Number.NEGATIVE_INFINITY;
  }

  #legacySample(time: number): number {
    const age = time - this.#legacyNoteStart;
    const envelope = this.#legacyEnvelope(age);
    const frequency = this.#frequencyAt(time);
    this.#legacyPhase = (this.#legacyPhase + frequency / sampleRate) % 1;
    const saw = this.#legacyPhase * 2 - 1;
    const cutoffPeak = this.#accented ? 3_200 : 1_850;
    const cutoff = 380 + (cutoffPeak - 380) * Math.exp(-5 * Math.max(0, age) / Math.max(0.04, this.#legacyNoteDuration));
    return this.#legacyLadder(Math.tanh(saw * 1.35), cutoff, this.#accented ? 3.65 : 3.35) * envelope;
  }

  #legacyEnvelope(age: number): number {
    if (age < 0 || age >= this.#legacyNoteDuration) return 0;
    const peak = this.#accented ? 0.34 : 0.23;
    if (age < 0.004) return peak * age / 0.004;
    return peak * Math.exp(-6 * (age - 0.004) / Math.max(0.01, this.#legacyNoteDuration - 0.004));
  }

  #legacyOnePole(input: number, stage: number, coefficient: number): number {
    const state = this.#legacyFilterState[stage] ?? 0;
    const delta = (input - state) * coefficient;
    const output = delta + state;
    this.#legacyFilterState[stage] = output + delta;
    return output;
  }

  #legacyLadder(input: number, cutoff: number, resonance: number): number {
    const normalizedCutoff = Math.max(40, Math.min(sampleRate * 0.45, cutoff));
    const g = Math.tan(Math.PI * normalizedCutoff / sampleRate);
    const coefficient = g / (1 + g);
    const c2 = coefficient * coefficient;
    const c3 = c2 * coefficient;
    const c4 = c3 * coefficient;
    const sigma = c3 * this.#legacyFilterState[0]! + c2 * this.#legacyFilterState[1]! + coefficient * this.#legacyFilterState[2]! + this.#legacyFilterState[3]!;
    const drive = (input - resonance * sigma) / (1 + resonance * c4);
    const first = this.#legacyOnePole(drive, 0, coefficient);
    const second = this.#legacyOnePole(first, 1, coefficient);
    const third = this.#legacyOnePole(second, 2, coefficient);
    return this.#legacyOnePole(third, 3, coefficient);
  }
}

registerProcessor('sequens-acid', SequensAcidProcessor);
