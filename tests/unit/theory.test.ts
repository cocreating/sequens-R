import { describe, expect, it } from 'vitest';
import { diatonicChord } from '../../src/lib/core/theory/chords';
import { scalePitch, transposePitch } from '../../src/lib/core/theory/scales';

describe('music theory adapter', () => {
  it('maps degrees across octaves in every direction', () => {
    const key = { root: 0, scale: 'major' } as const;
    expect(scalePitch(key, 0, 3)).toBe(48);
    expect(scalePitch(key, 7, 3)).toBe(60);
    expect(scalePitch(key, -1, 3)).toBe(47);
  });

  it('builds diatonic extended chords', () => {
    expect(diatonicChord({ root: 2, scale: 'dorian' }, 0, 'seventh')).toEqual([50, 53, 57, 60]);
  });

  it('transposes by root without changing the source pattern', () => {
    expect(transposePitch(60, { root: 0, scale: 'major' }, { root: 7, scale: 'minor' })).toBe(67);
  });
});
