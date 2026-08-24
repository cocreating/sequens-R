interface OutputTimestampSource {
  getOutputTimestamp(): AudioTimestamp;
}

export class MidiTimeBridge {
  readonly #context: OutputTimestampSource;
  #offsetMs = 0;

  constructor(context: OutputTimestampSource) {
    this.#context = context;
    this.resync();
  }

  resync(): void {
    const timestamp = this.#context.getOutputTimestamp();
    if (timestamp.performanceTime === undefined || timestamp.contextTime === undefined) return;
    this.#offsetMs = timestamp.performanceTime - timestamp.contextTime * 1000;
  }

  toPerformanceTime(contextTime: number): number {
    return contextTime * 1000 + this.#offsetMs;
  }
}
