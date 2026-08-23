import type { RackState } from './rack';

const HISTORY_LIMIT = 100;

export class RackHistory {
  #current: RackState;
  readonly #past: RackState[] = [];
  readonly #future: RackState[] = [];
  #coalesceKey: string | null = null;

  constructor(initial: RackState) {
    this.#current = structuredClone(initial);
  }

  get current(): RackState {
    return structuredClone(this.#current);
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  reset(value: RackState): void {
    this.#current = structuredClone(value);
    this.#past.length = 0;
    this.#future.length = 0;
    this.#coalesceKey = null;
  }

  record(value: RackState, coalesceKey: string | null = null): RackState {
    if (coalesceKey === null || coalesceKey !== this.#coalesceKey) {
      this.#past.push(structuredClone(this.#current));
      if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
    }
    this.#current = structuredClone(value);
    this.#future.length = 0;
    this.#coalesceKey = coalesceKey;
    return this.current;
  }

  endCoalescing(): void {
    this.#coalesceKey = null;
  }

  undo(): RackState | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(structuredClone(this.#current));
    this.#current = previous;
    this.#coalesceKey = null;
    return this.current;
  }

  redo(): RackState | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(structuredClone(this.#current));
    this.#current = next;
    this.#coalesceKey = null;
    return this.current;
  }
}
