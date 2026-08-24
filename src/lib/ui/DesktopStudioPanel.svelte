<script lang="ts">
  interface Props {
    audioOutputs: readonly MediaDeviceInfo[];
    selectedOutputId: string;
    outputSelectionSupported: boolean;
    onrefreshoutputs: () => void;
    onselectoutput: (deviceId: string) => void;
  }

  let { audioOutputs, selectedOutputId, outputSelectionSupported, onrefreshoutputs, onselectoutput }: Props = $props();
</script>

<aside class="desktop-studio-panel" aria-labelledby="desktop-studio-heading">
  <div>
    <p class="eyebrow">Desktop studio</p>
    <h2 id="desktop-studio-heading">Output & shortcuts</h2>
  </div>
  <div class="audio-output-control">
    <label for="audio-output">Internal audio out</label>
    <select id="audio-output" value={selectedOutputId} disabled={!outputSelectionSupported} onchange={(event) => onselectoutput(event.currentTarget.value)}>
      <option value="">System default</option>
      {#each audioOutputs as output (output.deviceId)}
        <option value={output.deviceId}>{output.label || `Audio output ${output.deviceId.slice(0, 6)}`}</option>
      {/each}
    </select>
    <button type="button" onclick={onrefreshoutputs} disabled={!outputSelectionSupported}>Refresh outputs</button>
    {#if !outputSelectionSupported}<p>Audio output selection is unavailable; the system default remains active.</p>{/if}
  </div>
  <details>
    <summary>Keyboard shortcuts</summary>
    <dl class="shortcut-list">
      <div><dt><kbd>Space</kbd></dt><dd>Play / stop</dd></div>
      <div><dt><kbd>R</kbd></dt><dd>Randomize</dd></div>
      <div><dt><kbd>⌘/Ctrl Z</kbd></dt><dd>Undo</dd></div>
      <div><dt><kbd>⇧ ⌘/Ctrl Z</kbd></dt><dd>Redo</dd></div>
      <div><dt><kbd>⌘/Ctrl S</kbd></dt><dd>Save</dd></div>
      <div><dt><kbd>[</kbd> / <kbd>]</kbd></dt><dd>Previous / next rack</dd></div>
    </dl>
  </details>
</aside>
