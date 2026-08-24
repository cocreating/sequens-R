<script lang="ts">
  import { SCALE_NAMES, type ScaleName } from '../core/pattern';

  const ROOT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

  interface Props {
    bpm: number;
    root: number;
    scale: ScaleName;
    playing: boolean;
    onplay: () => void;
    onstop: () => void;
    onbpm: (value: number) => void;
    onbpmcommit: () => void;
    onkey: (root: number, scale: ScaleName) => void;
  }

  let { bpm, root, scale, playing, onplay, onstop, onbpm, onbpmcommit, onkey }: Props = $props();

  function numberValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
  }
</script>

<header class="transport" data-app-help-key="transport" aria-label="Transport">
  <div class="transport-buttons">
    <button type="button" class="play" data-app-help-key="play" aria-pressed={playing} onclick={onplay}>{playing ? 'Playing' : 'Play'}</button>
    <button type="button" data-app-help-key="stop" onclick={onstop}>Stop</button>
  </div>
  <div class="transport-fields">
    <label for="tempo" data-app-help-key="tempo">Tempo</label>
    <div class="tempo-field" data-app-help-key="tempo"><input id="tempo" name="tempo" type="number" min="20" max="300" step="0.1" value={bpm} oninput={(event) => onbpm(numberValue(event))} onchange={onbpmcommit} /><span>BPM</span></div>
    <label for="root" data-app-help-key="root">Root</label>
    <select id="root" name="root" data-app-help-key="root" value={root} onchange={(event) => onkey(numberValue(event), scale)}>
      {#each ROOT_NAMES as name, index}<option value={index}>{name}</option>{/each}
    </select>
    <label for="scale" data-app-help-key="scale">Scale</label>
    <select id="scale" name="scale" data-app-help-key="scale" value={scale} onchange={(event) => onkey(root, (event.currentTarget as HTMLSelectElement).value as ScaleName)}>
      {#each SCALE_NAMES as name}<option value={name}>{name}</option>{/each}
    </select>
  </div>
</header>
