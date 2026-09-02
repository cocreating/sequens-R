import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const SLOT_PAN = [-0.72, 0.72, -0.34, 0.34] as const;
const SLOT_DETUNE = [-4.8, 4.1, -2.2, 2.7] as const;
const BODY_RATIOS = [1, 1.004, 2.006, 3.008] as const;
const BODY_LEVELS = [0.02, 0.2, 0.14, 0.11] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hold(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
}

function ramp(param: AudioParam, value: number, time: number, duration = 0.04): void {
  hold(param, time);
  param.linearRampToValueAtTime(value, time + duration);
}

export function frequencyForDroneMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function droneCutoffHz(tone: number): number {
  return Math.min(14_000, 120 * 2 ** (clamp(tone, 0, 100) / 100 * 6.7));
}

export function droneAttackSeconds(attack: number): number {
  return 0.08 + (clamp(attack, 0, 100) / 100) ** 2 * 5.92;
}

export function droneReleaseSeconds(release: number): number {
  return 0.4 + (clamp(release, 0, 100) / 100) ** 2 * 9.6;
}

export function droneMotionSeconds(motion: number): number {
  return 0.06 + (clamp(motion, 0, 100) / 100) ** 2 * 3.94;
}

export function droneVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.01, 1);
  return 0.055 + normalized ** 1.35 * 0.15;
}

export function droneHarmonicRatio(body: number): number {
  return BODY_RATIOS[clamp(Math.round(body), 0, BODY_RATIOS.length - 1)]!;
}

function createNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate)), context.sampleRate);
  const channel = buffer.getChannelData(0);
  let state = 0x6d2b79f5;
  let previous = 0;
  for (let index = 0; index < channel.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const white = (state >>> 0) / 0xffff_ffff * 2 - 1;
    previous = previous * 0.86 + white * 0.14;
    channel[index] = previous * 0.62;
  }
  return buffer;
}

interface DroneVoiceSlot {
  primary: OscillatorNode;
  secondary: OscillatorNode;
  primaryGain: GainNode;
  secondaryGain: GainNode;
  mix: GainNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  panner: StereoPannerNode;
  panMotionDepth: GainNode;
  frequency: number;
  releaseEnd: number;
}

export class DroneVoice {
  readonly maxVoiceCount = 4;
  readonly #context: BaseAudioContext;
  readonly #slots: DroneVoiceSlot[];
  readonly #filterMotion: OscillatorNode;
  readonly #filterMotionDepth: GainNode;
  readonly #panMotion: OscillatorNode;
  readonly #airSource: AudioBufferSourceNode;
  readonly #airFilter: BiquadFilterNode;
  readonly #airGain: GainNode;
  readonly #output: GainNode;
  readonly #dcBlocker: BiquadFilterNode;
  #sound: Readonly<SoundState>;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#output = new GainNode(context, { gain: 0.82 });
    this.#dcBlocker = new BiquadFilterNode(context, { type: 'highpass', frequency: 18, Q: 0.707 });
    this.#output.connect(this.#dcBlocker).connect(destination);

    this.#filterMotion = new OscillatorNode(context, { type: 'sine', frequency: 0.032 });
    this.#filterMotionDepth = new GainNode(context, { gain: 0 });
    this.#filterMotion.connect(this.#filterMotionDepth);
    this.#filterMotion.start();
    this.#panMotion = new OscillatorNode(context, { type: 'sine', frequency: 0.021 });
    this.#panMotion.start();

    this.#airSource = new AudioBufferSourceNode(context, { buffer: createNoiseBuffer(context), loop: true });
    this.#airFilter = new BiquadFilterNode(context, { type: 'bandpass', frequency: 3_200, Q: 0.52 });
    this.#airGain = new GainNode(context, { gain: 0 });
    this.#airSource.connect(this.#airFilter).connect(this.#airGain);
    this.#airSource.start();

    const body = Math.round(sound.params.body ?? 1);
    const ratio = droneHarmonicRatio(body);
    this.#slots = SLOT_PAN.map((_, index) => {
      const frequency = 110;
      const primary = new OscillatorNode(context, { type: 'triangle', frequency, detune: SLOT_DETUNE[index]! });
      const secondary = new OscillatorNode(context, { type: 'sine', frequency: frequency * ratio, detune: -SLOT_DETUNE[index]! * 0.6 });
      const primaryGain = new GainNode(context, { gain: 0.92 });
      const secondaryGain = new GainNode(context, { gain: 0 });
      const mix = new GainNode(context, { gain: 0.72 });
      const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: droneCutoffHz(sound.params.tone ?? 38), Q: 0.72 });
      const envelope = new GainNode(context, { gain: 0 });
      const panner = new StereoPannerNode(context, { pan: 0 });
      const panMotionDepth = new GainNode(context, { gain: 0 });
      primary.connect(primaryGain).connect(mix);
      secondary.connect(secondaryGain).connect(mix);
      this.#airGain.connect(mix);
      mix.connect(filter).connect(envelope).connect(panner).connect(this.#output);
      this.#filterMotionDepth.connect(filter.detune);
      this.#panMotion.connect(panMotionDepth).connect(panner.pan);
      primary.start();
      secondary.start();
      return {
        primary,
        secondary,
        primaryGain,
        secondaryGain,
        mix,
        filter,
        envelope,
        panner,
        panMotionDepth,
        frequency,
        releaseEnd: 0,
      };
    });
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const lane = clamp(Math.round(event.lane ?? 0), 0, this.#slots.length - 1);
    const slot = this.#slots[lane]!;
    const frequency = frequencyForDroneMidi(event.pitch);
    const ratio = droneHarmonicRatio(this.#sound.params.body ?? 1);
    const active = slot.releaseEnd >= time - 0.002;
    const motion = droneMotionSeconds(this.#sound.params.motion ?? 35);
    const transition = active ? motion : 0;

    hold(slot.primary.frequency, time);
    hold(slot.secondary.frequency, time);
    if (active) {
      slot.primary.frequency.exponentialRampToValueAtTime(frequency, time + transition);
      slot.secondary.frequency.exponentialRampToValueAtTime(frequency * ratio, time + transition);
    } else {
      slot.primary.frequency.setValueAtTime(frequency, time);
      slot.secondary.frequency.setValueAtTime(frequency * ratio, time);
    }
    slot.frequency = frequency;

    const peak = droneVelocityGain(event.velocity);
    const attack = droneAttackSeconds(this.#sound.params.attack ?? 45);
    const release = droneReleaseSeconds(this.#sound.params.release ?? 70);
    const noteEnd = time + Math.max(0.05, duration);
    hold(slot.envelope.gain, time);
    if (!active) slot.envelope.gain.setValueAtTime(MIN_GAIN, time);
    slot.envelope.gain.linearRampToValueAtTime(peak, time + (active ? Math.min(0.5, transition) : attack));
    slot.envelope.gain.setTargetAtTime(MIN_GAIN, noteEnd, Math.max(0.06, release / 4.6));
    slot.releaseEnd = noteEnd + release;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    const body = clamp(Math.round(sound.params.body ?? 1), 0, BODY_LEVELS.length - 1);
    const tone = clamp(sound.params.tone ?? 38, 0, 100);
    const motion = clamp(sound.params.motion ?? 35, 0, 100) / 100;
    const air = clamp(sound.params.air ?? 12, 0, 100) / 100;
    const shimmer = clamp(sound.params.shimmer ?? 28, 0, 100) / 100;
    const width = clamp(sound.params.width ?? 70, 0, 100) / 100;
    const ratio = droneHarmonicRatio(body);
    const set = (param: AudioParam, value: number, duration = 0.04): void => {
      if (smooth) ramp(param, value, time, duration);
      else param.setValueAtTime(value, time);
    };

    set(this.#filterMotion.frequency, 0.012 + motion ** 1.3 * 0.075, 0.08);
    set(this.#filterMotionDepth.gain, motion * 185, 0.1);
    set(this.#panMotion.frequency, 0.009 + motion * 0.038, 0.08);
    set(this.#airGain.gain, air * 0.02, 0.08);
    set(this.#airFilter.frequency, 1_600 + tone / 100 * 6_800, 0.08);

    for (let index = 0; index < this.#slots.length; index += 1) {
      const slot = this.#slots[index]!;
      set(slot.secondaryGain.gain, BODY_LEVELS[body]! + shimmer * (body === 3 ? 0.24 : 0.15), 0.08);
      set(slot.secondary.frequency, slot.frequency * ratio, 0.1);
      set(slot.filter.frequency, droneCutoffHz(tone), 0.08);
      set(slot.filter.Q, 0.62 + shimmer * 1.3, 0.08);
      set(slot.panner.pan, SLOT_PAN[index]! * width, 0.08);
      set(slot.panMotionDepth.gain, (index % 2 === 0 ? 1 : -1) * motion * width * 0.16, 0.1);
    }
  }

  panic(time: number): void {
    for (const slot of this.#slots) {
      hold(slot.envelope.gain, time);
      slot.envelope.gain.linearRampToValueAtTime(0, time + 0.012);
      slot.releaseEnd = time;
    }
  }

  dispose(time: number): void {
    this.panic(time);
    for (const slot of this.#slots) {
      for (const oscillator of [slot.primary, slot.secondary]) {
        try { oscillator.stop(time + 0.014); } catch { /* Oscillator may already be stopped. */ }
      }
      for (const node of [
        slot.primary, slot.secondary, slot.primaryGain, slot.secondaryGain, slot.mix,
        slot.filter, slot.envelope, slot.panner, slot.panMotionDepth,
      ]) node.disconnect();
    }
    for (const oscillator of [this.#filterMotion, this.#panMotion, this.#airSource]) {
      try { oscillator.stop(time + 0.014); } catch { /* Source may already be stopped. */ }
    }
    for (const node of [
      this.#filterMotion, this.#filterMotionDepth, this.#panMotion, this.#airSource,
      this.#airFilter, this.#airGain, this.#output, this.#dcBlocker,
    ]) node.disconnect();
  }

  get activeVoiceCount(): number {
    return this.#slots.filter((slot) => slot.releaseEnd > this.#context.currentTime).length;
  }
}
