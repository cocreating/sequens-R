declare const currentTime: number;
declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

class SequensClockProcessor extends AudioWorkletProcessor {
  #quantumCount = 0;

  process(): boolean {
    this.#quantumCount += 1;
    if (this.#quantumCount === 4) {
      this.#quantumCount = 0;
      this.port.postMessage({ type: 'tick', contextTime: currentTime });
    }
    return true;
  }
}

registerProcessor('sequens-clock', SequensClockProcessor);
