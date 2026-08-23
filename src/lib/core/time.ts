export const STEPS_PER_BEAT = 4;

export function beatsToSeconds(beats: number, bpm: number): number {
  if (!Number.isFinite(beats)) throw new TypeError('Beats must be finite.');
  assertBpm(bpm);
  return beats * 60 / bpm;
}

export function stepsToSeconds(steps: number, stepsPerBeat: number, bpm: number): number {
  if (!Number.isFinite(steps) || !Number.isFinite(stepsPerBeat) || stepsPerBeat <= 0) {
    throw new RangeError('Step values must be finite and stepsPerBeat must be positive.');
  }
  return beatsToSeconds(steps / stepsPerBeat, bpm);
}

export function assertBpm(bpm: number): void {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) {
    throw new RangeError(`BPM must be between 20 and 300; received ${bpm}.`);
  }
}

export function quantizeUp(value: number, quantum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(quantum) || quantum <= 0) {
    throw new RangeError('Quantization values must be finite and quantum must be positive.');
  }
  return Math.ceil((value - Number.EPSILON) / quantum) * quantum;
}
