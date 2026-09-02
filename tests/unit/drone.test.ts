import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCALE_INTERVALS } from '../../src/lib/core/theory/scales';
import { createDefaultSound, presetsFor, soundForPreset } from '../../src/lib/audio/sound';
import {
  droneAttackSeconds,
  droneCutoffHz,
  droneHarmonicRatio,
  droneMotionSeconds,
  droneReleaseSeconds,
  droneVelocityGain,
  frequencyForDroneMidi,
} from '../../src/lib/audio/voices/drone';
import { VOICE_FACTORY } from '../../src/lib/audio/voice-factory';
import { DRONE_BAR_OPTIONS, droneGenerator } from '../../src/lib/generators/drone';
import { createSmfType1 } from '../../src/lib/export/smf';
import { createModule, createRackState, modulePattern, setModuleSoundParam } from '../../src/lib/state/rack';
import { moduleHelpFor } from '../../src/lib/ui/module-help';

const context = Object.freeze({ key: Object.freeze({ root: 2, scale: 'dorian' as const }), bars: 1 });

describe('Drone generator', () => {
  it('keeps all six fields deterministic, distinct, key-aware, and continuously covered', () => {
    const signatures = new Set<string>();
    for (let field = 0; field < 6; field += 1) {
      const params = { ...droneGenerator.defaults, field, bars: 3, voices: 4, change: 100, tension: 64 };
      const first = droneGenerator.generate(0xd20f_51a7, params, context);
      expect(droneGenerator.generate(0xd20f_51a7, params, context)).toEqual(first);
      expect(first.lengthSteps).toBe(DRONE_BAR_OPTIONS[3] * 16);
      expect(first.events.every((event) => event.pitch >= 0 && event.pitch <= 127 && event.velocity >= 1 && event.velocity <= 127)).toBe(true);
      expect(first.events.every((event) => SCALE_INTERVALS.dorian.includes((event.pitch - context.key.root + 120) % 12))).toBe(true);
      for (let lane = 0; lane < params.voices; lane += 1) {
        const events = first.events.filter((event) => event.lane === lane).sort((left, right) => left.startStep - right.startStep);
        expect(events[0]?.startStep).toBe(0);
        let coveredUntil = 0;
        for (const event of events) {
          expect(event.startStep).toBe(coveredUntil);
          coveredUntil += event.durationSteps;
        }
        expect(coveredUntil).toBe(first.lengthSteps);
      }
      signatures.add(JSON.stringify(first.events.map(({ startStep, durationSteps, pitch, lane }) => [lane, startStep, durationSteps, pitch])));
    }
    expect(signatures.size).toBe(6);
  });

  it('keeps one full-cycle tonic anchor and makes zero-change fields fully sustained', () => {
    const pattern = droneGenerator.generate(42, { ...droneGenerator.defaults, bars: 0, voices: 4, change: 0 }, context);
    expect(pattern.lengthSteps).toBe(16);
    expect(pattern.events).toHaveLength(4);
    expect(pattern.events.find((event) => event.lane === 0)).toMatchObject({ startStep: 0, durationSteps: 16, pitch: 50, accent: true });
    expect(pattern.events.every((event) => event.startStep === 0 && event.durationSteps === 16)).toBe(true);
  });

  it('mutates repeatably while protecting the anchor below intensity four', () => {
    const params = { ...droneGenerator.defaults, change: 100 };
    const base = droneGenerator.generate(81, params, context);
    const anchor = base.events.filter((event) => event.lane === 0);
    for (const intensity of [1, 2, 3, 4] as const) {
      const first = droneGenerator.mutate(base, 81, intensity, params, context);
      expect(droneGenerator.mutate(base, 81, intensity, params, context)).toEqual(first);
      expect(first).not.toEqual(base);
      if (intensity < 4) expect(first.events.filter((event) => event.lane === 0)).toEqual(anchor);
    }
  });
});

describe('Drone sound contract', () => {
  it('ships eight procedural presets and one explicit factory identity', () => {
    expect(presetsFor('drone')).toHaveLength(8);
    expect(new Set(presetsFor('drone').map(({ label }) => label)).size).toBe(8);
    expect(createModule('drone', 42).sound).toEqual(createDefaultSound('drone'));
    expect(VOICE_FACTORY.identify({ type: 'drone', sound: soundForPreset('drone', 'drone-core-v1') }).implementationId).toBe('procedural-drone-v1');
  });

  it('keeps pitch, envelopes, motion, and timbre mappings finite and bounded', () => {
    expect(frequencyForDroneMidi(69)).toBeCloseTo(440, 8);
    expect(droneCutoffHz(100)).toBeLessThanOrEqual(14_000);
    expect(droneCutoffHz(100)).toBeGreaterThan(droneCutoffHz(0));
    expect(droneAttackSeconds(100)).toBe(6);
    expect(droneReleaseSeconds(100)).toBe(10);
    expect(droneMotionSeconds(100)).toBe(4);
    expect(droneVelocityGain(127)).toBeGreaterThan(droneVelocityGain(1));
    expect([0, 1, 2, 3].map(droneHarmonicRatio)).toEqual([1, 1.004, 2.006, 3.008]);
  });

  it('preallocates four persistent lanes and provides module-specific help', () => {
    const source = readFileSync(new URL('../../src/lib/audio/voices/drone.ts', import.meta.url), 'utf8');
    const triggerBody = source.slice(source.indexOf('  trigger(event:'), source.indexOf('  applySound('));
    expect(triggerBody).not.toMatch(/new (OscillatorNode|AudioBufferSourceNode|GainNode|BiquadFilterNode|StereoPannerNode)/u);
    expect(moduleHelpFor('param:change', 'drone', 'Drone').body).toMatch(/outgoing MIDI/u);
    expect(moduleHelpFor('sound:drone:motion', 'drone', 'Drone').body).toMatch(/internal monitoring only/u);
  });

  it('keeps sound motion independent from generated notes and exported MIDI', () => {
    const module = createModule('drone', 0xd20f_51a7);
    const rack = createRackState({ bpm: 84, key: context.key, modules: [{ type: 'drone', seed: module.seed, params: module.params }] });
    const beforePattern = modulePattern(rack.modules[0]!, rack.key, rack.modules);
    const beforeMidi = createSmfType1(rack, 8);
    rack.modules[0] = setModuleSoundParam(rack.modules[0]!, 'motion', 100);
    expect(modulePattern(rack.modules[0]!, rack.key, rack.modules)).toEqual(beforePattern);
    expect(createSmfType1(rack, 8)).toEqual(beforeMidi);
  });
});
