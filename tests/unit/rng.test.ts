import { describe, expect, it } from 'vitest';
import { sfc32 } from '../../src/lib/core/rng';

describe('sfc32', () => {
  it('keeps the versioned seed 42 sequence stable', () => {
    const random = sfc32(42);
    expect(Array.from({ length: 8 }, () => random())).toEqual([
      0.7596266395412385,
      0.6058550255838782,
      0.7453242409974337,
      0.15936197945848107,
      0.24687009025365114,
      0.5075806800741702,
      0.3528610907960683,
      0.5813600809779018,
    ]);
  });

  it('replays the same sequence for the same uint32 seed', () => {
    const left = sfc32(0xffffffff);
    const right = sfc32(0xffffffff);
    expect(Array.from({ length: 32 }, () => left())).toEqual(Array.from({ length: 32 }, () => right()));
  });
});
