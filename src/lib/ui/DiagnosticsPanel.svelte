<script lang="ts">
  import type { AudioDiagnostics } from '../audio/engine';

  interface Props {
    diagnostics: AudioDiagnostics;
    crossOriginIsolated: boolean;
  }

  let { diagnostics, crossOriginIsolated }: Props = $props();
  const milliseconds = (seconds: number | null): string => seconds === null ? 'Unavailable' : `${(seconds * 1000).toFixed(1)} ms`;
  const ratio = (value: number | null): string => value === null ? 'Waiting for data' : value.toFixed(3);
  let latencyWarning = $derived(diagnostics.latencySeconds !== null && diagnostics.latencySeconds >= 0.04);
  let loadWarning = $derived(diagnostics.peakRenderLoad !== null && diagnostics.peakRenderLoad > 0.8);
</script>

<details class="diagnostics-panel" data-render-capacity-supported={diagnostics.renderCapacitySupported}>
  <summary>Diagnostics</summary>
  <dl>
    <div><dt>Audio state</dt><dd>{diagnostics.state}</dd></div>
    <div><dt>Output latency</dt><dd class:warning={latencyWarning}>{milliseconds(diagnostics.latencySeconds)}</dd></div>
    <div><dt>Scheduler jitter</dt><dd>{diagnostics.schedulerJitterMs === null ? 'Waiting for data' : `${diagnostics.schedulerJitterMs.toFixed(3)} ms σ`}</dd></div>
    <div><dt>Active voices</dt><dd>{diagnostics.activeVoices}</dd></div>
    <div><dt>Average render load</dt><dd>{diagnostics.renderCapacitySupported ? ratio(diagnostics.averageRenderLoad) : 'Unsupported · fixed voice ceiling'}</dd></div>
    <div><dt>Peak render load</dt><dd class:warning={loadWarning}>{diagnostics.renderCapacitySupported ? ratio(diagnostics.peakRenderLoad) : 'Unsupported'}</dd></div>
    <div><dt>Underrun ratio</dt><dd>{diagnostics.renderCapacitySupported ? ratio(diagnostics.underrunRatio) : 'Unsupported'}</dd></div>
    <div><dt>Cross-origin isolated</dt><dd>{crossOriginIsolated ? 'Yes' : 'No'}</dd></div>
  </dl>
  {#if latencyWarning}<p class="diagnostic-warning">Output latency exceeds the 40 ms reference budget.</p>{/if}
  {#if loadWarning}<p class="diagnostic-warning">Audio render load is above 0.8. Mute modules or reduce polyphony.</p>{/if}
  {#if !diagnostics.renderCapacitySupported}<p class="diagnostic-note">Render Capacity API is unavailable; the fixed 16-module voice ceiling remains active.</p>{/if}
</details>
