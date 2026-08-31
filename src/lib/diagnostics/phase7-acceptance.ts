import type { AudioDiagnostics } from '../audio/engine';
import { DEFAULT_RACK_MIX } from '../audio/sound';
import type { ModuleType } from '../core/pattern';
import { createModule, type RackState } from '../state/rack';

export const C10_DURATION_SECONDS = 600;

const C10_MODULE_TYPES = [
  'drums', 'bass', 'acid', 'chords', 'arp', 'euclid', 'piano',
  'drums', 'bass', 'acid', 'chords', 'arp', 'euclid', 'piano', 'drums', 'synth',
] as const satisfies readonly ModuleType[];

const MODULE_LABELS: Readonly<Record<ModuleType, string>> = {
  drums: 'Drums', bass: 'Bass', acid: 'Acid', chords: 'Chords',
  arp: 'Arp', euclid: 'Euclid', piano: 'Piano', cc: 'CC', mod: 'Mod', synth: 'Synth',
};

export interface C10RunSummary {
  startedAt: string;
  durationSeconds: number;
  sampleCount: number;
  crossOriginIsolated: boolean;
  renderCapacityObserved: boolean;
  maximumAverageRenderLoad: number | null;
  peakRenderLoad: number | null;
  maximumUnderrunRatio: number | null;
  maximumLatencySeconds: number | null;
  maximumSchedulerJitterMs: number | null;
  maximumActiveVoices: number;
  droppedInternalNotes: number;
}

export interface C10ManualEvidence {
  xruns: number | null;
  uiFrameMs: number | null;
  midiJitterMs: number | null;
}

export interface Phase7ListeningEvidence {
  mixer: boolean;
  piano: boolean;
  euclid: boolean;
  finalMix: boolean;
  notes: string;
}

export interface C10Check {
  id: string;
  label: string;
  result: 'pass' | 'fail' | 'missing';
  value: string;
}

function maximum(current: number | null, candidate: number | null): number | null {
  if (candidate === null || !Number.isFinite(candidate)) return current;
  return current === null ? candidate : Math.max(current, candidate);
}

export class C10RunTracker {
  readonly #startedAtMs: number;
  readonly #startedAt: string;
  readonly #startingDroppedNotes: number;
  #sampleCount = 0;
  #crossOriginIsolated = true;
  #renderCapacityObserved = false;
  #maximumAverageRenderLoad: number | null = null;
  #peakRenderLoad: number | null = null;
  #maximumUnderrunRatio: number | null = null;
  #maximumLatencySeconds: number | null = null;
  #maximumSchedulerJitterMs: number | null = null;
  #maximumActiveVoices = 0;
  #maximumDroppedNotes: number;

  constructor(startedAtMs: number, startedAt: string, diagnostics: AudioDiagnostics, crossOriginIsolated: boolean) {
    this.#startedAtMs = startedAtMs;
    this.#startedAt = startedAt;
    this.#startingDroppedNotes = diagnostics.droppedInternalNotes;
    this.#maximumDroppedNotes = diagnostics.droppedInternalNotes;
    this.sample(diagnostics, crossOriginIsolated);
  }

  sample(diagnostics: AudioDiagnostics, crossOriginIsolated: boolean): void {
    this.#sampleCount += 1;
    this.#crossOriginIsolated &&= crossOriginIsolated;
    this.#renderCapacityObserved ||= diagnostics.renderCapacitySupported;
    this.#maximumAverageRenderLoad = maximum(this.#maximumAverageRenderLoad, diagnostics.averageRenderLoad);
    this.#peakRenderLoad = maximum(this.#peakRenderLoad, diagnostics.peakRenderLoad);
    this.#maximumUnderrunRatio = maximum(this.#maximumUnderrunRatio, diagnostics.underrunRatio);
    this.#maximumLatencySeconds = maximum(this.#maximumLatencySeconds, diagnostics.latencySeconds);
    this.#maximumSchedulerJitterMs = maximum(this.#maximumSchedulerJitterMs, diagnostics.schedulerJitterMs);
    this.#maximumActiveVoices = Math.max(this.#maximumActiveVoices, diagnostics.activeVoices);
    this.#maximumDroppedNotes = Math.max(this.#maximumDroppedNotes, diagnostics.droppedInternalNotes);
  }

  summary(nowMs: number): C10RunSummary {
    return {
      startedAt: this.#startedAt,
      durationSeconds: Math.max(0, (nowMs - this.#startedAtMs) / 1000),
      sampleCount: this.#sampleCount,
      crossOriginIsolated: this.#crossOriginIsolated,
      renderCapacityObserved: this.#renderCapacityObserved,
      maximumAverageRenderLoad: this.#maximumAverageRenderLoad,
      peakRenderLoad: this.#peakRenderLoad,
      maximumUnderrunRatio: this.#maximumUnderrunRatio,
      maximumLatencySeconds: this.#maximumLatencySeconds,
      maximumSchedulerJitterMs: this.#maximumSchedulerJitterMs,
      maximumActiveVoices: this.#maximumActiveVoices,
      droppedInternalNotes: Math.max(0, this.#maximumDroppedNotes - this.#startingDroppedNotes),
    };
  }
}

export function createC10AcceptanceRack(): RackState {
  const counts = new Map<ModuleType, number>();
  const modules = C10_MODULE_TYPES.map((type, index) => {
    const count = (counts.get(type) ?? 0) + 1;
    counts.set(type, count);
    const seed = (0xc100_0000 + Math.imul(index + 1, 0x9e37_79b9)) >>> 0;
    return { ...createModule(type, seed), name: `C10 ${MODULE_LABELS[type]} ${count}`, collapsed: index !== 0 };
  });
  return {
    bpm: 140,
    key: { root: 0, scale: 'minor' },
    modules,
    mix: structuredClone(DEFAULT_RACK_MIX),
  };
}

function measuredCheck(id: string, label: string, value: number | null, passes: (value: number) => boolean, format: (value: number) => string): C10Check {
  if (value === null) return { id, label, result: 'missing', value: 'Not recorded' };
  return { id, label, result: passes(value) ? 'pass' : 'fail', value: format(value) };
}

export function evaluateC10(summary: C10RunSummary | null, manual: C10ManualEvidence, bpm: number, moduleCount: number): C10Check[] {
  if (summary === null) return [];
  return [
    { id: 'duration', label: 'Duration ≥ 10 minutes', result: summary.durationSeconds >= C10_DURATION_SECONDS ? 'pass' : 'fail', value: `${summary.durationSeconds.toFixed(1)} s` },
    { id: 'scenario', label: '16 active modules at 140 BPM', result: bpm === 140 && moduleCount === 16 ? 'pass' : 'fail', value: `${moduleCount} modules · ${bpm.toFixed(1)} BPM` },
    { id: 'isolation', label: 'Cross-origin isolated', result: summary.crossOriginIsolated ? 'pass' : 'fail', value: summary.crossOriginIsolated ? 'Yes' : 'No' },
    measuredCheck('xruns', 'XRuns = 0', manual.xruns, (value) => value === 0, (value) => String(value)),
    measuredCheck('average-load', 'Average render load ≤ 0.5', summary.maximumAverageRenderLoad, (value) => value <= 0.5, (value) => value.toFixed(3)),
    measuredCheck('peak-load', 'Peak render load ≤ 0.8', summary.peakRenderLoad, (value) => value <= 0.8, (value) => value.toFixed(3)),
    measuredCheck('underruns', 'Underrun ratio = 0', summary.maximumUnderrunRatio, (value) => value === 0, (value) => value.toFixed(6)),
    measuredCheck('ui-frame', 'UI frame work ≤ 8 ms', manual.uiFrameMs, (value) => value <= 8, (value) => `${value.toFixed(3)} ms`),
    measuredCheck('latency', 'Audio latency < 40 ms', summary.maximumLatencySeconds, (value) => value < 0.04, (value) => `${(value * 1000).toFixed(1)} ms`),
    measuredCheck('midi-jitter', 'Physical MIDI jitter ≤ 1 ms σ', manual.midiJitterMs, (value) => value <= 1, (value) => `${value.toFixed(3)} ms σ`),
    { id: 'dropped-notes', label: 'Dropped internal notes = 0', result: summary.droppedInternalNotes === 0 ? 'pass' : 'fail', value: String(summary.droppedInternalNotes) },
  ];
}

export function formatPhase7AcceptanceReport(
  summary: C10RunSummary,
  manual: C10ManualEvidence,
  listening: Phase7ListeningEvidence,
  bpm: number,
  moduleCount: number,
  appVersion: string,
  userAgent: string,
): string {
  const checks = evaluateC10(summary, manual, bpm, moduleCount);
  const listeningChecks = [
    ['Mixer', listening.mixer],
    ['Piano', listening.piano],
    ['Euclid', listening.euclid],
    ['Final mixed starter', listening.finalMix],
  ] as const;
  return [
    '# Phase 7 acceptance report',
    '',
    `- App version: ${appVersion}`,
    `- Started: ${summary.startedAt}`,
    `- Device: ${userAgent}`,
    `- Samples: ${summary.sampleCount}`,
    '',
    '## Android C10',
    '',
    ...checks.map((check) => `- [${check.result === 'pass' ? 'x' : ' '}] ${check.label}: ${check.value}${check.result === 'missing' ? ' (missing)' : check.result === 'fail' ? ' (failed)' : ''}`),
    `- Maximum scheduler-message jitter: ${summary.maximumSchedulerJitterMs === null ? 'Not recorded' : `${summary.maximumSchedulerJitterMs.toFixed(3)} ms σ`}`,
    `- Maximum active voices: ${summary.maximumActiveVoices}`,
    `- Render Capacity API observed: ${summary.renderCapacityObserved ? 'Yes' : 'No'}`,
    '',
    '## Listening gates',
    '',
    ...listeningChecks.map(([label, accepted]) => `- [${accepted ? 'x' : ' '}] ${label}`),
    '',
    '## Listening notes',
    '',
    listening.notes.trim() || 'Not recorded.',
    '',
  ].join('\n');
}
