<script lang="ts">
  import type { Pattern } from '../core/pattern';
  import CompositorPlayhead from './CompositorPlayhead.svelte';

  interface Props {
    pattern: Pattern;
    syncBeat?: number | null;
    playing: boolean;
    bpm: number;
    editable?: boolean;
    laneLabels?: readonly string[];
    ontoggle?: (lane: number, step: number) => void;
  }

  let { pattern, syncBeat = null, playing, bpm, editable = false, laneLabels = [], ontoggle }: Props = $props();
  let lanes = $derived(Math.max(laneLabels.length, 1, ...pattern.events.map((event) => (event.lane ?? 0) + 1)));

  function isActive(lane: number, step: number): boolean {
    return pattern.events.some((event) => (event.lane ?? 0) === lane && Math.floor(event.startStep) === step);
  }

</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access to the horizontal scroll region) -->
<div class="step-grid" data-help-key="step-grid" style:--step-count={pattern.lengthSteps} role="group" tabindex="0" aria-label="Pattern steps">
  <div class="step-grid-content">
    {#if laneLabels.length > 0}
      <div class="step-lane-labels" aria-hidden="true">
        {#each Array(lanes) as _, lane}<span>{laneLabels[lane] ?? `Lane ${lane + 1}`}</span>{/each}
      </div>
    {/if}
    <div class="step-grid-sequence">
      <CompositorPlayhead {playing} {bpm} beats={pattern.lengthSteps / pattern.stepsPerBeat} {syncBeat} />
      {#each Array(lanes) as _, lane}
        <div class="step-lane" role="group" aria-label={laneLabels[lane] ?? `Lane ${lane + 1}`}>
          {#each Array(pattern.lengthSteps) as _, step}
            {@const active = isActive(lane, step)}
            <button
              type="button"
              class:active
              class:beat={step % pattern.stepsPerBeat === 0}
              aria-label={`${laneLabels[lane] ?? `Lane ${lane + 1}`}, step ${step + 1}`}
              aria-pressed={active}
              disabled={!editable}
              onclick={() => ontoggle?.(lane, step)}
            ><span class="visually-hidden">{active ? 'On' : 'Off'}</span></button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>
