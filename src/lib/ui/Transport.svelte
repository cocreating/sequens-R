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

<div class="transport" data-app-help-key="transport" role="group" aria-label="Transport">
  <div class="transport-fields">
    <button type="button" class="transport-trigger header-tap" data-app-help-key="tap-tempo" aria-label="Tap BPM" onclick={ontap}>TAB</button>
    <button type="button" class="transport-trigger icon-only" data-app-help-key="tempo" aria-label={`Tempo ${Math.round(bpm)} BPM`} aria-haspopup="dialog" popovertarget="tempo-controls">
      <Icon name="clock" />
    </button>
    <button type="button" class="transport-trigger icon-only" data-app-help-key="root" aria-label={`Root ${ROOT_NAMES[root] ?? ROOT_NAMES[0]}`} aria-haspopup="dialog" popovertarget="root-controls">
      <Icon name="musical-note" />
    </button>
    <button type="button" class="transport-trigger icon-only" data-app-help-key="scale" aria-label={`Scale ${scale}`} aria-haspopup="dialog" popovertarget="scale-controls">
      <Icon name="bars-3" />
    </button>
  </div>

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

  <div id="root-controls" class="transport-popover" popover role="dialog" aria-labelledby="root-controls-heading">
    <div class="transport-popover-heading">
      <div>
        <p>Musical context</p>
        <h2 id="root-controls-heading">Root note</h2>
      </div>
      <button type="button" class="icon-only" aria-label="Close root controls" popovertarget="root-controls" popovertargetaction="hide"><Icon name="x-mark" /></button>
    </div>
    <div class="transport-option-grid root-option-grid" role="group" aria-label="Root note">
      {#each ROOT_NAMES as name, index (name)}
        <button type="button" aria-pressed={root === index} popovertarget="root-controls" popovertargetaction="hide" onclick={() => onkey(index, scale)}>{name}</button>
      {/each}
    </div>
  </div>

  <div id="scale-controls" class="transport-popover scale-popover" popover role="dialog" aria-labelledby="scale-controls-heading">
    <div class="transport-popover-heading">
      <div>
        <p>Musical context</p>
        <h2 id="scale-controls-heading">Scale</h2>
      </div>
      <button type="button" class="icon-only" aria-label="Close scale controls" popovertarget="scale-controls" popovertargetaction="hide"><Icon name="x-mark" /></button>
    </div>
    <div class="transport-option-grid scale-option-grid" role="group" aria-label="Scale">
      {#each SCALE_NAMES as name (name)}
        <button type="button" aria-pressed={scale === name} popovertarget="scale-controls" popovertargetaction="hide" onclick={() => onkey(root, name)}>{name}</button>
      {/each}
    </div>
  </div>
</div>
