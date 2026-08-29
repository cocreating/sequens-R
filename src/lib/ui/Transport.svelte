<script lang="ts">
  import { SCALE_NAMES, type ScaleName } from '../core/pattern';
  import Icon from './Icon.svelte';

  const ROOT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

  interface Props {
    bpm: number;
    root: number;
    scale: ScaleName;
    ontap: () => void;
    onbpm: (value: number) => void;
    onbpmcommit: () => void;
    onkey: (root: number, scale: ScaleName) => void;
  }

  let { bpm, root, scale, ontap, onbpm, onbpmcommit, onkey }: Props = $props();

  function numberValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="transport-fields" data-app-help-key="transport" role="group" aria-label="Transport">
  <button type="button" class="transport-trigger header-tap" data-app-help-key="tap-tempo" aria-label="Tap BPM" onclick={ontap}>TAB</button>
  <button type="button" class="transport-trigger icon-only" data-app-help-key="tempo" aria-label={`Tempo ${Math.round(bpm)} BPM`} aria-haspopup="dialog" popovertarget="tempo-controls">
    <Icon name="clock" />
  </button>
  <button type="button" class="transport-trigger icon-only" data-app-help-key="key" aria-label={`Key ${ROOT_NAMES[root] ?? ROOT_NAMES[0]} ${scale}`} aria-haspopup="dialog" popovertarget="key-controls">
    <Icon name="musical-note" />
  </button>

  <div id="tempo-controls" class="transport-popover tempo-popover" popover role="dialog" aria-labelledby="tempo-controls-heading">
    <div class="transport-popover-heading">
      <div>
        <p>Transport</p>
        <h2 id="tempo-controls-heading">Tempo</h2>
      </div>
      <button type="button" class="icon-only" aria-label="Close tempo controls" popovertarget="tempo-controls" popovertargetaction="hide"><Icon name="x-mark" /></button>
    </div>
    <div class="tempo-panel-controls">
      <div class="tempo-number-field">
        <label for="tempo">Tempo</label>
        <input id="tempo" name="tempo" type="number" min="20" max="300" step="1" value={bpm} oninput={(event) => onbpm(numberValue(event))} onchange={onbpmcommit} />
        <span>BPM</span>
      </div>
      <input id="tempo-slider" name="tempo-slider" type="range" min="20" max="300" step="1" value={bpm} aria-label="Adjust BPM" oninput={(event) => onbpm(numberValue(event))} onchange={onbpmcommit} />
    </div>
  </div>

  <div id="key-controls" class="transport-popover key-popover" popover role="dialog" aria-labelledby="key-controls-heading">
    <div class="transport-popover-heading">
      <div>
        <p>Musical context</p>
        <h2 id="key-controls-heading">Root &amp; scale</h2>
      </div>
      <button type="button" class="icon-only" aria-label="Close key controls" popovertarget="key-controls" popovertargetaction="hide"><Icon name="x-mark" /></button>
    </div>
    <div class="key-controls-grid">
      <div class="key-control-group">
        <h3>Root note</h3>
        <div class="transport-option-grid root-option-grid" role="group" aria-label="Root note">
          {#each ROOT_NAMES as name, index (name)}
            <button type="button" aria-pressed={root === index} onclick={() => onkey(index, scale)}>{name}</button>
          {/each}
        </div>
      </div>
      <div class="key-control-group">
        <h3>Scale</h3>
        <div class="transport-option-grid scale-option-grid" role="group" aria-label="Scale">
          {#each SCALE_NAMES as name (name)}
            <button type="button" aria-pressed={scale === name} onclick={() => onkey(root, name)}>{name}</button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
