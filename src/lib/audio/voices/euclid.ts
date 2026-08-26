import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const RING_PAN = [-0.82, 0, 0.82] as const;
const RING_DECAY = [1.14, 0.82, 0.58] as const;
const RING_HARMONIC = [1.618, 2.414, 3.236] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hold(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
}

function ramp(param: AudioParam, value: number, time: number, duration = 0.02): void {
  hold(param, time);
  param.linearRampToValueAtTime(value, time + duration);
}

export function frequencyForEuclidMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function euclidDecaySeconds(decay: number, ring: number): number {
  const normalizedRing = Math.max(0, Math.min(RING_DECAY.length - 1, Math.round(ring)));
  return (0.09 + (clamp(decay, 0, 100) / 100) ** 1.65 * 1.05) * RING_DECAY[normalizedRing]!;
}

export function euclidToneCutoffHz(tone: number, ring: number): number {
  const normalizedRing = Math.max(0, Math.min(RING_HARMONIC.length - 1, Math.round(ring)));
  const base = 300 * 2 ** (clamp(tone, 0, 100) / 100 * 5.1);
  return Math.min(16_000, base * (0.78 + normalizedRing * 0.22));
}

export function euclidRingPan(spread: number, ring: number): number {
  const normalizedRing = Math.max(0, Math.min(RING_PAN.length - 1, Math.round(ring)));
  return RING_PAN[normalizedRing]! * clamp(spread, 0, 100) / 100;
}

export function euclidVelocityGain(velocity: number, ring: number): number {
  const normalizedRing = Math.max(0, Math.min(2, Math.round(ring)));
  const normalizedVelocity = clamp(velocity / 127, 0.01, 1);
  return (0.14 + normalizedVelocity ** 1.25 * 0.3) * (1 - normalizedRing * 0.1);
}

interface EuclidRingVoice {
  carrier: OscillatorNode;
  overtone: OscillatorNode;
  overtoneGain: GainNode;
  modulator: OscillatorNode;
  modulatorGain: GainNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  panner: StereoPannerNode;
  releaseEnd: number;
}

/**
 * Three persistent tuned-percussion chains, selected solely from Euclid's
 * existing event lane. Generator notes, timing, and MIDI channel offsets never
 * enter this voice; they remain the scheduler's responsibility.
 */
export class EuclidVoice {
  readonly #context: BaseAudioContext;
  readonly #rings: EuclidRingVoice[];
  #sound: Readonly<SoundState>;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#rings = Array.from({ length: 3 }, (_, index) => {
      const carrier = new OscillatorNode(context, { type: 'sine', frequency: 120 });
      const overtone = new OscillatorNode(context, { type: 'sine', frequency: 240 });
      const overtoneGain = new GainNode(context, { gain: 0.1 });
      const modulator = new OscillatorNode(context, { type: 'sine', frequency: 180 });
      const modulatorGain = new GainNode(context, { gain: 0 });
      const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: euclidToneCutoffHz(sound.params.tone ?? 50, index), Q: 1.15 + index * 0.35 });
      const envelope = new GainNode(context, { gain: 0 });
      const panner = new StereoPannerNode(context, { pan: euclidRingPan(sound.params.spread ?? 42, index) });
      modulator.connect(modulatorGain).connect(carrier.frequency);
      carrier.connect(filter);
      overtone.connect(overtoneGain).connect(filter);
      filter.connect(envelope).connect(panner).connect(destination);
      carrier.start();
      overtone.start();
      modulator.start();
      return { carrier, overtone, overtoneGain, modulator, modulatorGain, filter, envelope, panner, releaseEnd: 0 };
    });
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, _duration: number): void {
    const ringIndex = Math.max(0, Math.min(this.#rings.length - 1, Math.round(event.lane ?? 0)));
    const ring = this.#rings[ringIndex]!;
    const wasActive = ring.releaseEnd > time;
    const start = time + (wasActive ? 0.0025 : 0);
    const tone = clamp(this.#sound.params.tone ?? 50, 0, 100) / 100;
    const frequency = frequencyForEuclidMidi(event.pitch);
    const releaseEnd = start + euclidDecaySeconds(this.#sound.params.decay ?? 45, ringIndex);
    const peak = euclidVelocityGain(event.velocity, ringIndex);
    const overtoneAmount = 0.035 + tone ** 1.35 * (0.07 + ringIndex * 0.035);
    const modulationDepth = frequency * (0.018 + tone ** 1.5 * (0.18 + ringIndex * 0.04));

    hold(ring.envelope.gain, time);
    if (wasActive) ring.envelope.gain.linearRampToValueAtTime(MIN_GAIN, start);
    else ring.envelope.gain.setValueAtTime(MIN_GAIN, start);
    ring.envelope.gain.linearRampToValueAtTime(peak, start + 0.0018);
    ring.envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak * 0.075), start + Math.min(0.11, (releaseEnd - start) * 0.36));
    ring.envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);

    ring.carrier.frequency.setValueAtTime(frequency, start);
    ring.overtone.frequency.setValueAtTime(frequency * RING_HARMONIC[ringIndex]!, start);
    ring.modulator.frequency.setValueAtTime(frequency * (1.97 + ringIndex * 0.27), start);
    hold(ring.modulatorGain.gain, time);
    if (wasActive) ring.modulatorGain.gain.linearRampToValueAtTime(MIN_GAIN, start);
    ring.modulatorGain.gain.setValueAtTime(modulationDepth, start);
    ring.modulatorGain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, modulationDepth * 0.06), start + Math.min(0.07, (releaseEnd - start) * 0.25));
    ring.modulatorGain.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);
    ring.overtoneGain.gain.setValueAtTime(overtoneAmount, start);

    const cutoff = euclidToneCutoffHz(this.#sound.params.tone ?? 50, ringIndex);
    hold(ring.filter.frequency, start);
    ring.filter.frequency.setValueAtTime(Math.max(120, cutoff * 1.85), start);
    ring.filter.frequency.exponentialRampToValueAtTime(cutoff, start + Math.min(0.14, (releaseEnd - start) * 0.52));
    ring.releaseEnd = releaseEnd;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    for (let index = 0; index < this.#rings.length; index += 1) {
      const ring = this.#rings[index]!;
      const set = (param: AudioParam, value: number): void => {
        if (smooth) ramp(param, value, time, 0.018);
        else param.setValueAtTime(value, time);
      };
      set(ring.filter.frequency, euclidToneCutoffHz(sound.params.tone ?? 50, index));
      set(ring.filter.Q, 1.15 + index * 0.35 + clamp(sound.params.tone ?? 50, 0, 100) / 100 * 1.1);
      set(ring.panner.pan, euclidRingPan(sound.params.spread ?? 42, index));
    }
  }

  panic(time: number): void {
    for (const ring of this.#rings) {
      hold(ring.envelope.gain, time);
      ring.envelope.gain.linearRampToValueAtTime(0, time + 0.005);
      hold(ring.modulatorGain.gain, time);
      ring.modulatorGain.gain.linearRampToValueAtTime(0, time + 0.005);
      ring.releaseEnd = time;
    }
  }

  dispose(time: number): void {
    this.panic(time);
    for (const ring of this.#rings) {
      try { ring.carrier.stop(time + 0.006); } catch { /* Oscillator may already be stopped. */ }
      try { ring.overtone.stop(time + 0.006); } catch { /* Oscillator may already be stopped. */ }
      try { ring.modulator.stop(time + 0.006); } catch { /* Oscillator may already be stopped. */ }
      for (const node of [ring.carrier, ring.overtone, ring.overtoneGain, ring.modulator, ring.modulatorGain, ring.filter, ring.envelope, ring.panner]) node.disconnect();
    }
  }

  get activeVoiceCount(): number {
    return this.#rings.filter((ring) => ring.releaseEnd > this.#context.currentTime).length;
  }
}
