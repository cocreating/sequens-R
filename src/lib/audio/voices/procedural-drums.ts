import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

export interface DrumKitDefinition {
  id: string;
  seed: number;
  kickHz: number;
  kickDrop: number;
  snareHz: number;
  hatMetal: number;
  clapSpread: number;
  saturation: number;
  tune: number;
}

export const DRUM_KITS: readonly DrumKitDefinition[] = Object.freeze([
  { id: 'drums-core-v2', seed: 0x7100_0001, kickHz: 49, kickDrop: 3.8, snareHz: 186, hatMetal: 0.56, clapSpread: 1, saturation: 0.18, tune: 0 },
  { id: 'drums-broken-v2', seed: 0x7100_0002, kickHz: 56, kickDrop: 2.9, snareHz: 214, hatMetal: 0.72, clapSpread: 1.25, saturation: 0.28, tune: 0.7 },
  { id: 'drums-latin-v2', seed: 0x7100_0003, kickHz: 61, kickDrop: 2.2, snareHz: 236, hatMetal: 0.42, clapSpread: 0.72, saturation: 0.1, tune: 2.3 },
  { id: 'drums-electro-v2', seed: 0x7100_0004, kickHz: 44, kickDrop: 5.1, snareHz: 168, hatMetal: 0.88, clapSpread: 1.12, saturation: 0.42, tune: -1.2 },
  { id: 'drums-halftime-v2', seed: 0x7100_0005, kickHz: 39, kickDrop: 4.4, snareHz: 151, hatMetal: 0.5, clapSpread: 1.45, saturation: 0.34, tune: -2.1 },
  { id: 'drums-odd-v2', seed: 0x7100_0006, kickHz: 53, kickDrop: 3.3, snareHz: 203, hatMetal: 0.66, clapSpread: 0.9, saturation: 0.22, tune: 1.4 },
]);

const LANE_DURATIONS = [0.72, 0.42, 0.12, 0.82, 0.48, 0.52, 0.16, 0.38] as const;
const LANE_PANS = [0, -0.06, 0.14, -0.18, 0.08, -0.22, 0.2, 0.26] as const;
const MIN_GAIN = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function kitFor(id: string): DrumKitDefinition {
  return DRUM_KITS.find((kit) => kit.id === id) ?? DRUM_KITS[0]!;
}

function envelope(time: number, duration: number, attack: number, curve: number): number {
  const onset = 1 - Math.exp(-time / attack);
  return onset * Math.exp(-time * curve / duration);
}

function removeDcAndFade(samples: Float32Array, sampleRate: number): void {
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  const fadeSamples = Math.min(samples.length, Math.ceil(sampleRate * 0.008));
  let residual = 0;
  let fadeSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const fade = index >= samples.length - fadeSamples ? (samples.length - 1 - index) / fadeSamples : 1;
    residual += (samples[index]! - mean) * Math.max(0, fade);
    fadeSum += Math.max(0, fade);
  }
  const correction = residual / fadeSum;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const fade = index >= samples.length - fadeSamples ? (samples.length - 1 - index) / fadeSamples : 1;
    samples[index] = (samples[index]! - mean - correction) * Math.max(0, fade);
    peak = Math.max(peak, Math.abs(samples[index]!));
  }
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  if (scale < 1) for (let index = 0; index < samples.length; index += 1) samples[index] = samples[index]! * scale;
}

export function renderProceduralDrumLane(kitId: string, lane: number, sampleRate: number, variant = 0): Float32Array<ArrayBuffer> {
  const kit = kitFor(kitId);
  const normalizedLane = Math.max(0, Math.min(7, Math.round(lane)));
  const duration = LANE_DURATIONS[normalizedLane]! * (1 + (variant & 1) * 0.035);
  const length = Math.ceil(duration * sampleRate);
  const samples = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
  const random = randomGenerator(kit.seed ^ Math.imul(normalizedLane + 1, 0x9e37_79b9) ^ Math.imul(variant + 1, 0x85eb_ca6b));
  let phase = 0;
  let phase2 = 0;
  let lowpass = 0;
  let highpass = 0;
  let previousNoise = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const noise = random() * 2 - 1;
    let sample = 0;
    if (normalizedLane === 0) {
      const frequency = kit.kickHz * (1 + kit.kickDrop * Math.exp(-time * 32));
      phase += 2 * Math.PI * frequency / sampleRate;
      const body = Math.sin(phase) * envelope(time, duration, 0.0015, 7.2);
      const transient = noise * Math.exp(-time * 155) * 0.34;
      const driven = Math.tanh((body + transient) * (1 + kit.saturation * 3));
      sample = driven * (0.9 - kit.saturation * 0.12);
    } else if (normalizedLane === 1) {
      phase += 2 * Math.PI * kit.snareHz / sampleRate;
      phase2 += 2 * Math.PI * kit.snareHz * (1.47 + variant * 0.015) / sampleRate;
      highpass = noise - previousNoise + 0.955 * highpass;
      previousNoise = noise;
      const modes = Math.sin(phase) * 0.26 + Math.sin(phase2) * 0.15;
      sample = (highpass * 0.66 + modes) * envelope(time, duration, 0.001, 8.6);
    } else if (normalizedLane === 2 || normalizedLane === 3) {
      const frequencies = [1, 1.342, 1.731, 2.137, 2.711, 3.193];
      const base = 3_950 + kit.hatMetal * 1_850 + variant * 83;
      let metal = 0;
      for (let oscillator = 0; oscillator < frequencies.length; oscillator += 1) {
        metal += Math.sin(2 * Math.PI * base * frequencies[oscillator]! * time + oscillator * 0.73) >= 0 ? 1 : -1;
      }
      metal /= frequencies.length;
      lowpass += 0.085 * (metal - lowpass);
      const bright = metal - lowpass;
      const decay = normalizedLane === 2 ? 30 : 6.4;
      sample = (bright * 0.82 + noise * 0.18) * (1 - Math.exp(-time * 900)) * Math.exp(-time * decay);
    } else if (normalizedLane === 4) {
      const spread = kit.clapSpread;
      const bursts = [0, 0.016 * spread, 0.033 * spread];
      let burstEnvelope = Math.exp(-time * 9.5) * 0.34;
      for (const onset of bursts) if (time >= onset) burstEnvelope += Math.exp(-(time - onset) * 105) * 0.52;
      highpass = noise - previousNoise + 0.94 * highpass;
      previousNoise = noise;
      sample = highpass * burstEnvelope * 0.76;
    } else if (normalizedLane === 5) {
      const frequency = (118 + kit.tune * 5) * (1 + 0.7 * Math.exp(-time * 22));
      phase += 2 * Math.PI * frequency / sampleRate;
      sample = (Math.sin(phase) + Math.sin(phase * 1.5) * 0.16) * envelope(time, duration, 0.0015, 7.6) * 0.82;
    } else if (normalizedLane === 6) {
      phase += 2 * Math.PI * (1_620 + kit.tune * 21) / sampleRate;
      sample = (Math.sin(phase) * 0.62 + noise * 0.38) * Math.exp(-time * 43) * 0.72;
    } else {
      const carrier = 310 + kit.tune * 13;
      phase += 2 * Math.PI * carrier / sampleRate;
      phase2 += 2 * Math.PI * carrier * 2.63 / sampleRate;
      sample = Math.sin(phase + Math.sin(phase2) * 2.1) * envelope(time, duration, 0.001, 10.5) * 0.68;
    }
    samples[index] = Number.isFinite(sample) ? sample : 0;
  }
  removeDcAndFade(samples, sampleRate);
  return samples;
}

export function drumVariationIndex(presetId: string, lane: number, event: Readonly<NoteEvent>, triggerIndex: number): 0 | 1 {
  let hash = 0x811c_9dc5;
  for (const character of presetId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x0100_0193);
  hash ^= Math.imul(lane + 1, 0x9e37_79b9);
  hash ^= Math.imul(event.pitch + event.velocity * 257, 0x85eb_ca6b);
  hash ^= Math.imul(triggerIndex + 1, 0xc2b2_ae35);
  return (hash >>> 0) % 2 as 0 | 1;
}

export function drumVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.08, 1);
  return 0.18 + normalized ** 1.35 * 0.82;
}

interface LaneBus {
  input: GainNode;
  filter: BiquadFilterNode;
  velocity: GainNode;
  level: GainNode;
  pan: StereoPannerNode;
}

function laneFilterFrequency(lane: number, tone: number): number {
  return lane === 0 || lane === 5
    ? 1_600 + tone * 8_400
    : lane === 2 || lane === 3 || lane === 4
      ? 2_600 + tone * 5_800
      : 650 + tone * 4_900;
}

function laneFilterQ(lane: number, punch: number): number {
  return lane === 1 ? 0.8 + punch * 1.6 : 0.62 + punch * 0.45;
}

function laneLevel(lane: number, punch: number): number {
  return 0.62 + punch * (lane === 0 || lane === 1 ? 0.34 : 0.24);
}

function holdAndRamp(param: AudioParam, value: number, time: number, duration = 0.018): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
  param.linearRampToValueAtTime(value, time + duration);
}

export class ProceduralDrumVoice {
  readonly maxVoiceCount = 16;
  readonly #context: BaseAudioContext;
  readonly #lanes: readonly LaneBus[];
  readonly #buffers: readonly (readonly AudioBuffer[])[];
  readonly #active = new Map<AudioBufferSourceNode, number>();
  #sound: Readonly<SoundState>;
  #triggerIndex = 0;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    const tone = (sound.params.tone ?? 50) / 100;
    const punch = (sound.params.punch ?? 50) / 100;
    this.#lanes = Array.from({ length: 8 }, (_, lane) => {
      const input = new GainNode(context, { gain: 1 });
      const filter = new BiquadFilterNode(context, {
        type: lane === 0 || lane === 5 ? 'lowpass' : lane === 2 || lane === 3 || lane === 4 ? 'highpass' : 'bandpass',
        frequency: laneFilterFrequency(lane, tone),
        Q: laneFilterQ(lane, punch),
      });
      const velocity = new GainNode(context, { gain: 0.72 });
      const level = new GainNode(context, { gain: laneLevel(lane, punch) });
      const pan = new StereoPannerNode(context, { pan: LANE_PANS[lane] ?? 0 });
      input.connect(filter).connect(velocity).connect(level).connect(pan).connect(destination);
      return { input, filter, velocity, level, pan };
    });
    this.#buffers = Array.from({ length: 8 }, (_, lane) => Array.from({ length: 2 }, (_, variant) => {
      const samples = renderProceduralDrumLane(sound.presetId, lane, context.sampleRate, variant);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      return buffer;
    }));
  }

  trigger(event: NoteEvent, time: number): void {
    if (this.#active.size >= this.maxVoiceCount) {
      const oldest = this.#active.keys().next().value as AudioBufferSourceNode | undefined;
      if (oldest !== undefined) {
        try { oldest.stop(time + 0.002); } catch { /* It may already be scheduled to stop. */ }
        this.#active.delete(oldest);
      }
    }
    const lane = clamp(Math.round(event.lane ?? event.pitch - 36), 0, 7);
    if (lane === 2) this.#chokeOpenHat(time);
    const variant = drumVariationIndex(this.#sound.presetId, lane, event, this.#triggerIndex);
    this.#triggerIndex += 1;
    const source = new AudioBufferSourceNode(this.#context, { buffer: this.#buffers[lane]![variant]! });
    const tone = this.#sound.params.tone ?? 50;
    const decay = this.#sound.params.decay ?? 50;
    const cents = (variant === 0 ? -1 : 1) * (2 + tone * 0.035);
    const decayRate = clamp(1.35 - decay / 145, 0.66, 1.28);
    source.detune.setValueAtTime(cents, time);
    source.playbackRate.setValueAtTime(decayRate, time);
    const laneBus = this.#lanes[lane]!;
    holdAndRamp(laneBus.velocity.gain, drumVelocityGain(event.velocity), time, 0.002);
    source.connect(laneBus.input);
    this.#active.set(source, lane);
    source.onended = () => {
      source.disconnect();
      this.#active.delete(source);
    };
    source.start(time);
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    const tone = (sound.params.tone ?? 50) / 100;
    const punch = (sound.params.punch ?? 50) / 100;
    for (let lane = 0; lane < this.#lanes.length; lane += 1) {
      const bus = this.#lanes[lane]!;
      holdAndRamp(bus.filter.frequency, laneFilterFrequency(lane, tone), time);
      holdAndRamp(bus.filter.Q, laneFilterQ(lane, punch), time);
      holdAndRamp(bus.level.gain, laneLevel(lane, punch), time);
    }
  }

  #chokeOpenHat(time: number): void {
    const openBus = this.#lanes[3]!;
    if (typeof openBus.velocity.gain.cancelAndHoldAtTime === 'function') openBus.velocity.gain.cancelAndHoldAtTime(time);
    else openBus.velocity.gain.cancelScheduledValues(time);
    openBus.velocity.gain.linearRampToValueAtTime(MIN_GAIN, time + 0.003);
    openBus.velocity.gain.setValueAtTime(0.72, time + 0.004);
    for (const [source, lane] of this.#active) {
      if (lane !== 3) continue;
      try { source.stop(time + 0.004); } catch { /* It may already be scheduled to stop. */ }
    }
  }

  panic(time = this.#context.currentTime): void {
    for (const source of this.#active.keys()) {
      try { source.stop(time); } catch { /* It may already have ended. */ }
    }
    this.#active.clear();
  }

  dispose(time = this.#context.currentTime): void {
    this.panic(time);
    for (const bus of this.#lanes) {
      bus.input.disconnect();
      bus.filter.disconnect();
      bus.velocity.disconnect();
      bus.level.disconnect();
      bus.pan.disconnect();
    }
  }

  get activeVoiceCount(): number {
    return this.#active.size;
  }
}
