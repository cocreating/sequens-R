import { describe, expect, it } from 'vitest';
import { SCALE_INTERVALS } from '../../src/lib/core/theory/scales';
import { createDefaultSound, presetsFor, soundForPreset } from '../../src/lib/audio/sound';
import {
  createSynthSaturationCurve,
  frequencyForSynthMidi,
  planSynthTrigger,
  synthAttackSeconds,
  synthCutoffHz,
  synthReleaseSeconds,
  synthVelocityGain,
} from '../../src/lib/audio/voices/synth';
import { VOICE_FACTORY } from '../../src/lib/audio/voice-factory';
import { synthGenerator } from '../../src/lib/generators/synth';
import { createModule } from '../../src/lib/state/rack';
import { moduleHelpFor } from '../../src/lib/ui/module-help';

const context = Object.freeze({ key: Object.freeze({ root: 2, scale: 'dorian' as const }), bars: 1 });

describe('Synth generator', () => {
  it('keeps all six phrase strategies deterministic, key-aware, bounded, and distinct', () => {
    const signatures = new Set<string>();
    for (let style = 0; style < 6; style += 1) {
      const params = { ...synthGenerator.defaults, style, density: 100, steps: 32 };
      const first = synthGenerator.generate(0x51a7, params, context);
      expect(synthGenerator.generate(0x51a7, params, context)).toEqual(first);
      expect(first.events.at(-1)?.pitch).toBe(62);
      expect(first.events.every((event) => event.pitch >= 0 && event.pitch <= 127 && event.velocity >= 1 && event.velocity <= 127)).toBe(true);
      expect(first.events.every((event) => SCALE_INTERVALS.dorian.includes((event.pitch - context.key.root) % 12))).toBe(true);
      expect(first.events.every((event, index) => index === 0 || event.startStep >= first.events[index - 1]!.startStep + first.events[index - 1]!.durationSteps)).toBe(true);
      signatures.add(JSON.stringify(first.events.map(({ startStep, pitch }) => [startStep, pitch])));
    }
    expect(signatures.size).toBe(6);
  });

  it('retains only the final tonic at zero density and respects range and length boundaries', () => {
    const sparse = synthGenerator.generate(42, { ...synthGenerator.defaults, density: 0, steps: 64, range: 1, octave: 2, gate: 100 }, context);
    expect(sparse.lengthSteps).toBe(64);
    expect(sparse.events).toHaveLength(1);
    expect(sparse.events[0]).toMatchObject({ startStep: 62, durationSteps: 2, pitch: 38, accent: true });
  });

  it('mutates repeatably and protects the cadence below intensity four', () => {
    const base = synthGenerator.generate(81, synthGenerator.defaults, context);
    for (const intensity of [1, 2, 3, 4] as const) {
      const first = synthGenerator.mutate(base, 81, intensity, synthGenerator.defaults, context);
      expect(synthGenerator.mutate(base, 81, intensity, synthGenerator.defaults, context)).toEqual(first);
      expect(first).not.toEqual(base);
      if (intensity < 4) expect(first.events.at(-1)).toEqual(base.events.at(-1));
    }
  });
});

describe('Synth sound contract', () => {
  it('ships eight procedural presets and one explicit factory identity', () => {
    expect(presetsFor('synth')).toHaveLength(8);
    expect(new Set(presetsFor('synth').map(({ label }) => label)).size).toBe(8);
    expect(createModule('synth', 42).sound).toEqual(createDefaultSound('synth'));
    expect(VOICE_FACTORY.identify({ type: 'synth', sound: soundForPreset('synth', 'synth-core-v2') }).implementationId).toBe('procedural-synth-v1');
  });

  it('keeps mappings finite, bounded, monotonic, and legato-only', () => {
    expect(frequencyForSynthMidi(69)).toBeCloseTo(440, 8);
    expect(synthCutoffHz(100)).toBeLessThanOrEqual(18_000);
    expect(synthCutoffHz(100)).toBeGreaterThan(synthCutoffHz(0));
    expect(synthAttackSeconds(100)).toBeCloseTo(0.25, 6);
    expect(synthReleaseSeconds(100)).toBeCloseTo(1.5, 6);
    expect(synthVelocityGain(127)).toBeGreaterThan(synthVelocityGain(1));
    expect(planSynthTrigger(0, 1, 100)).toEqual({ legato: false, retrigger: true, glideSeconds: 0 });
    expect(planSynthTrigger(1, 1, 100)).toEqual({ legato: true, retrigger: false, glideSeconds: 0.223 });
    const curve = createSynthSaturationCurve(257);
    expect(curve.every(Number.isFinite)).toBe(true);
    expect(curve[128]).toBeCloseTo(0, 6);
    expect(curve[0]).toBeCloseTo(-1, 6);
    expect(curve[256]).toBeCloseTo(1, 6);
  });

  it('provides specific generator and sound help', () => {
    expect(moduleHelpFor('param:gate', 'synth', 'Synth').body).toMatch(/MIDI gate/u);
    expect(moduleHelpFor('sound:synth:release', 'synth', 'Synth').body).toMatch(/internal voice tail/u);
  });
});
