import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const SLOT_PAN = [-0.36, 0.36, -0.12, 0.12] as const;
const SLOT_DETUNE = [-2.4, 2.4, -0.8, 0.8] as const;

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

export function frequencyForArpMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function arpVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.01, 1);
  return 0.08 + normalized ** 1.5 * 0.36;
}

export function arpDecaySeconds(decay: number): number {
  return 0.035 + (clamp(decay, 0, 100) / 100) ** 2 * 0.82;
}

export function arpCutoffHz(tone: number): number {
  return Math.min(14_000, 240 * 2 ** (clamp(tone, 0, 100) / 100 * 5.9));
}

export function arpReleaseEndOffset(duration: number, decay: number): number {
  return Math.max(0.008, duration) + Math.min(0.08, 0.018 + arpDecaySeconds(decay) * 0.08);
}

export interface ArpVoiceSlotState {
  startedAt: number;
  releaseEnd: number;
}

export function selectArpVoiceSlot(slots: readonly ArpVoiceSlotState[], time: number): number {
  let selected = 0;
  for (let index = 1; index < slots.length; index += 1) {
    const selectedFree = slots[selected]!.releaseEnd <= time;
    const candidateFree = slots[index]!.releaseEnd <= time;
    if ((candidateFree && !selectedFree)
      || (candidateFree === selectedFree && slots[index]!.releaseEnd < slots[selected]!.releaseEnd)
      || (candidateFree === selectedFree && slots[index]!.releaseEnd === slots[selected]!.releaseEnd && slots[index]!.startedAt < slots[selected]!.startedAt)) selected = index;
  }
  return selected;
}

interface ArpVoiceSlot extends ArpVoiceSlotState {
  oscillatorA: OscillatorNode;
  oscillatorB: OscillatorNode;
  oscillatorAGain: GainNode;
  oscillatorBGain: GainNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  panner: StereoPannerNode;
}

export class ArpVoice {
  readonly #context: BaseAudioContext;
  readonly #slots: ArpVoiceSlot[];
  #sound: Readonly<SoundState>;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#slots = Array.from({ length: 4 }, (_, index) => {
      const oscillatorA = new OscillatorNode(context, { type: 'triangle', frequency: 220, detune: SLOT_DETUNE[index]! });
      const oscillatorB = new OscillatorNode(context, { type: 'square', frequency: 220, detune: -SLOT_DETUNE[index]! * 0.6 });
      const oscillatorAGain = new GainNode(context, { gain: 0.8 });
      const oscillatorBGain = new GainNode(context, { gain: 0.12 });
      const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: arpCutoffHz(sound.params.tone ?? 52), Q: 0.85 });
      const envelope = new GainNode(context, { gain: 0 });
      const panner = new StereoPannerNode(context, { pan: SLOT_PAN[index]! });
      oscillatorA.connect(oscillatorAGain).connect(filter);
      oscillatorB.connect(oscillatorBGain).connect(filter);
      filter.connect(envelope).connect(panner).connect(destination);
      oscillatorA.start();
      oscillatorB.start();
      return { oscillatorA, oscillatorB, oscillatorAGain, oscillatorBGain, filter, envelope, panner, startedAt: Number.NEGATIVE_INFINITY, releaseEnd: 0 };
    });
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const slot = this.#slots[selectArpVoiceSlot(this.#slots, time)]!;
    const wasActive = slot.releaseEnd > time;
    const start = time + (wasActive ? 0.0025 : 0);
    const frequency = frequencyForArpMidi(event.pitch);
    const velocity = clamp(event.velocity / 127, 0.01, 1);
    const peak = arpVelocityGain(event.velocity);
    const decay = arpDecaySeconds(this.#sound.params.decay ?? 42);
    const gateEnd = Math.max(start + 0.008, time + Math.max(0.008, duration));
    const releaseEnd = time + arpReleaseEndOffset(duration, this.#sound.params.decay ?? 42);

    hold(slot.envelope.gain, time);
    if (wasActive) slot.envelope.gain.linearRampToValueAtTime(MIN_GAIN, start);
    else slot.envelope.gain.setValueAtTime(MIN_GAIN, start);
    slot.oscillatorA.frequency.setValueAtTime(frequency, start);
    slot.oscillatorB.frequency.setValueAtTime(frequency, start);
    slot.envelope.gain.linearRampToValueAtTime(peak, start + 0.0022);
    const decayEnd = Math.min(gateEnd, start + decay);
    slot.envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak * 0.12), Math.max(start + 0.0032, decayEnd));
    slot.envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);

    const baseCutoff = arpCutoffHz(this.#sound.params.tone ?? 52);
    const brightness = clamp(this.#sound.params.brightness ?? 58, 0, 100) / 100;
    const peakCutoff = Math.min(18_000, baseCutoff * (1.2 + brightness * (2.5 + velocity * 4.5)));
    hold(slot.filter.frequency, start);
    slot.filter.frequency.setValueAtTime(Math.max(80, baseCutoff * 0.72), start);
    slot.filter.frequency.exponentialRampToValueAtTime(peakCutoff, start + 0.0025);
    slot.filter.frequency.exponentialRampToValueAtTime(baseCutoff, Math.max(start + 0.004, Math.min(gateEnd, start + decay * 0.72)));

    slot.startedAt = start;
    slot.releaseEnd = releaseEnd;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    const character = clamp(sound.params.character ?? 22, 0, 100) / 100;
    const brightness = clamp(sound.params.brightness ?? 58, 0, 100) / 100;
    const set = (param: AudioParam, value: number): void => {
      if (smooth) ramp(param, value, time, 0.015);
      else param.setValueAtTime(value, time);
    };
    for (const slot of this.#slots) {
      set(slot.oscillatorAGain.gain, 0.82 - character * 0.28);
      set(slot.oscillatorBGain.gain, 0.025 + character ** 1.35 * 0.34);
      set(slot.filter.frequency, arpCutoffHz(sound.params.tone ?? 52));
      set(slot.filter.Q, 0.65 + brightness * 2.2);
    }
  }

  panic(time: number): void {
    for (const slot of this.#slots) {
      hold(slot.envelope.gain, time);
      slot.envelope.gain.linearRampToValueAtTime(0, time + 0.004);
      slot.startedAt = time;
      slot.releaseEnd = time;
    }
  }

  dispose(time: number): void {
    this.panic(time);
    for (const slot of this.#slots) {
      try { slot.oscillatorA.stop(time + 0.005); } catch { /* Oscillator may already be stopped. */ }
      try { slot.oscillatorB.stop(time + 0.005); } catch { /* Oscillator may already be stopped. */ }
      for (const node of [slot.oscillatorA, slot.oscillatorB, slot.oscillatorAGain, slot.oscillatorBGain, slot.filter, slot.envelope, slot.panner]) node.disconnect();
    }
  }

  get activeVoiceCount(): number {
    return this.#slots.filter((slot) => slot.releaseEnd > this.#context.currentTime).length;
  }
}
