import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const WAVEFORMS = ['sine', 'square', 'sawtooth'] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function frequencyForBassMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function bassVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.02, 1);
  return 0.12 + normalized ** 1.45 * 0.76;
}

export function bassCutoffHz(cutoff: number): number {
  return 48 * 2 ** (clamp(cutoff, 0, 100) / 100 * 8.1);
}

export function createBassDriveCurve(length = 2_048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
  const drive = 7.5;
  const normalization = Math.tanh(drive);
  for (let index = 0; index < length; index += 1) {
    const input = index / (length - 1) * 2 - 1;
    const asymmetric = input >= 0 ? input : input * 0.92;
    curve[index] = Math.tanh(asymmetric * drive) / normalization;
  }
  return curve;
}

export interface BassTriggerPlan {
  legato: boolean;
  retrigger: boolean;
  glideSeconds: number;
}

export function planBassTrigger(previousNoteOff: number, time: number, glide: number): BassTriggerPlan {
  const legato = previousNoteOff > time + 0.000_5;
  return {
    legato,
    retrigger: !legato,
    glideSeconds: legato ? 0.002 + (clamp(glide, 0, 100) / 100) ** 2 * 0.18 : 0,
  };
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

export class BassVoice {
  readonly maxVoiceCount = 1;
  readonly #context: BaseAudioContext;
  readonly #oscillators: readonly OscillatorNode[];
  readonly #waveGains: readonly GainNode[];
  readonly #subOscillator: OscillatorNode;
  readonly #subGain: GainNode;
  readonly #oscillatorBus: GainNode;
  readonly #filter: BiquadFilterNode;
  readonly #dryGain: GainNode;
  readonly #driveShaper: WaveShaperNode;
  readonly #driveGain: GainNode;
  readonly #driveBus: GainNode;
  readonly #dcBlocker: BiquadFilterNode;
  readonly #amplitude: GainNode;
  #sound: Readonly<SoundState>;
  #gateOffTime = 0;
  #noteOffTime = 0;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    const frequency = 55;
    const wave = Math.round(sound.params.wave ?? 1);
    this.#oscillatorBus = new GainNode(context, { gain: 0.54 });
    this.#waveGains = WAVEFORMS.map((_, index) => new GainNode(context, { gain: index === wave ? 1 : 0 }));
    this.#oscillators = WAVEFORMS.map((type, index) => {
      const oscillator = new OscillatorNode(context, { type, frequency });
      oscillator.connect(this.#waveGains[index]!).connect(this.#oscillatorBus);
      oscillator.start();
      return oscillator;
    });
    this.#subOscillator = new OscillatorNode(context, { type: 'sine', frequency: frequency / 2 });
    this.#subGain = new GainNode(context, { gain: (sound.params.sub ?? 35) / 100 * 0.72 });
    this.#subOscillator.connect(this.#subGain).connect(this.#oscillatorBus);
    this.#subOscillator.start();

    this.#filter = new BiquadFilterNode(context, {
      type: 'lowpass',
      frequency: bassCutoffHz(sound.params.cutoff ?? 58),
      Q: 0.7 + (sound.params.resonance ?? 18) / 100 * 13,
    });
    this.#dryGain = new GainNode(context, { gain: 1 });
    this.#driveShaper = new WaveShaperNode(context, { curve: createBassDriveCurve(), oversample: 'none' });
    this.#driveGain = new GainNode(context, { gain: 0 });
    this.#driveBus = new GainNode(context, { gain: 1 });
    this.#dcBlocker = new BiquadFilterNode(context, { type: 'highpass', frequency: 18, Q: 0.707 });
    this.#amplitude = new GainNode(context, { gain: 0 });

    this.#oscillatorBus.connect(this.#filter);
    this.#filter.connect(this.#dryGain).connect(this.#driveBus);
    this.#filter.connect(this.#driveShaper).connect(this.#driveGain).connect(this.#driveBus);
    this.#driveBus.connect(this.#dcBlocker).connect(this.#amplitude).connect(destination);
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const frequency = frequencyForBassMidi(event.pitch);
    const plan = planBassTrigger(this.#gateOffTime, time, this.#sound.params.glide ?? 12);
    for (const oscillator of this.#oscillators) {
      hold(oscillator.frequency, time);
      if (plan.legato) oscillator.frequency.exponentialRampToValueAtTime(frequency, time + plan.glideSeconds);
      else oscillator.frequency.setValueAtTime(frequency, time);
    }
    const subFrequency = Math.max(22, frequency / 2);
    hold(this.#subOscillator.frequency, time);
    if (plan.legato) this.#subOscillator.frequency.exponentialRampToValueAtTime(subFrequency, time + plan.glideSeconds);
    else this.#subOscillator.frequency.setValueAtTime(subFrequency, time);

    const velocity = clamp(event.velocity / 127, 0.02, 1);
    const peakGain = bassVelocityGain(event.velocity);
    const noteEnd = time + Math.max(0.015, duration);
    const releaseEnd = noteEnd + 0.055;
    hold(this.#amplitude.gain, time);
    if (plan.retrigger) this.#amplitude.gain.setValueAtTime(MIN_GAIN, time);
    this.#amplitude.gain.linearRampToValueAtTime(peakGain, time + (plan.retrigger ? 0.006 : 0.012));
    this.#amplitude.gain.setTargetAtTime(MIN_GAIN, noteEnd, 0.014);

    const baseCutoff = bassCutoffHz(this.#sound.params.cutoff ?? 58);
    const envelopeAmount = (this.#sound.params.envelope ?? 46) / 100;
    const peakCutoff = Math.min(18_000, baseCutoff * (1 + envelopeAmount * (3 + velocity * 8)));
    hold(this.#filter.frequency, time);
    if (plan.retrigger) this.#filter.frequency.setValueAtTime(baseCutoff, time);
    this.#filter.frequency.exponentialRampToValueAtTime(Math.max(baseCutoff, peakCutoff), time + (plan.retrigger ? 0.008 : 0.018));
    this.#filter.frequency.exponentialRampToValueAtTime(baseCutoff, time + 0.07 + envelopeAmount * 0.38);
    this.#gateOffTime = noteEnd;
    this.#noteOffTime = releaseEnd;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    const duration = smooth ? 0.02 : 0;
    const selectedWave = clamp(Math.round(sound.params.wave ?? 1), 0, WAVEFORMS.length - 1);
    for (let index = 0; index < this.#waveGains.length; index += 1) {
      const value = index === selectedWave ? 1 : 0;
      if (smooth) ramp(this.#waveGains[index]!.gain, value, time, 0.012);
      else this.#waveGains[index]!.gain.setValueAtTime(value, time);
    }
    const set = (param: AudioParam, value: number): void => {
      if (smooth) ramp(param, value, time, duration);
      else param.setValueAtTime(value, time);
    };
    set(this.#subGain.gain, (sound.params.sub ?? 35) / 100 * 0.72);
    set(this.#filter.frequency, bassCutoffHz(sound.params.cutoff ?? 58));
    set(this.#filter.Q, 0.7 + (sound.params.resonance ?? 18) / 100 * 13);
    const drive = clamp(sound.params.drive ?? 0, 0, 100) / 100;
    set(this.#dryGain.gain, Math.cos(drive * Math.PI / 2));
    set(this.#driveGain.gain, Math.sin(drive * Math.PI / 2));
    set(this.#driveBus.gain, 1 / (1 + drive * 0.48));
  }

  panic(time: number): void {
    hold(this.#amplitude.gain, time);
    this.#amplitude.gain.linearRampToValueAtTime(0, time + 0.005);
    this.#gateOffTime = time;
    this.#noteOffTime = time;
  }

  dispose(time: number): void {
    this.panic(time);
    for (const oscillator of this.#oscillators) {
      try { oscillator.stop(time + 0.006); } catch { /* Oscillator may already be stopped. */ }
      oscillator.disconnect();
    }
    try { this.#subOscillator.stop(time + 0.006); } catch { /* Oscillator may already be stopped. */ }
    for (const node of [
      ...this.#waveGains, this.#subOscillator, this.#subGain, this.#oscillatorBus, this.#filter,
      this.#dryGain, this.#driveShaper, this.#driveGain, this.#driveBus, this.#dcBlocker, this.#amplitude,
    ]) node.disconnect();
  }

  get activeVoiceCount(): number {
    return this.#noteOffTime > this.#context.currentTime ? 1 : 0;
  }
}
