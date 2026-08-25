export interface AudioPcm {
  sampleRate: number;
  channels: readonly Float32Array[];
}

export function pcmFromAudioBuffer(buffer: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'getChannelData'>): AudioPcm {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => Float32Array.from(buffer.getChannelData(channel))),
  };
}

export interface AudioAnalysis {
  sampleRate: number;
  channelCount: number;
  durationSeconds: number;
  integratedLufs: number | null;
  samplePeakDbfs: number;
  truePeakDbtp: number;
  dcDbfs: number;
  rmsDbfs: number;
  rmsEnvelopeDbfs: readonly number[];
  coarseBandsDbfs: Readonly<Record<'sub' | 'low' | 'mid' | 'presence' | 'high', number>>;
}

export interface AnalysisGate {
  loudnessTarget: number;
  loudnessTolerance: number;
  maxTruePeakDbtp: number;
  maxDcDbfs: number;
}

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

const MIN_DB = -180;
const TRUE_PEAK_FACTOR = 4;
const TRUE_PEAK_RADIUS = 4;

function toDb(value: number): number {
  return value <= 0 ? MIN_DB : 20 * Math.log10(value);
}

function powerToDb(value: number): number {
  return value <= 0 ? MIN_DB : 10 * Math.log10(value);
}

function validatePcm(pcm: AudioPcm): number {
  if (!Number.isFinite(pcm.sampleRate) || pcm.sampleRate < 8_000) throw new RangeError('Audio sample rate must be at least 8 kHz.');
  if (pcm.channels.length < 1) throw new RangeError('Audio analysis requires at least one channel.');
  const length = pcm.channels[0]!.length;
  if (length < 1 || pcm.channels.some((channel) => channel.length !== length)) throw new RangeError('Audio channels must have one shared non-zero length.');
  for (const channel of pcm.channels) {
    for (const sample of channel) if (!Number.isFinite(sample)) throw new RangeError('Audio contains NaN or Infinity.');
  }
  return length;
}

function highShelf(sampleRate: number): BiquadCoefficients {
  const frequency = 1_681.974450955533;
  const gainDb = 3.999843853973347;
  const quality = 0.7071752369554196;
  const k = Math.tan(Math.PI * frequency / sampleRate);
  const vh = 10 ** (gainDb / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / quality + k * k;
  return {
    b0: (vh + vb * k / quality + k * k) / a0,
    b1: 2 * (k * k - vh) / a0,
    b2: (vh - vb * k / quality + k * k) / a0,
    a1: 2 * (k * k - 1) / a0,
    a2: (1 - k / quality + k * k) / a0,
  };
}

function highPass(sampleRate: number): BiquadCoefficients {
  const frequency = 38.13547087602444;
  const quality = 0.5003270373238773;
  const k = Math.tan(Math.PI * frequency / sampleRate);
  const a0 = 1 + k / quality + k * k;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: 2 * (k * k - 1) / a0,
    a2: (1 - k / quality + k * k) / a0,
  };
}

function applyBiquad(input: Float64Array, coefficients: BiquadCoefficients): Float64Array {
  const output = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < input.length; index += 1) {
    const x0 = input[index]!;
    const y0 = coefficients.b0 * x0 + coefficients.b1 * x1 + coefficients.b2 * x2 - coefficients.a1 * y1 - coefficients.a2 * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function kWeight(channel: Float32Array, sampleRate: number): Float64Array {
  return applyBiquad(applyBiquad(Float64Array.from(channel), highShelf(sampleRate)), highPass(sampleRate));
}

function blockPowers(channels: readonly Float64Array[], sampleRate: number): number[] {
  const blockLength = Math.min(channels[0]!.length, Math.max(1, Math.round(sampleRate * 0.4)));
  const hop = Math.max(1, Math.round(blockLength / 4));
  const starts: number[] = [];
  for (let start = 0; start + blockLength <= channels[0]!.length; start += hop) starts.push(start);
  if (starts.length === 0) starts.push(0);
  return starts.map((start) => {
    let sum = 0;
    for (const channel of channels) {
      let channelPower = 0;
      const end = Math.min(channel.length, start + blockLength);
      for (let index = start; index < end; index += 1) channelPower += channel[index]! * channel[index]!;
      sum += channelPower / Math.max(1, end - start);
    }
    return sum;
  });
}

export function integratedLoudness(pcm: AudioPcm): number | null {
  validatePcm(pcm);
  const powers = blockPowers(pcm.channels.map((channel) => kWeight(channel, pcm.sampleRate)), pcm.sampleRate);
  const aboveAbsolute = powers.filter((power) => -0.691 + powerToDb(power) >= -70);
  if (aboveAbsolute.length === 0) return null;
  const absoluteMean = aboveAbsolute.reduce((sum, value) => sum + value, 0) / aboveAbsolute.length;
  const relativeGate = -0.691 + powerToDb(absoluteMean) - 10;
  const aboveRelative = aboveAbsolute.filter((power) => -0.691 + powerToDb(power) >= relativeGate);
  const gatedMean = aboveRelative.reduce((sum, value) => sum + value, 0) / aboveRelative.length;
  return -0.691 + powerToDb(gatedMean);
}

function sinc(value: number): number {
  return Math.abs(value) < 1e-12 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
}

const TRUE_PEAK_KERNELS = Array.from({ length: TRUE_PEAK_FACTOR - 1 }, (_, phaseIndex) => {
  const fraction = (phaseIndex + 1) / TRUE_PEAK_FACTOR;
  const coefficients = Array.from({ length: TRUE_PEAK_RADIUS * 2 }, (_, tap) => {
    const offset = tap - TRUE_PEAK_RADIUS + 1;
    const distance = fraction - offset;
    const window = 0.42 + 0.5 * Math.cos(Math.PI * distance / TRUE_PEAK_RADIUS) + 0.08 * Math.cos(2 * Math.PI * distance / TRUE_PEAK_RADIUS);
    return sinc(distance) * window;
  });
  const total = coefficients.reduce((sum, value) => sum + value, 0);
  return coefficients.map((value) => value / total);
});

export function truePeak(pcm: AudioPcm): number {
  const length = validatePcm(pcm);
  let peak = 0;
  for (const channel of pcm.channels) {
    for (let index = 0; index < length; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]!));
      for (const kernel of TRUE_PEAK_KERNELS) {
        let reconstructed = 0;
        for (let tap = 0; tap < kernel.length; tap += 1) {
          const sourceIndex = index + tap - TRUE_PEAK_RADIUS + 1;
          if (sourceIndex >= 0 && sourceIndex < length) reconstructed += channel[sourceIndex]! * kernel[tap]!;
        }
        peak = Math.max(peak, Math.abs(reconstructed));
      }
    }
  }
  return peak;
}

function rmsEnvelope(pcm: AudioPcm, windowSeconds = 0.1): number[] {
  const windowLength = Math.max(1, Math.round(pcm.sampleRate * windowSeconds));
  const output: number[] = [];
  for (let start = 0; start < pcm.channels[0]!.length; start += windowLength) {
    const end = Math.min(pcm.channels[0]!.length, start + windowLength);
    let power = 0;
    for (const channel of pcm.channels) {
      for (let index = start; index < end; index += 1) power += channel[index]! * channel[index]!;
    }
    output.push(powerToDb(power / ((end - start) * pcm.channels.length)));
  }
  return output;
}

function goertzelPower(channel: Float32Array, sampleRate: number, frequency: number, start: number, length: number): number {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let previous2 = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * offset / Math.max(1, length - 1));
    const current = channel[start + offset]! * window + coefficient * previous - previous2;
    previous2 = previous;
    previous = current;
  }
  return Math.max(0, (previous2 * previous2 + previous * previous - coefficient * previous * previous2) / (length * length));
}

function coarseBands(pcm: AudioPcm): AudioAnalysis['coarseBandsDbfs'] {
  const bands = { sub: 60, low: 180, mid: 800, presence: 3_000, high: 9_000 } as const;
  const windowLength = Math.min(2_048, pcm.channels[0]!.length);
  const windowCount = Math.min(8, Math.max(1, Math.floor(pcm.channels[0]!.length / windowLength)));
  return Object.fromEntries(Object.entries(bands).map(([name, frequency]) => {
    let power = 0;
    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const start = windowCount === 1 ? 0 : Math.floor((pcm.channels[0]!.length - windowLength) * windowIndex / (windowCount - 1));
      for (const channel of pcm.channels) power += goertzelPower(channel, pcm.sampleRate, Math.min(frequency, pcm.sampleRate * 0.45), start, windowLength);
    }
    return [name, powerToDb(power / (windowCount * pcm.channels.length))];
  })) as unknown as AudioAnalysis['coarseBandsDbfs'];
}

export function analyzeAudio(pcm: AudioPcm, tailStartSeconds = 0): AudioAnalysis {
  const length = validatePcm(pcm);
  let peak = 0;
  let power = 0;
  const dcStart = Math.max(0, Math.min(length - 1, Math.round(tailStartSeconds * pcm.sampleRate)));
  let dc = 0;
  let dcSamples = 0;
  for (const channel of pcm.channels) {
    for (let index = 0; index < length; index += 1) {
      const sample = channel[index]!;
      peak = Math.max(peak, Math.abs(sample));
      power += sample * sample;
      if (index >= dcStart) {
        dc += sample;
        dcSamples += 1;
      }
    }
  }
  return Object.freeze({
    sampleRate: pcm.sampleRate,
    channelCount: pcm.channels.length,
    durationSeconds: length / pcm.sampleRate,
    integratedLufs: integratedLoudness(pcm),
    samplePeakDbfs: toDb(peak),
    truePeakDbtp: toDb(truePeak(pcm)),
    dcDbfs: toDb(Math.abs(dc / dcSamples)),
    rmsDbfs: powerToDb(power / (length * pcm.channels.length)),
    rmsEnvelopeDbfs: Object.freeze(rmsEnvelope(pcm)),
    coarseBandsDbfs: Object.freeze(coarseBands(pcm)),
  });
}

export function assertAnalysisGate(analysis: AudioAnalysis, gate: AnalysisGate): void {
  if (analysis.integratedLufs === null) throw new RangeError('Audio is silent and has no integrated loudness.');
  if (Math.abs(analysis.integratedLufs - gate.loudnessTarget) > gate.loudnessTolerance) throw new RangeError('Integrated loudness is outside the approved range.');
  if (analysis.truePeakDbtp > gate.maxTruePeakDbtp) throw new RangeError('True peak exceeds the approved ceiling.');
  if (analysis.dcDbfs > gate.maxDcDbfs) throw new RangeError('DC exceeds the approved ceiling.');
}

export function loudnessMatch(pcm: AudioPcm, targetLufs: number): { pcm: AudioPcm; gainDb: number } {
  const measured = integratedLoudness(pcm);
  if (measured === null) throw new RangeError('Silent audio cannot be loudness matched.');
  const gainDb = targetLufs - measured;
  const gain = 10 ** (gainDb / 20);
  return {
    pcm: { sampleRate: pcm.sampleRate, channels: pcm.channels.map((channel) => Float32Array.from(channel, (sample) => sample * gain)) },
    gainDb,
  };
}

export function analysisReport(entries: Readonly<Record<string, AudioAnalysis>>): string {
  return `${JSON.stringify({ standard: 'ITU-R BS.1770-5', truePeakOversampling: TRUE_PEAK_FACTOR, entries }, null, 2)}\n`;
}
