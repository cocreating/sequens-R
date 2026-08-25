import type { NoteEvent } from '../../core/pattern';

function createSample(context: BaseAudioContext, lane: number): AudioBuffer {
  const duration = lane === 0 ? 0.45 : 0.18 + lane * 0.015;
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let noiseState = (0x9e3779b9 ^ lane) >>> 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / context.sampleRate;
    noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
    const noise = noiseState / 0xffffffff * 2 - 1;
    const decay = Math.exp(-time * (lane === 0 ? 10 : 28 + lane * 3));
    if (lane === 0) {
      const frequency = 150 * Math.exp(-time * 18) + 42;
      channel[index] = Math.sin(2 * Math.PI * frequency * time) * decay;
    } else if (lane === 1) {
      channel[index] = (noise * 0.72 + Math.sin(2 * Math.PI * 190 * time) * 0.28) * decay;
    } else {
      channel[index] = noise * decay * (0.72 - lane * 0.035);
    }
  }
  return buffer;
}

export class DrumKitVoice {
  readonly #context: BaseAudioContext;
  readonly #destination: AudioNode;
  readonly #samples: readonly AudioBuffer[];
  readonly #active = new Set<AudioBufferSourceNode>();

  constructor(context: BaseAudioContext, destination: AudioNode) {
    this.#context = context;
    this.#destination = destination;
    this.#samples = Array.from({ length: 8 }, (_, lane) => createSample(context, lane));
  }

  trigger(event: NoteEvent, time: number): void {
    const sample = this.#samples[event.lane ?? 0] ?? this.#samples[0]!;
    const source = new AudioBufferSourceNode(this.#context, { buffer: sample });
    const velocity = new GainNode(this.#context, { gain: event.velocity / 127 * 0.8 });
    source.connect(velocity).connect(this.#destination);
    this.#active.add(source);
    source.onended = () => this.#active.delete(source);
    source.start(time);
  }

  panic(time = this.#context.currentTime): void {
    for (const source of this.#active) {
      try { source.stop(time); } catch { /* The source may already have ended. */ }
    }
    this.#active.clear();
  }

  dispose(time = this.#context.currentTime): void {
    this.panic(time);
  }

  get activeVoiceCount(): number {
    return this.#active.size;
  }
}
