import type { NoteEvent } from '../../core/pattern';
import type { SoundState } from '../sound';

const MIN_GAIN = 0.0001;
const SLOT_PAN = [-0.82, 0.82, -0.56, 0.56, -0.3, 0.3, -0.08, 0.08] as const;
const SLOT_DETUNE = [-4.5, 4.5, -3.1, 3.1, -1.8, 1.8, -0.7, 0.7] as const;

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

export function frequencyForChordMidi(pitch: number): number {
  return 440 * 2 ** ((clamp(pitch, 0, 127) - 69) / 12);
}

export function chordAttackSeconds(attack: number): number {
  return 0.003 + (clamp(attack, 0, 100) / 100) ** 2 * 0.72;
}

export function chordReleaseSeconds(release: number): number {
  return 0.045 + (clamp(release, 0, 100) / 100) ** 2 * 1.75;
}

export function chordCutoffHz(tone: number): number {
  return Math.min(15_000, 180 * 2 ** (clamp(tone, 0, 100) / 100 * 6.35));
}

export function chordVelocityGain(velocity: number): number {
  const normalized = clamp(velocity / 127, 0.01, 1);
  return 0.075 + normalized ** 1.35 * 0.235;
}

export interface ChordVoiceAllocationState {
  startedAt: number;
  attackEnd: number;
  gateEnd: number;
  releaseEnd: number;
  peak: number;
}

export function chordEnvelopeLevelAt(slot: Readonly<ChordVoiceAllocationState>, time: number): number {
  if (time >= slot.releaseEnd || slot.releaseEnd <= slot.startedAt) return 0;
  if (time < slot.attackEnd) return slot.peak * clamp((time - slot.startedAt) / Math.max(0.0001, slot.attackEnd - slot.startedAt), 0, 1);
  if (time <= slot.gateEnd) return slot.peak * 0.72;
  return slot.peak * 0.72 * clamp((slot.releaseEnd - time) / Math.max(0.0001, slot.releaseEnd - slot.gateEnd), 0, 1);
}

export function selectChordVoiceSlot(slots: readonly ChordVoiceAllocationState[], time: number): number {
  let selected = 0;
  const allocationLevel = (slot: Readonly<ChordVoiceAllocationState>): number => {
    if (slot.releaseEnd <= time) return 0;
    return time <= slot.attackEnd ? slot.peak : chordEnvelopeLevelAt(slot, time);
  };
  let selectedLevel = allocationLevel(slots[0]!);
  for (let index = 1; index < slots.length; index += 1) {
    const level = allocationLevel(slots[index]!);
    if (level < selectedLevel - 0.000_001 || (Math.abs(level - selectedLevel) <= 0.000_001 && slots[index]!.startedAt < slots[selected]!.startedAt)) {
      selected = index;
      selectedLevel = level;
    }
  }
  return selected;
}

interface ChordVoiceSlot extends ChordVoiceAllocationState {
  oscillatorA: OscillatorNode;
  oscillatorB: OscillatorNode;
  oscillatorBGain: GainNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  panner: StereoPannerNode;
}

export class ChordVoice {
  readonly #context: BaseAudioContext;
  readonly #slots: ChordVoiceSlot[];
  readonly #dryBus: GainNode;
  readonly #chorusInput: GainNode;
  readonly #chorusDelayLeft: DelayNode;
  readonly #chorusDelayRight: DelayNode;
  readonly #chorusPanLeft: StereoPannerNode;
  readonly #chorusPanRight: StereoPannerNode;
  readonly #chorusWet: GainNode;
  readonly #chorusLfo: OscillatorNode;
  readonly #chorusDepthLeft: GainNode;
  readonly #chorusDepthRight: GainNode;
  #sound: Readonly<SoundState>;

  constructor(context: BaseAudioContext, destination: AudioNode, sound: Readonly<SoundState>) {
    this.#context = context;
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#dryBus = new GainNode(context, { gain: 0.72 });
    this.#chorusInput = new GainNode(context, { gain: 1 });
    this.#chorusDelayLeft = new DelayNode(context, { maxDelayTime: 0.04, delayTime: 0.013 });
    this.#chorusDelayRight = new DelayNode(context, { maxDelayTime: 0.04, delayTime: 0.019 });
    this.#chorusPanLeft = new StereoPannerNode(context, { pan: -0.72 });
    this.#chorusPanRight = new StereoPannerNode(context, { pan: 0.72 });
    this.#chorusWet = new GainNode(context, { gain: 0 });
    this.#chorusLfo = new OscillatorNode(context, { type: 'sine', frequency: 0.31 });
    this.#chorusDepthLeft = new GainNode(context, { gain: 0 });
    this.#chorusDepthRight = new GainNode(context, { gain: 0 });

    this.#dryBus.connect(destination);
    this.#chorusInput.connect(this.#chorusDelayLeft).connect(this.#chorusPanLeft).connect(this.#chorusWet);
    this.#chorusInput.connect(this.#chorusDelayRight).connect(this.#chorusPanRight).connect(this.#chorusWet);
    this.#chorusWet.connect(destination);
    this.#chorusLfo.connect(this.#chorusDepthLeft).connect(this.#chorusDelayLeft.delayTime);
    this.#chorusLfo.connect(this.#chorusDepthRight).connect(this.#chorusDelayRight.delayTime);
    this.#chorusLfo.start();

    this.#slots = Array.from({ length: 8 }, (_, index) => {
      const oscillatorA = new OscillatorNode(context, { type: 'triangle', frequency: 110, detune: SLOT_DETUNE[index]! });
      const oscillatorB = new OscillatorNode(context, { type: 'sawtooth', frequency: 110, detune: -SLOT_DETUNE[index]! * 0.7 });
      const oscillatorBGain = new GainNode(context, { gain: 0.12 });
      const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: chordCutoffHz(sound.params.tone ?? 48), Q: 0.82 });
      const envelope = new GainNode(context, { gain: 0 });
      const panner = new StereoPannerNode(context, { pan: 0 });
      oscillatorA.connect(filter);
      oscillatorB.connect(oscillatorBGain).connect(filter);
      filter.connect(envelope).connect(panner);
      panner.connect(this.#dryBus);
      panner.connect(this.#chorusInput);
      oscillatorA.start();
      oscillatorB.start();
      return { oscillatorA, oscillatorB, oscillatorBGain, filter, envelope, panner, startedAt: Number.NEGATIVE_INFINITY, attackEnd: 0, gateEnd: 0, releaseEnd: 0, peak: 0 };
    });
    this.#applyContinuousSound(sound, context.currentTime, false);
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const slotIndex = selectChordVoiceSlot(this.#slots, time);
    const slot = this.#slots[slotIndex]!;
    const wasActive = chordEnvelopeLevelAt(slot, time) > 0.000_1;
    const start = time + (wasActive ? 0.004 : 0);
    const frequency = frequencyForChordMidi(event.pitch);
    const attack = chordAttackSeconds(this.#sound.params.attack ?? 28);
    const release = chordReleaseSeconds(this.#sound.params.release ?? 62);
    const peak = chordVelocityGain(event.velocity);
    const gateEnd = Math.max(start + attack + 0.005, time + Math.max(0.015, duration));
    const releaseEnd = gateEnd + release;

    hold(slot.envelope.gain, time);
    if (wasActive) slot.envelope.gain.linearRampToValueAtTime(MIN_GAIN, start);
    else slot.envelope.gain.setValueAtTime(MIN_GAIN, start);
    slot.oscillatorA.frequency.setValueAtTime(frequency, start);
    slot.oscillatorB.frequency.setValueAtTime(frequency, start);
    slot.envelope.gain.linearRampToValueAtTime(peak, start + attack);
    slot.envelope.gain.setValueAtTime(peak * 0.72, gateEnd);
    slot.envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);

    const baseCutoff = chordCutoffHz(this.#sound.params.tone ?? 48);
    const velocity = clamp(event.velocity / 127, 0.01, 1);
    const peakCutoff = Math.min(18_000, baseCutoff * (1.35 + velocity * 2.8));
    hold(slot.filter.frequency, start);
    slot.filter.frequency.setValueAtTime(Math.max(40, baseCutoff * 0.82), start);
    slot.filter.frequency.exponentialRampToValueAtTime(peakCutoff, start + Math.min(0.045, attack + 0.012));
    slot.filter.frequency.exponentialRampToValueAtTime(baseCutoff, Math.min(gateEnd, start + attack + 0.28));

    slot.startedAt = start;
    slot.attackEnd = start + attack;
    slot.gateEnd = gateEnd;
    slot.releaseEnd = releaseEnd;
    slot.peak = peak;
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    this.#sound = { ...sound, params: { ...sound.params } };
    this.#applyContinuousSound(sound, time, true);
  }

  #applyContinuousSound(sound: Readonly<SoundState>, time: number, smooth: boolean): void {
    const tone = clamp(sound.params.tone ?? 48, 0, 100) / 100;
    const width = clamp(sound.params.width ?? 55, 0, 100) / 100;
    const chorus = clamp(sound.params.chorus ?? 24, 0, 100) / 100;
    const set = (param: AudioParam, value: number, duration = 0.02): void => {
      if (smooth) ramp(param, value, time, duration);
      else param.setValueAtTime(value, time);
    };
    for (let index = 0; index < this.#slots.length; index += 1) {
      const slot = this.#slots[index]!;
      set(slot.oscillatorBGain.gain, 0.035 + tone ** 1.4 * 0.31);
      set(slot.filter.frequency, chordCutoffHz(sound.params.tone ?? 48));
      set(slot.filter.Q, 0.65 + tone * 1.15);
      set(slot.panner.pan, SLOT_PAN[index]! * width);
    }
    set(this.#chorusWet.gain, chorus * 0.26);
    set(this.#chorusDepthLeft.gain, 0.000_3 + chorus * 0.002_4, 0.04);
    set(this.#chorusDepthRight.gain, -(0.000_3 + chorus * 0.002_1), 0.04);
  }

  panic(time: number): void {
    for (const slot of this.#slots) {
      hold(slot.envelope.gain, time);
      slot.envelope.gain.linearRampToValueAtTime(0, time + 0.006);
      slot.startedAt = time;
      slot.attackEnd = time;
      slot.gateEnd = time;
      slot.releaseEnd = time;
      slot.peak = 0;
    }
  }

  dispose(time: number): void {
    this.panic(time);
    for (const slot of this.#slots) {
      try { slot.oscillatorA.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
      try { slot.oscillatorB.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
      for (const node of [slot.oscillatorA, slot.oscillatorB, slot.oscillatorBGain, slot.filter, slot.envelope, slot.panner]) node.disconnect();
    }
    try { this.#chorusLfo.stop(time + 0.007); } catch { /* Oscillator may already be stopped. */ }
    for (const node of [
      this.#dryBus, this.#chorusInput, this.#chorusDelayLeft, this.#chorusDelayRight,
      this.#chorusPanLeft, this.#chorusPanRight, this.#chorusWet, this.#chorusLfo,
      this.#chorusDepthLeft, this.#chorusDepthRight,
    ]) node.disconnect();
  }

  get activeVoiceCount(): number {
    return this.#slots.filter((slot) => slot.releaseEnd > this.#context.currentTime).length;
  }
}
