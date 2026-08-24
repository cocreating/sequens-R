import { describe, expect, it } from 'vitest';
import type { ModuleType, Pattern } from '../../src/lib/core/pattern';
import { GENERATORS } from '../../src/lib/generators';
import { bjorklund } from '../../src/lib/generators/euclid';
import { createProject, migrateProject } from '../../src/lib/project/model';
import { deserializeRack, serializeRack } from '../../src/lib/share/codec';
import type { ShareableRack } from '../../src/lib/share/types';
import {
  createModule,
  createRackState,
  modulePattern,
  setCcAutomation,
  setManualPattern,
  setModuleParams,
} from '../../src/lib/state/rack';
import { STARTER_RACK } from '../../src/lib/share/starter';

const context = Object.freeze({ key: Object.freeze({ root: 2, scale: 'dorian' as const }), bars: 4 });

function hashPattern(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('Phase 4 desktop generators', () => {
  it.each([
    ['arp', 'acfe8b56'],
    ['euclid', '3df4f16e'],
    ['piano', 'b5479a42'],
    ['cc', '9479df54'],
    ['mod', '8437a0df'],
  ] as const)('%s has a deterministic golden and schema-driven controls', (type, golden) => {
    const generator = GENERATORS[type];
    const first = generator.generate(0x504834, { ...generator.defaults }, context);
    expect(generator.generate(0x504834, { ...generator.defaults }, context)).toEqual(first);
    expect(generator.paramSchema.map(({ key }) => key)).toEqual(Object.keys(generator.defaults));
    expect(hashPattern(first)).toBe(golden);
  });

  it('Arp follows the supplied chord progression', () => {
    const generator = GENERATORS.arp;
    const params = { ...generator.defaults, followChords: 1 };
    const first = generator.generate(42, params, {
      ...context,
      chords: [{ startStep: 0, durationSteps: 16, pitches: [50, 53, 57] }],
    });
    const second = generator.generate(42, params, {
      ...context,
      chords: [{ startStep: 0, durationSteps: 16, pitches: [51, 55, 58] }],
    });
    expect(first.events.map(({ pitch }) => pitch)).not.toEqual(second.events.map(({ pitch }) => pitch));
  });

  it('Euclid creates three independent Bjorklund rings and optional channel offsets', () => {
    expect(bjorklund(13, 5, 2)).toHaveLength(13);
    expect(bjorklund(13, 5, 2).filter(Boolean)).toHaveLength(5);
    const generator = GENERATORS.euclid;
    const pattern = generator.generate(42, { ...generator.defaults, separateChannels: 1 }, context);
    expect(pattern.laneLengths).toEqual([16, 12, 9]);
    expect(new Set(pattern.events.map(({ lane }) => lane))).toEqual(new Set([0, 1, 2]));
    expect(new Set(pattern.events.map(({ channelOffset }) => channelOffset))).toEqual(new Set([0, 1, 2]));
  });

  it('Piano roll slots preserve hand-authored notes and remain local-only', () => {
    const piano = createModule('piano', 42);
    const pattern: Pattern = {
      lengthSteps: 32,
      stepsPerBeat: 4,
      events: [{ startStep: 3, durationSteps: 2, pitch: 62, velocity: 100 }],
    };
    const edited = setManualPattern(piano, pattern);
    expect(edited.shareable).toBe(false);
    expect(modulePattern(edited, context.key)).toEqual(pattern);
    expect(piano.slots[0]!.pattern?.events).toEqual([]);
  });

  it('CC recording becomes local-only and creates looped control events', () => {
    const cc = setCcAutomation(createModule('cc', 42), [
      { control: 1, step: 0, value: 20 },
      { control: 1, step: 4.25, value: 96 },
    ]);
    expect(cc.shareable).toBe(false);
    expect(modulePattern(cc, context.key).events.map(({ cc: number, value, channel }) => ({ number, value, channel }))).toEqual([
      { number: 74, value: 20, channel: 1 },
      { number: 74, value: 96, channel: 1 },
    ]);
    expect(setCcAutomation(cc, []).shareable).toBe(true);
  });

  it('keeps recorded CC points inside the loop when its bar count shrinks', () => {
    const twoBars = setModuleParams(createModule('cc', 42), { ...GENERATORS.cc.defaults, bars: 2 });
    const recorded = setCcAutomation(twoBars, [{ control: 1, step: 31.75, value: 96 }]);
    const shortened = setModuleParams(recorded, { ...recorded.params, bars: 1 });
    expect(shortened.automation).toEqual([{ control: 1, step: 15.75, value: 96 }]);
    expect(modulePattern(shortened, context.key).events[0]?.startStep).toBe(15.75);
  });

  it('Mod emits bounded, tempo-synchronous CC values for up to three LFOs', () => {
    const generator = GENERATORS.mod;
    const pattern = generator.generate(42, { ...generator.defaults, enabled2: 1, enabled3: 1 }, context);
    expect(new Set(pattern.events.map(({ lane }) => lane))).toEqual(new Set([0, 1, 2]));
    expect(pattern.events.every((event) => event.cc !== undefined && event.value !== undefined && event.value >= 0 && event.value <= 127)).toBe(true);
  });
});

describe('Phase 4 persistence and links', () => {
  it('migrates Phase 2/3 project documents into the Phase 4 schema', () => {
    const legacy = createProject(createRackState(STARTER_RACK));
    const migrated = migrateProject({ ...legacy, schemaVersion: 1 });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.racks[0]?.state.modules[0]?.automation).toEqual([]);
  });

  it('round-trips shareable desktop generators for mobile playback', async () => {
    const types: ModuleType[] = ['arp', 'euclid', 'cc', 'mod'];
    const rack: ShareableRack = {
      bpm: 126,
      key: context.key,
      modules: types.map((type) => ({ type, seed: 42, params: { ...GENERATORS[type].defaults } })),
    };
    expect(await deserializeRack(await serializeRack(rack))).toEqual(rack);
  });

  it('rejects piano-roll data at the link codec boundary', async () => {
    await expect(serializeRack({
      bpm: 120,
      key: context.key,
      modules: [{ type: 'piano', seed: 42, params: { ...GENERATORS.piano.defaults } }],
    })).rejects.toThrow('exported as a project');
  });
});
