<script lang="ts">
  import Icon from './Icon.svelte';
  interface Props {
    audioOutputs: readonly MediaDeviceInfo[];
    selectedOutputId: string;
    outputSelectionSupported: boolean;
    onrefreshoutputs: () => void;
    onselectoutput: (deviceId: string) => void;
  }

  let { audioOutputs, selectedOutputId, outputSelectionSupported, onrefreshoutputs, onselectoutput }: Props = $props();
</script>

<aside class="desktop-studio-panel" data-app-help-key="desktop-output" aria-labelledby="desktop-studio-heading">
  <div>
    <p class="eyebrow">Desktop studio</p>
    <h2 id="desktop-studio-heading">Output & shortcuts</h2>
  </div>
  <div class="audio-output-control">
    <label for="audio-output" data-app-help-key="audio-output">Internal audio out</label>
    <select id="audio-output" data-app-help-key="audio-output" value={selectedOutputId} disabled={!outputSelectionSupported} onchange={(event) => onselectoutput(event.currentTarget.value)}>
      <option value="">System default</option>
      {#each audioOutputs as output (output.deviceId)}
        <option value={output.deviceId}>{output.label || `Audio output ${output.deviceId.slice(0, 6)}`}</option>
      {/each}
    </select>
    <button type="button" class="has-icon icon-only" data-app-help-key="refresh-outputs" aria-label="Refresh outputs" onclick={onrefreshoutputs} disabled={!outputSelectionSupported}><Icon name="arrow-path" /></button>
    {#if !outputSelectionSupported}<p>Audio output selection is unavailable; the system default remains active.</p>{/if}
  </div>
  <details data-app-help-key="shortcuts">
    <summary>Keyboard shortcuts</summary>
    <dl class="shortcut-list">
      <div><dt><kbd>Space</kbd></dt><dd>Play / pause</dd></div>
      <div><dt><kbd>R</kbd></dt><dd>Randomize</dd></div>
      <div><dt><kbd>⌘/Ctrl Z</kbd></dt><dd>Undo</dd></div>
      <div><dt><kbd>⇧ ⌘/Ctrl Z</kbd></dt><dd>Redo</dd></div>
      <div><dt><kbd>⌘/Ctrl S</kbd></dt><dd>Save</dd></div>
      <div><dt><kbd>[</kbd> / <kbd>]</kbd></dt><dd>Previous / next rack</dd></div>
    </dl>
  </details>
</aside>
