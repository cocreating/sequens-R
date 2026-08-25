import type { NoteEvent } from '../../core/pattern';

interface VoiceSlot {
  oscillator: OscillatorNode;
  envelope: GainNode;
  availableAt: number;
}

function frequencyForMidi(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

export class PolyVoice {
  readonly #context: BaseAudioContext;
  readonly #slots: VoiceSlot[];

  constructor(context: BaseAudioContext, destination: AudioNode, waveform: OscillatorType, voiceCount = 4) {
    this.#context = context;
    this.#slots = Array.from({ length: voiceCount }, () => {
      const oscillator = new OscillatorNode(context, { type: waveform, frequency: 110 });
      const envelope = new GainNode(context, { gain: 0 });
      oscillator.connect(envelope).connect(destination);
      oscillator.start();
      return { oscillator, envelope, availableAt: 0 };
    });
  }

  trigger(event: NoteEvent, time: number, duration: number): void {
    const slot = this.#slots.reduce((earliest, candidate) => candidate.availableAt < earliest.availableAt ? candidate : earliest);
    const attackEnd = time + 0.008;
    const releaseStart = Math.max(attackEnd, time + duration * 0.75);
    const releaseEnd = time + duration;
    const peak = Math.min(0.22, event.velocity / 127 * 0.2);
    slot.oscillator.frequency.setValueAtTime(frequencyForMidi(event.pitch), time);
    slot.envelope.gain.cancelScheduledValues(time);
    slot.envelope.gain.setValueAtTime(0, time);
    slot.envelope.gain.linearRampToValueAtTime(peak, attackEnd);
    slot.envelope.gain.setValueAtTime(peak, releaseStart);
    slot.envelope.gain.exponentialRampToValueAtTime(0.0001, Math.max(releaseStart + 0.001, releaseEnd));
    slot.availableAt = releaseEnd;
  }

  panic(time: number): void {
    for (const slot of this.#slots) {
      slot.envelope.gain.cancelScheduledValues(time);
      slot.envelope.gain.setValueAtTime(0, time);
      slot.availableAt = time;
    }
  }

  dispose(time: number): void {
    this.panic(time);
    for (const slot of this.#slots) {
      try { slot.oscillator.stop(time); } catch { /* Oscillator may already be stopped. */ }
      slot.oscillator.disconnect();
      slot.envelope.disconnect();
    }
  }

  get activeVoiceCount(): number {
    return this.#slots.filter((slot) => slot.availableAt > this.#context.currentTime).length;
  }
}
