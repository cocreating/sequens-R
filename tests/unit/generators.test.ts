import { describe, expect, it } from 'vitest';
import { GENERATORS } from '../../src/lib/generators';
import { STARTER_RACK } from '../../src/lib/share/starter';

const context = Object.freeze({ key: Object.freeze({ root: 0, scale: 'minor' as const }), bars: 1 });

function hashPattern(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('core generator goldens', () => {
  it.each([
    ['drums', '553e84ff'],
    ['bass', 'fbd0385f'],
    ['acid', '1e19c17f'],
    ['chords', '8873a364'],
    ['mixer', 'b5479a42'],
  ] as const)('%s keeps seed 42 stable', (type, golden) => {
    const generator = GENERATORS[type];
    const params = Object.freeze({ ...generator.defaults });
    const first = generator.generate(42, params, context);
    const second = generator.generate(42, params, context);
    expect(second).toEqual(first);
    expect(hashPattern(first)).toBe(golden);
  });
});

describe('audited starter content', () => {
  it('keeps all six original drum styles distinct', () => {
    const hashes = Array.from({ length: 6 }, (_, groove) => hashPattern(
      GENERATORS.drums.generate(42, { ...GENERATORS.drums.defaults, groove }, context),
    ));
    expect(new Set(hashes).size).toBe(6);
  });

  it('keeps the versioned starter rack patterns stable', () => {
    const hashes = STARTER_RACK.modules.map((module) => hashPattern(
      GENERATORS[module.type].generate(module.seed, { ...GENERATORS[module.type].defaults, ...module.params }, context),
    ));
    expect(hashes).toEqual(['553e84ff', '005f6b4a', 'f6d36481']);
  });
});
