import { describe, expect, it } from 'vitest';
import { TapTempo } from '../../src/lib/core/tap-tempo';

describe('tap tempo', () => {
  it('averages recent taps and returns a whole BPM', () => {
    const tapper = new TapTempo();
    expect(tapper.tap(1_000)).toBeNull();
    expect(tapper.tap(1_500)).toBe(120);
    expect(tapper.tap(2_010)).toBe(119);
    expect(Number.isInteger(tapper.tap(2_500))).toBe(true);
  });

  it('starts a new sequence after an out-of-range interval', () => {
    const tapper = new TapTempo();
    tapper.tap(1_000);
    expect(tapper.tap(1_100)).toBeNull();
    expect(tapper.tap(1_600)).toBe(120);
    expect(tapper.tap(5_000)).toBeNull();
  });

  it('can be reset explicitly', () => {
    const tapper = new TapTempo();
    tapper.tap(1_000);
    tapper.tap(1_500);
    tapper.reset();
    expect(tapper.tap(2_000)).toBeNull();
  });
});
