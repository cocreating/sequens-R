<script lang="ts">
  import Icon from './Icon.svelte';
  import { onDestroy } from 'svelte';
  import type { AudioDiagnostics } from '../audio/engine';
  import {
    C10_DURATION_SECONDS,
    C10RunTracker,
    evaluateC10,
    formatPhase7AcceptanceReport,
    type C10ManualEvidence,
    type C10RunSummary,
    type Phase7ListeningEvidence,
  } from '../diagnostics/phase7-acceptance';

  interface Props {
    diagnostics: AudioDiagnostics;
    crossOriginIsolated: boolean;
    bpm: number;
    moduleCount: number;
    playing: boolean;
    onpreparec10: () => void;
  }

  let { diagnostics, crossOriginIsolated, bpm, moduleCount, playing, onpreparec10 }: Props = $props();
  const milliseconds = (seconds: number | null): string => seconds === null ? 'Unavailable' : `${(seconds * 1000).toFixed(1)} ms`;
  const ratio = (value: number | null): string => value === null ? 'Waiting for data' : value.toFixed(3);
  let latencyWarning = $derived(diagnostics.latencySeconds !== null && diagnostics.latencySeconds >= 0.04);
  let loadWarning = $derived(diagnostics.peakRenderLoad !== null && diagnostics.peakRenderLoad > 0.8);
  let tracker: C10RunTracker | null = null;
  let timer: number | null = null;
  let running = $state(false);
  let summary = $state<C10RunSummary | null>(null);
  let manual = $state<C10ManualEvidence>({ xruns: null, uiFrameMs: null, midiJitterMs: null });
  let listening = $state<Phase7ListeningEvidence>({ mixer: false, piano: false, euclid: false, finalMix: false, notes: '' });
  let reportStatus = $state('');
  let checks = $derived(evaluateC10(summary, manual, bpm, moduleCount));
  let c10Passed = $derived(checks.length > 0 && checks.every(({ result }) => result === 'pass'));
  let listeningPassed = $derived(listening.mixer && listening.piano && listening.euclid && listening.finalMix);
  let elapsedSeconds = $derived(summary?.durationSeconds ?? 0);
  let correctScenario = $derived(moduleCount === 16 && bpm === 140);

  onDestroy(() => {
    if (timer !== null) window.clearTimeout(timer);
  });

  function metric(value: string): number | null {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function updateRun(): void {
    if (!running || tracker === null) return;
    if (!playing || !correctScenario) {
      stopRun();
      reportStatus = 'C10 run stopped because transport or the fixed rack scenario changed.';
      return;
    }
    tracker.sample(diagnostics, crossOriginIsolated);
    summary = tracker.summary(performance.now());
    if (summary.durationSeconds >= C10_DURATION_SECONDS) {
      stopRun();
      reportStatus = 'Ten-minute C10 run completed. Add the physical measurements, listening decisions, and copy the report.';
      return;
    }
    timer = window.setTimeout(updateRun, 1000);
  }

  function startRun(): void {
    if (!playing || !correctScenario) return;
    reportStatus = '';
    tracker = new C10RunTracker(performance.now(), new Date().toISOString(), diagnostics, crossOriginIsolated);
    summary = tracker.summary(performance.now());
    running = true;
    timer = window.setTimeout(updateRun, 1000);
  }

  function stopRun(): void {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (tracker !== null) {
      tracker.sample(diagnostics, crossOriginIsolated);
      summary = tracker.summary(performance.now());
    }
    running = false;
  }

  function prepareC10(): void {
    stopRun();
    tracker = null;
    summary = null;
    reportStatus = '';
    onpreparec10();
  }

  async function copyReport(): Promise<void> {
    if (summary === null) return;
    const report = formatPhase7AcceptanceReport(summary, manual, listening, bpm, moduleCount, __APP_VERSION__, navigator.userAgent);
    try {
      await navigator.clipboard.writeText(report);
      reportStatus = 'Phase 7 acceptance report copied.';
    } catch {
      reportStatus = 'The report could not be copied. Check clipboard permission.';
    }
  }
</script>

<details class="diagnostics-panel" data-app-help-key="diagnostics" data-render-capacity-supported={diagnostics.renderCapacitySupported}>
  <summary>Diagnostics</summary>
  <dl>
    <div><dt>Audio state</dt><dd>{diagnostics.state}</dd></div>
    <div><dt>Output latency</dt><dd class:warning={latencyWarning}>{milliseconds(diagnostics.latencySeconds)}</dd></div>
    <div><dt>Scheduler jitter</dt><dd>{diagnostics.schedulerJitterMs === null ? 'Waiting for data' : `${diagnostics.schedulerJitterMs.toFixed(3)} ms σ`}</dd></div>
    <div><dt>Active voices</dt><dd>{diagnostics.activeVoices} / {diagnostics.voiceBudget}</dd></div>
    <div><dt>Dropped internal notes</dt><dd>{diagnostics.droppedInternalNotes}</dd></div>
    <div><dt>Average render load</dt><dd>{diagnostics.renderCapacitySupported ? ratio(diagnostics.averageRenderLoad) : 'Unsupported · fixed voice ceiling'}</dd></div>
    <div><dt>Peak render load</dt><dd class:warning={loadWarning}>{diagnostics.renderCapacitySupported ? ratio(diagnostics.peakRenderLoad) : 'Unsupported'}</dd></div>
    <div><dt>Underrun ratio</dt><dd>{diagnostics.renderCapacitySupported ? ratio(diagnostics.underrunRatio) : 'Unsupported'}</dd></div>
    <div><dt>Cross-origin isolated</dt><dd>{crossOriginIsolated ? 'Yes' : 'No'}</dd></div>
  </dl>
  {#if latencyWarning}<p class="diagnostic-warning">Output latency exceeds the 40 ms reference budget.</p>{/if}
  {#if loadWarning}<p class="diagnostic-warning">Audio render load is above 0.8. Mute modules or reduce polyphony.</p>{/if}
  {#if !diagnostics.renderCapacitySupported}<p class="diagnostic-note">Render Capacity API is unavailable; the adaptive live voice budget remains active.</p>{/if}

  <section class="phase7-acceptance" aria-labelledby="phase7-acceptance-heading">
    <div>
      <h3 id="phase7-acceptance-heading">Phase 7 acceptance</h3>
      <p>Prepare the fixed rack, start transport, then record ten uninterrupted minutes on the reference Android device.</p>
    </div>
    <div class="acceptance-actions">
      <button type="button" onclick={prepareC10} disabled={playing || running}>Prepare 16-module C10 rack</button>
      {#if running}
        <button type="button" onclick={stopRun}>Stop run</button>
      {:else}
        <button type="button" onclick={startRun} disabled={!playing || !correctScenario}>Start 10-minute run</button>
      {/if}
      <button type="button" onclick={() => void copyReport()} disabled={summary === null}>Copy report</button>
    </div>
    {#if !correctScenario}<p class="diagnostic-note">Prepare the fixed 16-module rack at 140 BPM before starting.</p>{/if}
    {#if correctScenario && !playing}<p class="diagnostic-note">Start transport, reopen Diagnostics, and begin the C10 run.</p>{/if}
    {#if summary !== null}
      <label class="acceptance-progress" for="c10-progress">C10 duration <span>{elapsedSeconds.toFixed(1)} / {C10_DURATION_SECONDS} s</span></label>
      <progress id="c10-progress" max={C10_DURATION_SECONDS} value={Math.min(C10_DURATION_SECONDS, elapsedSeconds)}></progress>
    {/if}

    <fieldset>
      <legend>Physical measurements</legend>
      <label for="c10-xruns">XRuns<input id="c10-xruns" type="number" min="0" step="1" value={manual.xruns ?? ''} oninput={(event) => { manual.xruns = metric(event.currentTarget.value); }} /></label>
      <label for="c10-ui-frame">UI frame work (ms)<input id="c10-ui-frame" type="number" min="0" step="0.001" value={manual.uiFrameMs ?? ''} oninput={(event) => { manual.uiFrameMs = metric(event.currentTarget.value); }} /></label>
      <label for="c10-midi-jitter">Physical MIDI jitter σ (ms)<input id="c10-midi-jitter" type="number" min="0" step="0.001" value={manual.midiJitterMs ?? ''} oninput={(event) => { manual.midiJitterMs = metric(event.currentTarget.value); }} /></label>
    </fieldset>

    {#if checks.length > 0}
      <ul class="acceptance-checks" aria-label="C10 acceptance checks">
        {#each checks as check (check.id)}
          <li data-result={check.result}><span class="diagnostic-result-icon" aria-hidden="true">{#if check.result === 'pass'}<Icon name="check" />{:else if check.result === 'fail'}<Icon name="x-mark" />{:else}<Icon name="minus" />{/if}</span><span>{check.label}</span><data>{check.value}</data></li>
        {/each}
      </ul>
      <p class:acceptance-pass={c10Passed} class:diagnostic-warning={!c10Passed}>{c10Passed ? 'Android C10 evidence passes every recorded budget.' : 'Android C10 remains open until every check passes.'}</p>
    {/if}

    <fieldset class="listening-gates">
      <legend>Listening gates</legend>
      <label><input type="checkbox" checked={listening.mixer} onchange={(event) => { listening.mixer = event.currentTarget.checked; }} /> Mixer</label>
      <label><input type="checkbox" checked={listening.piano} onchange={(event) => { listening.piano = event.currentTarget.checked; }} /> Piano</label>
      <label><input type="checkbox" checked={listening.euclid} onchange={(event) => { listening.euclid = event.currentTarget.checked; }} /> Euclid</label>
      <label><input type="checkbox" checked={listening.finalMix} onchange={(event) => { listening.finalMix = event.currentTarget.checked; }} /> Final mixed starter</label>
      <label class="listening-notes" for="phase7-listening-notes">Listening notes<textarea id="phase7-listening-notes" rows="4" value={listening.notes} oninput={(event) => { listening.notes = event.currentTarget.value; }}></textarea></label>
    </fieldset>
    <p class:acceptance-pass={listeningPassed} class:diagnostic-warning={!listeningPassed}>{listeningPassed ? 'All listening decisions are recorded.' : 'Listening acceptance remains open.'}</p>
    <p class="diagnostic-note">Checks are local evidence only. Copy the report into the Phase 7 document after verifying the device and listening results.</p>
    <p class="acceptance-status" aria-live="polite">{reportStatus}</p>
  </section>
</details>
