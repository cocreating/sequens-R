const MIN_INTERVAL_MS = 200;
const MAX_INTERVAL_MS = 3_000;
const MAX_TAPS = 6;

export class TapTempo {
  #timestamps: number[] = [];

  tap(timestampMs: number): number | null {
    if (!Number.isFinite(timestampMs)) return null;

    const previous = this.#timestamps.at(-1);
    const interval = previous === undefined ? null : timestampMs - previous;
    if (interval === null || interval < MIN_INTERVAL_MS || interval > MAX_INTERVAL_MS) {
      this.#timestamps = [timestampMs];
      return null;
    }

    this.#timestamps.push(timestampMs);
    if (this.#timestamps.length > MAX_TAPS) this.#timestamps.shift();
    const intervals = this.#timestamps.slice(1).map((timestamp, index) => timestamp - this.#timestamps[index]!);
    const averageInterval = intervals.reduce((total, value) => total + value, 0) / intervals.length;
    return Math.round(60_000 / averageInterval);
  }

  reset(): void {
    this.#timestamps = [];
  }
}
