import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const SLOT_PAN = [-0.42, 0.42, -0.3, 0.3, -0.18, 0.18, -0.06, 0.06] as const;
const SLOT_DETUNE = [-1.8, 1.8, -1.2, 1.2, -0.7, 0.7, -0.25, 0.25] as const;

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

export function frequencyForPianoMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function pianoVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.01, 1);
  return 0.045 + normalized ** 1.45 * 0.225;
}

export function pianoDecaySeconds(decay: number): number {
  return 0.28 + (clamp(decay, 0, 100) / 100) ** 1.7 * 1.82;
}

export function pianoToneCutoffHz(tone: number): number {
  return Math.min(15_000, 520 * 2 ** (clamp(tone, 0, 100) / 100 * 4.85));
}

export function pianoModulationDepthHz(frequency: number, bell: number, velocity: number): number {
  const bellAmount = clamp(bell, 0, 100) / 100;
  const velocityAmount = clamp(velocity / 127, 0.01, 1);
  return Math.min(12_000, Math.max(0, frequency) * (0.035 + bellAmount ** 1.35 * 1.05) * (0.42 + velocityAmount * 0.78));
}

export interface PianoVoiceSlotState {
  startedAt: number;
  releaseEnd: number;
}

export function selectPianoVoiceSlot(slots: readonly PianoVoiceSlotState[], time: number): number {
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

interface PianoVoiceSlot extends PianoVoiceSlotState {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modulatorGain: GainNode;
  partial: OscillatorNode;
  partialGain: GainNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  panner: StereoPannerNode;
}

export class PianoVoice {
  readonly #context: BaseAudioContext;
  readonly #slots: PianoVoiceSlot[];
  readonly #outputBus: GainNode;
  readonly #tremoloLfo: OscillatorNode;
  readonly #tremoloDepth: GainNode;
  #sound: Readonly<SoundState>;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#outputBus = new GainNode(context, { gain: 0.72 });
    this.#tremoloLfo = new OscillatorNode(context, { type: 'sine', frequency: 4.8 });
    this.#tremoloDepth = new GainNode(context, { gain: 0 });
    this.#outputBus.connect(destination);
    this.#tremoloLfo.connect(this.#tremoloDepth).connect(this.#outputBus.gain);
    this.#tremoloLfo.start();

    this.#slots = Array.from({ length: 8 }, (_, index) => {
      const carrier = new OscillatorNode(context, { type: 'sine', frequency: 220, detune: SLOT_DETUNE[index]! });
      const modulator = new OscillatorNode(context, { type: 'sine', frequency: 660, detune: -SLOT_DETUNE[index]! * 0.4 });
      const modulatorGain = new GainNode(context, { gain: 0 });
      const partial = new OscillatorNode(context, { type: 'sine', frequency: 440, detune: SLOT_DETUNE[index]! * 0.65 });
      const partialGain = new GainNode(context, { gain: 0.05 });
      const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: pianoToneCutoffHz(sound.params.tone ?? 52), Q: 0.72 });
      const envelope = new GainNode(context, { gain: 0 });
      const panner = new StereoPannerNode(context, { pan: SLOT_PAN[index]! });
      modulator.connect(modulatorGain).connect(carrier.frequency);
      carrier.connect(filter);
      partial.connect(partialGain).connect(filter);
      filter.connect(envelope).connect(panner).connect(this.#outputBus);
      carrier.start();
      modulator.start();
      partial.start();
      return { carrier, modulator, modulatorGain, partial, partialGain, filter, envelope, panner, startedAt: Number.NEGATIVE_INFINITY, releaseEnd: 0 };
    });
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, _duration: number): void {
    const slot = this.#slots[selectPianoVoiceSlot(this.#slots, time)]!;
    const wasActive = slot.releaseEnd > time;
    const start = time + (wasActive ? 0.004 : 0);
    const frequency = frequencyForPianoMidi(event.pitch);
    const velocity = clamp(event.velocity / 127, 0.01, 1);
    const bell = clamp(this.#sound.params.bell ?? 34, 0, 100) / 100;
    const decay = pianoDecaySeconds(this.#sound.params.decay ?? 58);
    const releaseEnd = start + decay;
    const peak = pianoVelocityGain(event.velocity);
    const baseCutoff = pianoToneCutoffHz(this.#sound.params.tone ?? 52);
    const attackCutoff = Math.min(18_000, baseCutoff * (1.05 + velocity * (0.65 + bell * 2.4)));
    const modulationDepth = pianoModulationDepthHz(frequency, this.#sound.params.bell ?? 34, event.velocity);

    hold(slot.envelope.gain, time);
    if (wasActive) slot.envelope.gain.linearRampToValueAtTime(MIN_GAIN, start);
    else slot.envelope.gain.setValueAtTime(MIN_GAIN, start);
    slot.carrier.frequency.setValueAtTime(frequency, start);
    slot.modulator.frequency.setValueAtTime(frequency * 3.01, start);
    slot.partial.frequency.setValueAtTime(frequency * 2.005, start);
    slot.envelope.gain.linearRampToValueAtTime(peak, start + 0.003);
    slot.envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak * (0.16 + (1 - bell) * 0.1)), start + decay * 0.34);
    slot.envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);

    hold(slot.modulatorGain.gain, start);
    slot.modulatorGain.gain.setValueAtTime(modulationDepth, start);
    slot.modulatorGain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, modulationDepth * 0.055), start + Math.min(0.42, decay * 0.38));
    slot.modulatorGain.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);
    slot.partialGain.gain.setValueAtTime(0.018 + bell * (0.08 + velocity * 0.14), start);

    hold(slot.filter.frequency, start);
    slot.filter.frequency.setValueAtTime(attackCutoff, start);
    slot.filter.frequency.exponentialRampToValueAtTime(baseCutoff, start + Math.min(0.36, decay * 0.4));

    slot.startedAt = start;
    slot.releaseEnd = releaseEnd;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    const tremolo = clamp(sound.params.tremolo ?? 12, 0, 100) / 100;
    const set = (param: AudioParam, value: number, duration = 0.02): void => {
      if (smooth) ramp(param, value, time, duration);
      else param.setValueAtTime(value, time);
    };
    for (const slot of this.#slots) {
      set(slot.filter.frequency, pianoToneCutoffHz(sound.params.tone ?? 52));
      set(slot.filter.Q, 0.62 + clamp(sound.params.bell ?? 34, 0, 100) / 100 * 1.15);
    }
    set(this.#outputBus.gain, 0.72);
    set(this.#tremoloLfo.frequency, 4.1 + tremolo * 2.8, 0.04);
    set(this.#tremoloDepth.gain, tremolo * 0.28, 0.04);
  }

  panic(time: number): void {
    for (const slot of this.#slots) {
      hold(slot.envelope.gain, time);
      slot.envelope.gain.linearRampToValueAtTime(0, time + 0.006);
      hold(slot.modulatorGain.gain, time);
      slot.modulatorGain.gain.linearRampToValueAtTime(0, time + 0.006);
      slot.startedAt = time;
      slot.releaseEnd = time;
    }
  }

  dispose(time: number): void {
    this.panic(time);
    for (const slot of this.#slots) {
      try { slot.carrier.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
      try { slot.modulator.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
      try { slot.partial.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
      for (const node of [slot.carrier, slot.modulator, slot.modulatorGain, slot.partial, slot.partialGain, slot.filter, slot.envelope, slot.panner]) node.disconnect();
    }
    try { this.#tremoloLfo.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
    for (const node of [this.#outputBus, this.#tremoloLfo, this.#tremoloDepth]) node.disconnect();
  }

  get activeVoiceCount(): number {
    return this.#slots.filter((slot) => slot.releaseEnd > this.#context.currentTime).length;
  }
}
