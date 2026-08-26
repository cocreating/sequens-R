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
  RACK_MIX_SCHEMA,
  SOUND_PARAM_SCHEMAS,
  SOUND_OUTPUT_SCHEMA,
  SOUND_PRESETS,
  presetsFor,
  soundForPreset,
  validatePresetCatalog,
} from '../../src/lib/audio/sound';
import { VOICE_FACTORY } from '../../src/lib/audio/voice-factory';
import { createSoftClipCurve, delaySecondsFor } from '../../src/lib/audio/rack-graph';
import { DRUM_KITS, drumVariationIndex, drumVelocityGain, renderProceduralDrumLane } from '../../src/lib/audio/voices/procedural-drums';
import { bassCutoffHz, bassVelocityGain, createBassDriveCurve, frequencyForBassMidi, planBassTrigger } from '../../src/lib/audio/voices/bass';
import { AcidDspKernel, acidAccentDepth, acidAmplitudePeak, acidCutoffHz, acidDcBlockCoefficient, acidDecaySeconds, acidFilterEnvelopePeak, acidSlideSeconds, polyBlep, type AcidDspParams } from '../../src/lib/audio/acid-dsp';
import { frequencyForAcidMidi, planAcidTransition } from '../../src/lib/audio/voices/acid';
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
import { moduleHelpFor } from '../../src/lib/ui/module-help';

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

describe('Phase 7.1 shared rack graph', () => {
  it('maps musical delay divisions deterministically and clamps tempo', () => {
    expect(delaySecondsFor(120, 0)).toBeCloseTo(0.5, 6);
    expect(delaySecondsFor(120, 2)).toBeCloseTo(0.375, 6);
    expect(delaySecondsFor(120, 3)).toBeCloseTo(1 / 6, 6);
    expect(delaySecondsFor(1, 0)).toBeCloseTo(3, 6);
    expect(delaySecondsFor(999, 0)).toBeCloseTo(0.2, 6);
  });

  it('keeps neutral soft clipping linear and character curves finite, bounded, and monotonic', () => {
    const neutral = createSoftClipCurve(0, 257);
    const character = createSoftClipCurve(100, 257);
    expect(neutral[0]).toBeCloseTo(-1, 6);
    expect(neutral[128]).toBeCloseTo(0, 6);
    expect(neutral[256]).toBeCloseTo(1, 6);
    for (let index = 1; index < character.length; index += 1) {
      expect(Number.isFinite(character[index])).toBe(true);
      expect(character[index]).toBeGreaterThanOrEqual(character[index - 1]!);
      expect(Math.abs(character[index]!)).toBeLessThanOrEqual(1);
    }
    expect(character[192]!).toBeGreaterThan(neutral[192]!);
  });
});

describe('Phase 7.2 procedural drums', () => {
  it('keeps the legacy preset and appends six original procedural kits', () => {
    const presets = presetsFor('drums');
    expect(presets.filter(({ id }) => id.startsWith('legacy-'))).toHaveLength(1);
    expect(presets.filter(({ id }) => !id.startsWith('legacy-')).map(({ id }) => id)).toEqual(DRUM_KITS.map(({ id }) => id));
    expect(new Set(presets.map(({ label }) => label)).size).toBe(7);
    expect(VOICE_FACTORY.identify({ type: 'drums', sound: soundForPreset('drums', 'drums-core-v2') }).implementationId).toBe('procedural-drums-v2');
    expect(VOICE_FACTORY.identify({ type: 'drums', sound: soundForPreset('drums', 'legacy-drums-v1') }).implementationId).toBe('legacy-drums-v1');
  });

  it('round-trips every appended drum kit without changing earlier preset indexes', async () => {
    expect(SOUND_PRESETS.slice(0, 4).map(({ id }) => id)).toEqual(['legacy-drums-v1', 'drums-core-v2', 'legacy-bass-v1', 'bass-core-v2']);
    for (const kit of DRUM_KITS) {
      const rack = createRackState(STARTER_RACK);
      rack.modules[0] = { ...rack.modules[0]!, sound: soundForPreset('drums', kit.id) };
      const shareable = toShareableRack(rack);
      const encoded = await serializeRack(shareable);
      expect(await deserializeRack(encoded)).toEqual(normalizeRack(shareable));
      expect(encoded.byteLength).toBeLessThanOrEqual(400);
    }
  });

  it('renders every kit/lane deterministically with finite bounded PCM, negligible DC, and distinct lane signatures', () => {
    const kitSignatures = new Set<string>();
    for (const kit of DRUM_KITS) {
      const signatures = new Set<string>();
      for (let lane = 0; lane < 8; lane += 1) {
        for (let variant = 0; variant < 2; variant += 1) {
          const first = renderProceduralDrumLane(kit.id, lane, 44_100, variant);
          const repeated = renderProceduralDrumLane(kit.id, lane, 44_100, variant);
          expect(first).toEqual(repeated);
          let finite = true;
          let peak = 0;
          let sum = 0;
          let crossings = 0;
          for (let index = 0; index < first.length; index += 1) {
            const sample = first[index]!;
            finite &&= Number.isFinite(sample);
            peak = Math.max(peak, Math.abs(sample));
            sum += sample;
            if (index > 0 && Math.sign(sample) !== Math.sign(first[index - 1]!)) crossings += 1;
          }
          expect(finite).toBe(true);
          expect(peak).toBeLessThanOrEqual(0.981);
          expect(Math.abs(sum / first.length)).toBeLessThan(0.000_001);
          if (variant === 0) signatures.add(`${first.length}:${Math.round(peak * 1_000)}:${Math.round(crossings / first.length * 10_000)}`);
        }
      }
      expect(signatures.size).toBe(8);
      const kick = renderProceduralDrumLane(kit.id, 0, 44_100, 0);
      kitSignatures.add(Array.from(kick.subarray(0, 2_048)).reduce((sum, sample, index) => sum + sample * (index + 1), 0).toFixed(5));
    }
    expect(kitSignatures.size).toBe(6);
  });

  it('chooses deterministic micro-variations and allocates no reusable lane nodes in trigger()', () => {
    const event = { startStep: 0, durationSteps: 0.5, pitch: 42, velocity: 96, lane: 6 };
    const sequence = Array.from({ length: 16 }, (_, index) => drumVariationIndex('drums-core-v2', 6, event, index));
    expect(sequence).toEqual(Array.from({ length: 16 }, (_, index) => drumVariationIndex('drums-core-v2', 6, event, index)));
    expect(new Set(sequence)).toEqual(new Set([0, 1]));
    expect(drumVelocityGain(1)).toBeLessThan(drumVelocityGain(64));
    expect(drumVelocityGain(64)).toBeLessThan(drumVelocityGain(127));
    expect(drumVelocityGain(127)).toBeLessThanOrEqual(1);
    const source = readFileSync(new URL('../../src/lib/audio/voices/procedural-drums.ts', import.meta.url), 'utf8');
    const triggerBody = source.slice(source.indexOf('  trigger(event:'), source.indexOf('  applySound('));
    expect(triggerBody).toContain('new AudioBufferSourceNode');
    expect(triggerBody).not.toMatch(/new (GainNode|BiquadFilterNode|StereoPannerNode)/u);
  });
});

describe('Phase 7.3 monophonic Bass', () => {
  const presetIds = [
    'bass-core-v2', 'bass-clean-v2', 'bass-pluck-v2', 'bass-sub-v2',
    'bass-driven-v2', 'bass-animated-v2', 'bass-square-v2', 'bass-deep-v2',
  ] as const;

  it('keeps the legacy voice and exposes eight original Bass presets through one factory identity', () => {
    const presets = presetsFor('bass');
    expect(presets.filter(({ id }) => id.startsWith('legacy-'))).toHaveLength(1);
    expect(presets.filter(({ id }) => !id.startsWith('legacy-')).map(({ id }) => id)).toEqual(presetIds);
    expect(new Set(presets.map(({ label }) => label)).size).toBe(9);
    expect(VOICE_FACTORY.identify({ type: 'bass', sound: soundForPreset('bass', 'bass-core-v2') }).implementationId).toBe('procedural-bass-v2');
    expect(VOICE_FACTORY.identify({ type: 'bass', sound: soundForPreset('bass', 'legacy-bass-v1') }).implementationId).toBe('legacy-poly-square-v1');
  });

  it('round-trips every appended Bass preset without changing earlier compact indexes', async () => {
    expect(SOUND_PRESETS.slice(0, 4).map(({ id }) => id)).toEqual(['legacy-drums-v1', 'drums-core-v2', 'legacy-bass-v1', 'bass-core-v2']);
    for (const presetId of presetIds) {
      const rack = createRackState(STARTER_RACK);
      rack.modules[1] = { ...rack.modules[1]!, sound: soundForPreset('bass', presetId) };
      const shareable = toShareableRack(rack);
      const encoded = await serializeRack(shareable);
      expect(await deserializeRack(encoded)).toEqual(normalizeRack(shareable));
      expect(encoded.byteLength).toBeLessThanOrEqual(400);
    }
  });

  it('adds measurable waveshaper harmonics while Sound Drive leaves pattern and MIDI bytes unchanged', () => {
    const curve = createBassDriveCurve(4_096);
    const sampleCount = 4_096;
    const shaped = Float32Array.from({ length: sampleCount }, (_, index) => {
      const input = Math.sin(2 * Math.PI * 8 * index / sampleCount) * 0.32;
      const position = (input + 1) / 2 * (curve.length - 1);
      const lower = Math.floor(position);
      const fraction = position - lower;
      return curve[lower]! * (1 - fraction) + curve[Math.min(curve.length - 1, lower + 1)]! * fraction;
    });
    const magnitude = (harmonic: number): number => {
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        const angle = 2 * Math.PI * 8 * harmonic * index / sampleCount;
        real += shaped[index]! * Math.cos(angle);
        imaginary -= shaped[index]! * Math.sin(angle);
      }
      return Math.hypot(real, imaginary) / sampleCount;
    };
    const upperHarmonics = Array.from({ length: 7 }, (_, index) => magnitude(index + 2)).reduce((sum, value) => sum + value, 0);
    expect(upperHarmonics / magnitude(1)).toBeGreaterThan(0.08);

    const rack = createRackState(STARTER_RACK);
    const beforePattern = modulePattern(rack.modules[1]!, rack.key, rack.modules);
    const beforeSmf = createSmfType1(rack, 4);
    const changedBass = setModuleSoundParam(rack.modules[1]!, 'drive', 100);
    const changed = { ...rack, modules: rack.modules.map((module, index) => index === 1 ? changedBass : module) };
    expect(modulePattern(changed.modules[1]!, changed.key, changed.modules)).toEqual(beforePattern);
    expect(createSmfType1(changed, 4)).toEqual(beforeSmf);
  });

  it('glides only overlapping gates, retriggers separate notes, and keeps pitch/velocity/filter mappings bounded', () => {
    expect(planBassTrigger(1, 1, 100)).toEqual({ legato: false, retrigger: true, glideSeconds: 0 });
    const legato = planBassTrigger(1.2, 1, 100);
    expect(legato.legato).toBe(true);
    expect(legato.retrigger).toBe(false);
    expect(legato.glideSeconds).toBeCloseTo(0.182, 6);
    expect(planBassTrigger(1.2, 1, 0).glideSeconds).toBeCloseTo(0.002, 6);
    expect(frequencyForBassMidi(0)).toBeGreaterThan(8);
    expect(frequencyForBassMidi(127)).toBeLessThan(13_000);
    expect(bassVelocityGain(1)).toBeLessThan(bassVelocityGain(64));
    expect(bassVelocityGain(64)).toBeLessThan(bassVelocityGain(127));
    expect(bassVelocityGain(127)).toBeLessThan(1);
    expect(bassCutoffHz(-1)).toBe(bassCutoffHz(0));
    expect(bassCutoffHz(101)).toBe(bassCutoffHz(100));
  });

  it('preallocates one persistent monophonic slot and describes actual Bass DSP in contextual help', () => {
    const source = readFileSync(new URL('../../src/lib/audio/voices/bass.ts', import.meta.url), 'utf8');
    const triggerBody = source.slice(source.indexOf('  trigger(event:'), source.indexOf('  applySound('));
    expect(triggerBody).not.toMatch(/new (OscillatorNode|GainNode|BiquadFilterNode|WaveShaperNode)/u);
    expect(source).not.toMatch(/slots|voiceIndex|stealVoice/u);
    expect(moduleHelpFor('sound:bass:drive', 'bass', 'Bass').body).toMatch(/waveshaper/u);
    expect(moduleHelpFor('sound:bass:drive', 'bass', 'Bass').body).toMatch(/MIDI velocity unchanged/u);
    expect(moduleHelpFor('param:drive', 'bass', 'Bass', GENERATORS.bass.paramSchema.find(({ key }) => key === 'drive')).body).not.toMatch(/waveshaper/u);
  });
});

describe('Phase 7.4 AudioWorklet Acid', () => {
  const presetIds = [
    'acid-core-v2', 'acid-clean-v2', 'acid-hollow-v2', 'acid-sharp-v2',
    'acid-rubber-v2', 'acid-animated-v2', 'acid-dark-v2', 'acid-driven-v2',
    'acid-liquid-v2', 'acid-short-v2', 'acid-low-v2', 'acid-bright-v2',
  ] as const;

  it('keeps legacy isolated and exposes 12 original presets through the shared factory', () => {
    const presets = presetsFor('acid');
    expect(presets.filter(({ id }) => id.startsWith('legacy-'))).toHaveLength(1);
    expect(presets.filter(({ id }) => !id.startsWith('legacy-')).map(({ id }) => id)).toEqual(presetIds);
    expect(new Set(presets.map(({ label }) => label)).size).toBe(13);
    expect(VOICE_FACTORY.identify({ type: 'acid', sound: soundForPreset('acid', 'acid-core-v2') }).implementationId).toBe('procedural-acid-v2');
    expect(VOICE_FACTORY.identify({ type: 'acid', sound: soundForPreset('acid', 'legacy-acid-v1') }).implementationId).toBe('legacy-acid-v1');
  });

  it('round-trips every appended Acid preset without moving released compact indexes', async () => {
    expect(SOUND_PRESETS.slice(0, 4).map(({ id }) => id)).toEqual(['legacy-drums-v1', 'drums-core-v2', 'legacy-bass-v1', 'bass-core-v2']);
    for (const presetId of presetIds) {
      const rack = createRackState(STARTER_RACK);
      const acid = rack.modules.find(({ type }) => type === 'acid') ?? createRackState({ ...STARTER_RACK, modules: [{ type: 'acid', seed: 0x7400_0001, params: {} }] }).modules[0]!;
      const acidWithPreset = { ...acid, sound: soundForPreset('acid', presetId) };
      const shareable = toShareableRack({ ...rack, modules: [...rack.modules, acidWithPreset] });
      const encoded = await serializeRack(shareable);
      expect(await deserializeRack(encoded)).toEqual(normalizeRack(shareable));
      expect(encoded.byteLength).toBeLessThanOrEqual(400);
    }
  });

  it('uses PolyBLEP correction and keeps extreme DSP finite, bounded, and DC-blocked at supported rates', () => {
    expect(polyBlep(0, 0.01)).toBeCloseTo(-1, 6);
    expect(polyBlep(0.5, 0.01)).toBe(0);
    expect(polyBlep(0.999, 0.01)).toBeGreaterThan(0);
    const extremes: AcidDspParams[] = [
      { wave: 0, cutoff: 0, resonance: 0, envAmount: 0, decay: 0, accent: 0, slide: 0, drive: 0 },
      { wave: 1, cutoff: 100, resonance: 100, envAmount: 100, decay: 100, accent: 100, slide: 100, drive: 100 },
    ];
    for (const rate of [8_000, 44_100, 48_000, 96_000, 192_000]) {
      expect(-Math.log(acidDcBlockCoefficient(rate)) * rate / (2 * Math.PI)).toBeCloseTo(18, 10);
      for (const params of extremes) {
        const kernel = new AcidDspKernel(rate);
        let peak = 0;
        let tailSum = 0;
        const length = Math.round(rate * 0.12);
        for (let index = 0; index < length; index += 1) {
          const sample = kernel.process(110, 1, 1, true, params);
          expect(Number.isFinite(sample)).toBe(true);
          peak = Math.max(peak, Math.abs(sample));
          if (index >= length / 2) tailSum += sample;
        }
        expect(peak).toBeLessThanOrEqual(1.2);
        expect(Math.abs(tailSum / (length / 2))).toBeLessThan(0.02);
      }
    }
  });

  it('makes accent deeper, slides only from an overlapping outgoing slide, and bounds macro mappings', () => {
    expect(acidAmplitudePeak(true, 100)).toBeGreaterThan(acidAmplitudePeak(false, 100));
    expect(acidFilterEnvelopePeak(true)).toBeGreaterThan(acidFilterEnvelopePeak(false));
    expect(acidAccentDepth(true, 100)).toBe(1);
    expect(planAcidTransition(1.2, true, 1, 100)).toEqual({ overlaps: true, glides: true, retriggers: false, glideSeconds: 0.22 });
    expect(planAcidTransition(1.2, false, 1, 100)).toEqual({ overlaps: true, glides: false, retriggers: true, glideSeconds: 0 });
    expect(planAcidTransition(1, true, 1, 100).glides).toBe(false);
    expect(acidCutoffHz(-1)).toBe(acidCutoffHz(0));
    expect(acidDecaySeconds(101)).toBe(acidDecaySeconds(100));
    expect(acidSlideSeconds(101)).toBe(acidSlideSeconds(100));
    expect(frequencyForAcidMidi(0)).toBeGreaterThan(8);
    expect(frequencyForAcidMidi(127)).toBeLessThan(13_000);
  });

  it('benchmarks 1x below 2x nonlinear processing and keeps 1x as the worklet default', () => {
    const params = soundForPreset('acid', 'acid-driven-v2').params as unknown as AcidDspParams;
    const benchmark = (oversampling: 1 | 2): number => {
      const durations = Array.from({ length: 3 }, () => {
        const kernel = new AcidDspKernel(48_000);
        const started = performance.now();
        for (let index = 0; index < 80_000; index += 1) kernel.process(55 + index % 330, 0.8, 0.7, index % 7 === 0, params, oversampling);
        return performance.now() - started;
      });
      return durations.sort((left, right) => left - right)[1]!;
    };
    benchmark(1);
    benchmark(2);
    const oneX = benchmark(1);
    const twoX = benchmark(2);
    expect(oneX).toBeLessThan(twoX);
    const source = readFileSync(new URL('../../src/lib/audio/acid.worklet.ts', import.meta.url), 'utf8');
    expect(source).toContain('this.#currentParams, 1)');
    expect(source).toContain("this.port.postMessage({ type: 'ready' })");
    expect(source).toContain('this.#soundChanges.sort');
    expect(source).not.toContain('this.#soundChanges.length = 0');
    expect(source).toContain('Math.exp(-1 / (sampleRate * 0.012))');
    expect(source).not.toContain("if (key === 'wave')");
    const dspSource = readFileSync(new URL('../../src/lib/audio/acid-dsp.ts', import.meta.url), 'utf8');
    expect(dspSource).toContain('const oscillator = saw + (square - saw) * waveMix');
    expect(dspSource).toContain('if (!Number.isFinite(blocked))');
    const bounceSource = readFileSync(new URL('../../src/lib/export/bounce.ts', import.meta.url), 'utf8');
    expect(bounceSource).toContain('await Promise.all(Array.from(voices.values(), (voice) => voice.ready))');
    expect(bounceSource).toContain('await Promise.all(Array.from(voices.values(), (voice) => voice.sync?.()))');
    expect(bounceSource).toContain('} finally {');
    expect(moduleHelpFor('sound:acid:drive', 'acid', 'Acid').body).toMatch(/before and after/u);
    expect(moduleHelpFor('param:decay', 'acid', 'Acid', GENERATORS.acid.paramSchema.find(({ key }) => key === 'decay')).body).toMatch(/MIDI note length/u);
  });
});

describe('Phase 7 sound control language', () => {
  it('uses knobs for continuous sound/mix macros while preserving discrete selectors', () => {
    for (const schema of Object.values(SOUND_PARAM_SCHEMAS)) {
      for (const definition of schema) {
        if (definition.options === undefined) expect(definition.control).toBe('knob');
        else expect(definition.control).toBe('segmented');
      }
    }
    expect(SOUND_OUTPUT_SCHEMA.every(({ control }) => control === 'knob')).toBe(true);
    expect(RACK_MIX_SCHEMA[0]?.control).toBe('select');
    expect(RACK_MIX_SCHEMA.slice(1).every(({ control }) => control === 'knob')).toBe(true);
  });
});
