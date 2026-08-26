export interface AcidDspParams {
  wave: number;
  cutoff: number;
  resonance: number;
  envAmount: number;
  decay: number;
  accent: number;
  slide: number;
  drive: number;
}

export const DEFAULT_ACID_DSP_PARAMS: Readonly<AcidDspParams> = Object.freeze({
  wave: 0,
  cutoff: 52,
  resonance: 62,
  envAmount: 58,
  decay: 48,
  accent: 65,
  slide: 35,
  drive: 10,
});

export function clampAcid(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function acidCutoffHz(value: number): number {
  return 55 * 2 ** (clampAcid(value, 0, 100) / 100 * 7.9);
}

export function acidDecaySeconds(value: number): number {
  return 0.045 + (clampAcid(value, 0, 100) / 100) ** 1.7 * 0.82;
}

export function acidSlideSeconds(value: number): number {
  return 0.004 + (clampAcid(value, 0, 100) / 100) ** 1.6 * 0.216;
}

export function acidAccentDepth(accented: boolean, value: number): number {
  return accented ? clampAcid(value, 0, 100) / 100 : 0;
}

export function acidAmplitudePeak(accented: boolean, value: number): number {
  return 0.27 + acidAccentDepth(accented, value) * 0.18;
}

export function acidFilterEnvelopePeak(accented: boolean): number {
  return accented ? 1.2 : 1;
}

export function acidDcBlockCoefficient(sampleRate: number): number {
  return Math.exp(-2 * Math.PI * 18 / clampAcid(sampleRate, 8_000, 192_000));
}

export function polyBlep(phase: number, phaseIncrement: number): number {
  if (phase < phaseIncrement) {
    const normalized = phase / phaseIncrement;
    return normalized + normalized - normalized * normalized - 1;
  }
  if (phase > 1 - phaseIncrement) {
    const normalized = (phase - 1) / phaseIncrement;
    return normalized * normalized + normalized + normalized + 1;
  }
  return 0;
}

export class AcidDspKernel {
  readonly #sampleRate: number;
  readonly #dcCoefficient: number;
  readonly #filterState = new Float64Array(4);
  #phase = 0;
  #dcInput = 0;
  #dcOutput = 0;

  constructor(sampleRate: number) {
    this.#sampleRate = clampAcid(sampleRate, 8_000, 192_000);
    this.#dcCoefficient = acidDcBlockCoefficient(this.#sampleRate);
  }

  process(frequency: number, amplitude: number, filterEnvelope: number, accented: boolean, params: Readonly<AcidDspParams>, oversampling: 1 | 2 = 1): number {
    let sum = 0;
    const internalRate = this.#sampleRate * oversampling;
    for (let pass = 0; pass < oversampling; pass += 1) {
      const safeFrequency = clampAcid(frequency, 8, internalRate * 0.225);
      const increment = safeFrequency / internalRate;
      this.#phase = (this.#phase + increment) % 1;
      const saw = this.#phase * 2 - 1 - polyBlep(this.#phase, increment);
      const square = (this.#phase < 0.5 ? 1 : -1)
        + polyBlep(this.#phase, increment)
        - polyBlep((this.#phase + 0.5) % 1, increment);
      const waveMix = clampAcid(params.wave, 0, 1);
      const oscillator = saw + (square - saw) * waveMix;

      const drive = clampAcid(params.drive, 0, 100) / 100;
      const preDriven = Math.tanh(oscillator * (1 + drive * 5.5));
      const accentDepth = accented ? clampAcid(params.accent, 0, 100) / 100 : 0;
      const envelopeOctaves = filterEnvelope * clampAcid(params.envAmount, 0, 100) / 100 * (4.8 + accentDepth * 2.4);
      const cutoff = acidCutoffHz(params.cutoff) * 2 ** envelopeOctaves;
      const resonance = 0.15 + clampAcid(params.resonance, 0, 100) / 100 * 3.68;
      const filtered = this.#ladder(preDriven, cutoff, resonance, internalRate);
      sum += Math.tanh(filtered * (1 + drive * 3.2)) * (0.72 - drive * 0.18);
    }
    const input = sum / oversampling * clampAcid(amplitude, 0, 1.5);
    const blocked = input - this.#dcInput + this.#dcCoefficient * this.#dcOutput;
    if (!Number.isFinite(blocked)) {
      this.reset();
      return 0;
    }
    this.#dcInput = input;
    this.#dcOutput = blocked;
    return clampAcid(blocked * 4, -1.2, 1.2);
  }

  reset(): void {
    this.#filterState.fill(0);
    this.#dcInput = 0;
    this.#dcOutput = 0;
  }

  #onePole(input: number, stage: number, coefficient: number): number {
    const state = this.#filterState[stage] ?? 0;
    const delta = (input - state) * coefficient;
    const output = delta + state;
    this.#filterState[stage] = output + delta;
    return output;
  }

  #ladder(input: number, cutoff: number, resonance: number, processingRate: number): number {
    const normalizedCutoff = clampAcid(cutoff, 30, processingRate * 0.42);
    const g = Math.tan(Math.PI * normalizedCutoff / processingRate);
    const coefficient = g / (1 + g);
    const c2 = coefficient * coefficient;
    const c3 = c2 * coefficient;
    const c4 = c3 * coefficient;
    const sigma = c3 * this.#filterState[0]! + c2 * this.#filterState[1]! + coefficient * this.#filterState[2]! + this.#filterState[3]!;
    const driven = Math.tanh(input - resonance * sigma) / (1 + resonance * c4);
    const first = this.#onePole(driven, 0, coefficient);
    const second = this.#onePole(first, 1, coefficient);
    const third = this.#onePole(second, 2, coefficient);
    return this.#onePole(third, 3, coefficient);
  }
}
