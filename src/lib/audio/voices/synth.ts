import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const WAVEFORMS = ['triangle', 'sawtooth', 'square'] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function frequencyForSynthMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function synthCutoffHz(cutoff: number): number {
  return 70 * 2 ** (clamp(cutoff, 0, 100) / 100 * 7.8);
}

export function synthAttackSeconds(attack: number): number {
  return 0.002 + (clamp(attack, 0, 100) / 100) ** 2 * 0.248;
}

export function synthReleaseSeconds(release: number): number {
  return 0.02 + (clamp(release, 0, 100) / 100) ** 2 * 1.48;
}

export function synthVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.02, 1);
  return 0.1 + normalized ** 1.35 * 0.72;
}

export interface SynthTriggerPlan {
  legato: boolean;
  retrigger: boolean;
  glideSeconds: number;
}

export function planSynthTrigger(previousGateOff: number, time: number, glide: number): SynthTriggerPlan {
  const legato = previousGateOff >= time - 0.001 && previousGateOff > 0;
  return {
    legato,
    retrigger: !legato,
    glideSeconds: legato ? 0.003 + (clamp(glide, 0, 100) / 100) ** 2 * 0.22 : 0,
  };
}

export function createSynthSaturationCurve(length = 2_048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
  const drive = 1.7;
  const normalization = Math.tanh(drive);
  for (let index = 0; index < length; index += 1) {
    const input = index / (length - 1) * 2 - 1;
    curve[index] = Math.tanh(input * drive) / normalization;
  }
  return curve;
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

export class SynthVoice {
  readonly maxVoiceCount = 1;
  readonly #context: BaseAudioContext;
  readonly #oscillators: readonly OscillatorNode[];
  readonly #waveGains: readonly GainNode[];
  readonly #secondary: OscillatorNode;
  readonly #secondaryGain: GainNode;
  readonly #oscillatorBus: GainNode;
  readonly #filter: BiquadFilterNode;
  readonly #saturation: WaveShaperNode;
  readonly #dcBlocker: BiquadFilterNode;
  readonly #amplitude: GainNode;
  #sound: Readonly<SoundState>;
  #gateOffTime = 0;
  #noteOffTime = 0;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    const frequency = 220;
    const wave = Math.round(sound.params.wave ?? 1);
    this.#oscillatorBus = new GainNode(context, { gain: 0.42 });
    this.#waveGains = WAVEFORMS.map((_, index) => new GainNode(context, { gain: index === wave ? 1 : 0 }));
    this.#oscillators = WAVEFORMS.map((type, index) => {
      const oscillator = new OscillatorNode(context, { type, frequency });
      oscillator.connect(this.#waveGains[index]!).connect(this.#oscillatorBus);
      oscillator.start();
      return oscillator;
    });
    this.#secondary = new OscillatorNode(context, { type: 'sawtooth', frequency, detune: 4 });
    this.#secondaryGain = new GainNode(context, { gain: (sound.params.shape ?? 35) / 100 * 0.48 });
    this.#secondary.connect(this.#secondaryGain).connect(this.#oscillatorBus);
    this.#secondary.start();
    this.#filter = new BiquadFilterNode(context, {
      type: 'lowpass',
      frequency: synthCutoffHz(sound.params.cutoff ?? 62),
      Q: 0.7 + (sound.params.resonance ?? 24) / 100 * 12,
    });
    this.#saturation = new WaveShaperNode(context, { curve: createSynthSaturationCurve(), oversample: 'none' });
    this.#dcBlocker = new BiquadFilterNode(context, { type: 'highpass', frequency: 18, Q: 0.707 });
    this.#amplitude = new GainNode(context, { gain: 0 });
    this.#oscillatorBus.connect(this.#filter).connect(this.#saturation).connect(this.#dcBlocker).connect(this.#amplitude).connect(destination);
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const frequency = frequencyForSynthMidi(event.pitch);
    const plan = planSynthTrigger(this.#gateOffTime, time, this.#sound.params.glide ?? 12);
    for (const oscillator of this.#oscillators) {
      hold(oscillator.frequency, time);
      if (plan.legato) oscillator.frequency.exponentialRampToValueAtTime(frequency, time + plan.glideSeconds);
      else oscillator.frequency.setValueAtTime(frequency, time);
    }
    const shape = clamp(this.#sound.params.shape ?? 35, 0, 100) / 100;
    const secondaryFrequency = frequency * (1 + shape * 0.006);
    hold(this.#secondary.frequency, time);
    if (plan.legato) this.#secondary.frequency.exponentialRampToValueAtTime(secondaryFrequency, time + plan.glideSeconds);
    else this.#secondary.frequency.setValueAtTime(secondaryFrequency, time);

    const velocity = clamp(event.velocity / 127, 0.02, 1);
    const peak = synthVelocityGain(event.velocity);
    const attack = synthAttackSeconds(this.#sound.params.attack ?? 8);
    const release = synthReleaseSeconds(this.#sound.params.release ?? 38);
    const noteEnd = time + Math.max(0.015, duration);
    hold(this.#amplitude.gain, time);
    if (plan.retrigger) this.#amplitude.gain.setValueAtTime(MIN_GAIN, time);
    this.#amplitude.gain.linearRampToValueAtTime(peak, time + (plan.legato ? Math.min(0.018, attack) : attack));
    this.#amplitude.gain.setTargetAtTime(MIN_GAIN, noteEnd, Math.max(0.006, release / 4.6));

    const baseCutoff = synthCutoffHz(this.#sound.params.cutoff ?? 62);
    const envelope = clamp(this.#sound.params.envelope ?? 52, 0, 100) / 100;
    const peakCutoff = Math.min(18_000, baseCutoff * (1 + envelope * (2.5 + velocity * 6.5)));
    hold(this.#filter.frequency, time);
    if (plan.retrigger) this.#filter.frequency.setValueAtTime(baseCutoff, time);
    this.#filter.frequency.exponentialRampToValueAtTime(Math.max(baseCutoff, peakCutoff), time + Math.max(0.004, attack * 0.75));
    this.#filter.frequency.exponentialRampToValueAtTime(baseCutoff, time + Math.max(0.06, duration * 0.48));
    this.#gateOffTime = noteEnd;
    this.#noteOffTime = noteEnd + release;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    const selectedWave = clamp(Math.round(sound.params.wave ?? 1), 0, WAVEFORMS.length - 1);
    const set = (param: AudioParam, value: number, duration = 0.02): void => {
      if (smooth) ramp(param, value, time, duration);
      else param.setValueAtTime(value, time);
    };
    for (let index = 0; index < this.#waveGains.length; index += 1) {
      set(this.#waveGains[index]!.gain, index === selectedWave ? 1 : 0, 0.012);
    }
    const shape = clamp(sound.params.shape ?? 35, 0, 100) / 100;
    set(this.#secondaryGain.gain, shape * 0.48);
    set(this.#secondary.detune, 3 + shape * 16);
    set(this.#filter.frequency, synthCutoffHz(sound.params.cutoff ?? 62));
    set(this.#filter.Q, 0.7 + (sound.params.resonance ?? 24) / 100 * 12);
  }

  panic(time: number): void {
    hold(this.#amplitude.gain, time);
    this.#amplitude.gain.linearRampToValueAtTime(0, time + 0.005);
    this.#gateOffTime = time;
    this.#noteOffTime = time;
  }

  dispose(time: number): void {
    this.panic(time);
    for (const oscillator of [...this.#oscillators, this.#secondary]) {
      try { oscillator.stop(time + 0.006); } catch { /* Oscillator may already be stopped. */ }
      oscillator.disconnect();
    }
    for (const node of [
      ...this.#waveGains, this.#secondaryGain, this.#oscillatorBus, this.#filter,
      this.#saturation, this.#dcBlocker, this.#amplitude,
    ]) node.disconnect();
  }

  get activeVoiceCount(): number {
    return this.#noteOffTime > this.#context.currentTime ? 1 : 0;
  }
}
