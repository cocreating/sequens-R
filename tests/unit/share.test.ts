import { describe, expect, it } from 'vitest';
import { randomInt, sfc32 } from '../../src/lib/core/rng';
import { SCALE_NAMES, type ModuleType } from '../../src/lib/core/pattern';
import { deserializeRack, normalizeRack, PATCH_SCHEMA_VERSION, serializeRack } from '../../src/lib/share/codec';
import { loadRackFromFragment, rackToFragment } from '../../src/lib/share/fragment';
import { MODULE_TYPES, PARAM_SCHEMAS } from '../../src/lib/share/schema';
import { STARTER_RACK } from '../../src/lib/share/starter';
import type { ShareableModule, ShareableRack } from '../../src/lib/share/types';
import { GENERATORS } from '../../src/lib/generators';

function randomModule(random: () => number, type: ModuleType): ShareableModule {
  const params: Record<string, number> = {};
  for (const definition of PARAM_SCHEMAS[type]) {
    const steps = Math.floor((definition.max - definition.min) / definition.step);
    params[definition.key] = definition.min + randomInt(random, 0, steps) * definition.step;
  }
  return { type, seed: Math.floor(random() * 0x100000000) >>> 0, params };
}

function randomRack(random: () => number): ShareableRack {
  return {
    bpm: randomInt(random, 200, 3000) / 10,
    key: { root: randomInt(random, 0, 11), scale: SCALE_NAMES[randomInt(random, 0, SCALE_NAMES.length - 1)]! },
    modules: MODULE_TYPES.map((type) => randomModule(random, type)),
  };
}

function generatedPatterns(rack: ShareableRack) {
  return rack.modules.map((module) => GENERATORS[module.type].generate(module.seed, module.params, { key: rack.key, bars: 1 }));
}

describe('link patch codec', () => {
  it('round-trips 200 five-module racks and stays below 400 bytes', async () => {
    const random = sfc32(0x5e9e05);
    let largest = 0;
    for (let index = 0; index < 200; index += 1) {
      const rack = randomRack(random);
      const encoded = await serializeRack(rack);
      largest = Math.max(largest, encoded.byteLength);
      const decoded = await deserializeRack(encoded);
      expect(decoded).toEqual(normalizeRack(rack));
      expect(generatedPatterns(decoded)).toEqual(generatedPatterns(rack));
    }
    expect(largest).toBeLessThanOrEqual(400);
  });

  it('routes a starter rack exclusively through a URL fragment', async () => {
    const fragment = await rackToFragment(STARTER_RACK);
    expect(fragment.startsWith('#p=')).toBe(true);
    expect(await loadRackFromFragment(fragment)).toEqual(normalizeRack(STARTER_RACK));
    expect(await loadRackFromFragment('')).toBeNull();
  });

  it('rejects unknown schema versions instead of guessing', async () => {
    const encoded = await serializeRack(STARTER_RACK);
    const decompressed = new Uint8Array(await new Response(
      new Blob([encoded.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
    ).arrayBuffer());
    decompressed[0] = PATCH_SCHEMA_VERSION + 1;
    const changed = new Uint8Array(await new Response(
      new Blob([decompressed]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer());
    await expect(deserializeRack(changed)).rejects.toThrow('Unsupported patch schema version');
  });
});
