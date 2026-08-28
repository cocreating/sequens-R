<script lang="ts">
  import { SCALE_NAMES, type ScaleName } from '../core/pattern';

  const ROOT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

  interface Props {
    bpm: number;
    root: number;
    scale: ScaleName;
    onbpm: (value: number) => void;
    onbpmcommit: () => void;
    onkey: (root: number, scale: ScaleName) => void;
  }

  let { bpm, root, scale, onbpm, onbpmcommit, onkey }: Props = $props();

  function numberValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
  }

</script>

<header class="transport" data-app-help-key="transport" aria-label="Transport">
  <div class="transport-fields">
    <div class="transport-field tempo-control" data-app-help-key="tempo">
      <label for="tempo">Tempo</label>
      <div class="tempo-field">
        <input id="tempo" name="tempo" type="number" min="20" max="300" step="1" value={bpm} oninput={(event) => onbpm(numberValue(event))} onchange={onbpmcommit} />
        <div class="tempo-slider-popover">
          <input
            id="tempo-slider"
            name="tempo-slider"
            type="range"
            min="20"
            max="300"
            step="1"
            value={bpm}
            aria-label="Adjust BPM"
            oninput={(event) => onbpm(numberValue(event))}
            onchange={onbpmcommit}
          />
        </div>
        <span>BPM</span>
      </div>
    </div>
    <div class="transport-field" data-app-help-key="root">
      <label for="root">Root</label>
      <select id="root" name="root" value={root} onchange={(event) => onkey(numberValue(event), scale)}>
        {#each ROOT_NAMES as name, index (name)}<option value={index}>{name}</option>{/each}
      </select>
    </div>
    <div class="transport-field transport-field-scale" data-app-help-key="scale">
      <label for="scale">Scale</label>
      <select id="scale" name="scale" value={scale} onchange={(event) => onkey(root, (event.currentTarget as HTMLSelectElement).value as ScaleName)}>
        {#each SCALE_NAMES as name (name)}<option value={name}>{name}</option>{/each}
      </select>
    </div>
  </div>
</header>
