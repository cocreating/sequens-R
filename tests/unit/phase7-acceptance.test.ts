import { describe, expect, it } from 'vitest';
import type { AudioDiagnostics } from '../../src/lib/audio/engine';
import {
  C10_DURATION_SECONDS,
  C10RunTracker,
  createC10AcceptanceRack,
  evaluateC10,
  formatPhase7AcceptanceReport,
} from '../../src/lib/diagnostics/phase7-acceptance';

function diagnostics(overrides: Partial<AudioDiagnostics> = {}): AudioDiagnostics {
  return {
    state: 'running',
    latencySeconds: 0.02,
    schedulerJitterMs: 0.1,
    activeVoices: 12,
    renderCapacitySupported: true,
    averageRenderLoad: 0.28,
    peakRenderLoad: 0.52,
    underrunRatio: 0,
    voiceBudget: 32,
    droppedInternalNotes: 4,
    masterMeter: { peakDbfs: -3, rmsDbfs: -18 },
    moduleMeters: {},
    ...overrides,
  };
}

describe('Phase 7 physical acceptance harness', () => {
  it('builds the fixed deterministic 16-module/140 BPM rack', () => {
    const first = createC10AcceptanceRack();
    const second = createC10AcceptanceRack();
    expect(first.bpm).toBe(140);
    expect(first.modules).toHaveLength(16);
    expect(first.modules.every(({ monitor, mute }) => monitor && !mute)).toBe(true);
    expect(first.modules.map(({ type, seed }) => ({ type, seed }))).toEqual(second.modules.map(({ type, seed }) => ({ type, seed })));
    expect(new Set(first.modules.map(({ seed }) => seed)).size).toBe(16);
  });

  it('retains worst observed automatic metrics and counts only newly dropped notes', () => {
    const tracker = new C10RunTracker(1_000, '2026-08-28T10:00:00.000Z', diagnostics(), true);
    tracker.sample(diagnostics({
      latencySeconds: 0.031,
      schedulerJitterMs: 0.42,
      activeVoices: 27,
      averageRenderLoad: 0.41,
      peakRenderLoad: 0.73,
      underrunRatio: 0,
      droppedInternalNotes: 6,
    }), true);
    const summary = tracker.summary(1_000 + C10_DURATION_SECONDS * 1000);
    expect(summary.durationSeconds).toBe(C10_DURATION_SECONDS);
    expect(summary.sampleCount).toBe(2);
    expect(summary.maximumAverageRenderLoad).toBe(0.41);
    expect(summary.peakRenderLoad).toBe(0.73);
    expect(summary.maximumLatencySeconds).toBe(0.031);
    expect(summary.maximumSchedulerJitterMs).toBe(0.42);
    expect(summary.maximumActiveVoices).toBe(27);
    expect(summary.droppedInternalNotes).toBe(2);
  });

  it('evaluates every C10 budget and exports explicit listening evidence', () => {
    const tracker = new C10RunTracker(0, '2026-08-28T10:00:00.000Z', diagnostics({ droppedInternalNotes: 0 }), true);
    const summary = tracker.summary(C10_DURATION_SECONDS * 1000);
    const manual = { xruns: 0, uiFrameMs: 7.5, midiJitterMs: 0.8 };
    const checks = evaluateC10(summary, manual, 140, 16);
    expect(checks.every(({ result }) => result === 'pass')).toBe(true);
    const report = formatPhase7AcceptanceReport(
      summary,
      manual,
      { mixer: true, piano: true, euclid: false, finalMix: false, notes: 'Piano approved; Euclid needs another pass.' },
      140,
      16,
      '0.0.1',
      'Android reference device',
    );
    expect(report).toContain('- [x] Mixer');
    expect(report).toContain('- [ ] Euclid');
    expect(report).toContain('Android reference device');
    expect(report).toContain('Piano approved; Euclid needs another pass.');
  });

  it('marks unsupported or unrecorded device metrics as missing', () => {
    const tracker = new C10RunTracker(0, '2026-08-28T10:00:00.000Z', diagnostics({
      renderCapacitySupported: false,
      averageRenderLoad: null,
      peakRenderLoad: null,
      underrunRatio: null,
      latencySeconds: null,
    }), true);
    const checks = evaluateC10(tracker.summary(C10_DURATION_SECONDS * 1000), { xruns: null, uiFrameMs: null, midiJitterMs: null }, 140, 16);
    expect(checks.filter(({ result }) => result === 'missing').map(({ id }) => id).sort()).toEqual([
      'average-load', 'latency', 'midi-jitter', 'peak-load', 'ui-frame', 'underruns', 'xruns',
    ]);
  });
});
