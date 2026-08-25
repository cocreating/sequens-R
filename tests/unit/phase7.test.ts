import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeAudio,
  analysisReport,
  assertAnalysisGate,
  integratedLoudness,
  loudnessMatch,
  type AudioPcm,
} from '../../src/lib/audio/analysis';
import {
  createDefaultSound,
  DEFAULT_RACK_MIX,
  SOUND_PARAM_SCHEMAS,
  SOUND_PRESETS,
  soundForPreset,
  validatePresetCatalog,
} from '../../src/lib/audio/sound';
import { VOICE_FACTORY } from '../../src/lib/audio/voice-factory';
import { SCALE_NAMES, type ModuleType } from '../../src/lib/core/pattern';
import { randomInt, sfc32 } from '../../src/lib/core/rng';
import { createSmfType1 } from '../../src/lib/export/smf';
import { GENERATORS } from '../../src/lib/generators';
import { createProject, migrateProject, projectFromJson, projectToJson } from '../../src/lib/project/model';
import { encodeCbor } from '../../src/lib/share/cbor';
import { deserializeRack, normalizeRack, PATCH_SCHEMA_VERSION, serializeRack } from '../../src/lib/share/codec';
import { MODULE_TYPES, PARAM_SCHEMAS } from '../../src/lib/share/schema';
import { STARTER_RACK } from '../../src/lib/share/starter';
import type { ShareableRack } from '../../src/lib/share/types';
import {
  createRackState,
  modulePattern,
  setModuleSoundParam,
  toEngineSnapshot,
  toShareableRack,
  toSoundSnapshot,
} from '../../src/lib/state/rack';

const LINK_TYPES = MODULE_TYPES.filter((type) => type !== 'piano');

function calibrationTone(rmsDbfs: number, seconds = 3): AudioPcm {
  const sampleRate = 48_000;
  const peak = 10 ** (rmsDbfs / 20) * Math.SQRT2;
  return {
    sampleRate,
    channels: [Float32Array.from({ length: sampleRate * seconds }, (_, index) => Math.sin(2 * Math.PI * 1_000 * index / sampleRate) * peak)],
  };
}

async function legacyPatch(version: 1 | 2): Promise<Uint8Array> {
  const tuple = [1180, 0, SCALE_NAMES.indexOf('minor'), [[0, 0x53455101, []]]];
  const body = encodeCbor(tuple);
  const versioned = new Uint8Array(body.length + 1);
  versioned[0] = version;
  versioned.set(body, 1);
  return new Uint8Array(await new Response(
    new Blob([versioned]).stream().pipeThrough(new CompressionStream('deflate-raw')),
  ).arrayBuffer());
}

function randomRack(random: () => number): ShareableRack {
  return {
    bpm: randomInt(random, 200, 3000) / 10,
    key: { root: randomInt(random, 0, 11), scale: SCALE_NAMES[randomInt(random, 0, SCALE_NAMES.length - 1)]! },
    modules: LINK_TYPES.map((type) => {
      const params = Object.fromEntries(PARAM_SCHEMAS[type].map((definition) => {
        const steps = Math.floor((definition.max - definition.min) / definition.step);
        return [definition.key, definition.min + randomInt(random, 0, steps) * definition.step];
      }));
      const preset = SOUND_PRESETS.filter((candidate) => candidate.moduleType === type)[randomInt(random, 0, 1)]!;
      const sound = soundForPreset(type, preset.id);
      sound.params = Object.fromEntries(SOUND_PARAM_SCHEMAS[type].map((definition) => {
        const steps = Math.floor((definition.max - definition.min) / definition.step);
        return [definition.key, definition.min + randomInt(random, 0, steps) * definition.step];
      }));
      if (type !== 'mixer' && type !== 'cc' && type !== 'mod') {
        sound.pan = randomInt(random, -100, 100);
        sound.delaySend = randomInt(random, 0, 100);
        sound.reverbSend = randomInt(random, 0, 100);
      }
      return { type, seed: Math.floor(random() * 0x1_0000_0000) >>> 0, params, sound };
    }),
    mix: {
      delayDivision: randomInt(random, 0, 5),
      delayFeedback: randomInt(random, 0, 90),
      delayReturn: randomInt(random, 0, 100),
      reverbReturn: randomInt(random, 0, 100),
      masterCharacter: randomInt(random, 0, 100),
    },
  };
}

describe('Phase 7.0 sound domain and migrations', () => {
  it('validates the append-only preset catalog and rejects malformed records', () => {
    expect(() => validatePresetCatalog(SOUND_PRESETS)).not.toThrow();
    expect(new Set(SOUND_PRESETS.map(({ id }) => id)).size).toBe(SOUND_PRESETS.length);
    expect(() => validatePresetCatalog([...SOUND_PRESETS, SOUND_PRESETS[0]!])).toThrow(/Duplicate/);
    expect(() => validatePresetCatalog([{ ...SOUND_PRESETS[0]!, params: {} }])).toThrow(/missing/);
    expect(() => validatePresetCatalog([{ ...SOUND_PRESETS[0]!, moduleType: 'bass' }])).toThrow();
  });

  it('migrates project schemas 1 through 3 to legacy sound and round-trips v4 deeply', () => {
    const current = createProject(createRackState(STARTER_RACK), 'Phase 7');
    expect(projectFromJson(projectToJson(current))).toEqual(current);
    for (const schemaVersion of [1, 2, 3]) {
      const legacy = structuredClone(current) as unknown as Record<string, unknown>;
      legacy.schemaVersion = schemaVersion;
      for (const rack of (legacy.racks as Array<{ state: { modules: Array<Record<string, unknown>>; mix?: unknown } }>)) {
        delete rack.state.mix;
        for (const module of rack.state.modules) delete module.sound;
      }
      const migrated = migrateProject(legacy);
      expect(migrated.schemaVersion).toBe(4);
      expect(migrated.racks[0]?.state.mix).toEqual(DEFAULT_RACK_MIX);
      expect(migrated.racks[0]?.state.modules.every(({ sound }) => sound.presetId.startsWith('legacy-'))).toBe(true);
    }
  });

  it('migrates v1/v2 links to legacy voices and deeply round-trips v3 sound state', async () => {
    for (const version of [1, 2] as const) {
      const migrated = await deserializeRack(await legacyPatch(version));
      expect(migrated.modules[0]?.sound?.presetId).toBe('legacy-drums-v1');
      expect(migrated.mix).toEqual(DEFAULT_RACK_MIX);
    }
    const rack = toShareableRack(createRackState(STARTER_RACK));
    const encoded = await serializeRack(rack);
    expect(PATCH_SCHEMA_VERSION).toBe(3);
    expect(await deserializeRack(encoded)).toEqual(normalizeRack(rack));
  });

  it('keeps 200 randomized v3 links at or below 400 bytes', async () => {
    const random = sfc32(0x70070070);
    let largest = 0;
    for (let index = 0; index < 200; index += 1) {
      const rack = randomRack(random);
      const encoded = await serializeRack(rack);
      largest = Math.max(largest, encoded.byteLength);
      expect(await deserializeRack(encoded)).toEqual(normalizeRack(rack));
    }
    expect(largest).toBeLessThanOrEqual(400);
  });

  it('publishes immutable sound separately without changing patterns, MIDI events, or SMF bytes', () => {
    const rack = createRackState(STARTER_RACK);
    const beforeEngine = toEngineSnapshot(rack);
    const beforePatterns = rack.modules.map((module) => modulePattern(module, rack.key, rack.modules));
    const beforeSmf = createSmfType1(rack, 4);
    const changed = {
      ...rack,
      modules: rack.modules.map((module, index) => index === 1 ? setModuleSoundParam(module, 'cutoff', 73) : module),
    };
    expect(toEngineSnapshot(changed)).toEqual(beforeEngine);
    expect(changed.modules.map((module) => modulePattern(module, changed.key, changed.modules))).toEqual(beforePatterns);
    expect(createSmfType1(changed, 4)).toEqual(beforeSmf);
    expect(toSoundSnapshot(changed)).not.toEqual(toSoundSnapshot(rack));
    expect(Object.isFrozen(toSoundSnapshot(changed))).toBe(true);
  });

  it('gives live and bounce one stable factory identity for every module and preset', () => {
    for (const type of MODULE_TYPES) {
      const sound = createDefaultSound(type);
      const live = VOICE_FACTORY.identify({ type, sound });
      const bounce = VOICE_FACTORY.identify({ type, sound: structuredClone(sound) });
      expect(live).toEqual(bounce);
      expect(live.presetId).toBe(sound.presetId);
    }
  });
});

describe('Phase 7.0 analysis and reference bench', () => {
  it('calibrates 1 kHz programme loudness and produces stable reports', () => {
    const fixture = JSON.parse(readFileSync(new URL('../fixtures/phase7/calibration.json', import.meta.url), 'utf8')) as {
      fixtures: { oneKhzMinus23DbfsRms: { rmsDbfs: number; expectedLufs: number; toleranceLu: number } };
    };
    const expected = fixture.fixtures.oneKhzMinus23DbfsRms;
    const tone = calibrationTone(expected.rmsDbfs);
    const analysis = analyzeAudio(tone);
    expect(Math.abs(analysis.integratedLufs! - expected.expectedLufs)).toBeLessThanOrEqual(expected.toleranceLu);
    expect(analysis.truePeakDbtp).toBeCloseTo(-19.99, 1);
    expect(analysis.dcDbfs).toBeLessThan(-100);
    expect(JSON.parse(analysisReport({ calibration: analysis })).standard).toBe('ITU-R BS.1770-5');
  });

  it('loudness-matches audition copies within 0.2 LU', () => {
    const matched = loudnessMatch(calibrationTone(-23), -18);
    expect(matched.gainDb).toBeCloseTo(5, 1);
    expect(integratedLoudness(matched.pcm)).toBeCloseTo(-18, 1);
  });

  it('rejects non-finite samples, excessive DC, peak, and loudness failures', () => {
    expect(() => analyzeAudio({ sampleRate: 48_000, channels: [new Float32Array([0, Number.NaN])] })).toThrow(/NaN/);
    const quiet = analyzeAudio(calibrationTone(-23));
    expect(() => assertAnalysisGate(quiet, { loudnessTarget: -18, loudnessTolerance: 1, maxTruePeakDbtp: -1, maxDcDbfs: -60 })).toThrow(/loudness/);

    const clippedPcm = calibrationTone(-3);
    const clipped = analyzeAudio(clippedPcm);
    expect(() => assertAnalysisGate(clipped, { loudnessTarget: clipped.integratedLufs!, loudnessTolerance: 0.1, maxTruePeakDbtp: -1, maxDcDbfs: -60 })).toThrow(/True peak/);

    const dcPcm = calibrationTone(-18);
    dcPcm.channels = [Float32Array.from(dcPcm.channels[0]!, (sample) => sample + 0.01)];
    const dc = analyzeAudio(dcPcm);
    expect(() => assertAnalysisGate(dc, { loudnessTarget: dc.integratedLufs!, loudnessTolerance: 0.1, maxTruePeakDbtp: 0, maxDcDbfs: -60 })).toThrow(/DC/);
  });

  it('commits seven eight-bar family racks plus the 16-module/140 BPM stress rack', () => {
    const fixtures = JSON.parse(readFileSync(new URL('../fixtures/phase7/reference-racks.json', import.meta.url), 'utf8')) as {
      bars: number;
      racks: Array<{ family: string; bpm: number; modules: Array<{ type: ModuleType; params: Record<string, number> }> }>;
    };
    expect(fixtures.bars).toBe(8);
    expect(fixtures.racks.filter(({ family }) => family !== 'stress')).toHaveLength(7);
    const stress = fixtures.racks.find(({ family }) => family === 'stress')!;
    expect(stress.bpm).toBe(140);
    expect(stress.modules).toHaveLength(16);
    for (const rack of fixtures.racks) {
      for (const module of rack.modules) expect(() => ({ ...GENERATORS[module.type].defaults, ...module.params })).not.toThrow();
    }
  });
});
