<script lang="ts">
  import type { Pattern } from '../core/pattern';
  import CompositorPlayhead from './CompositorPlayhead.svelte';

  interface Props {
    pattern: Pattern;
    syncBeat?: number | null;
    playing: boolean;
    bpm: number;
    editable?: boolean;
    ontoggle?: (lane: number, step: number) => void;
  }

  let { pattern, syncBeat = null, playing, bpm, editable = false, ontoggle }: Props = $props();
  let lanes = $derived(Math.max(1, ...pattern.events.map((event) => (event.lane ?? 0) + 1)));

  function isActive(lane: number, step: number): boolean {
    return pattern.events.some((event) => (event.lane ?? 0) === lane && Math.floor(event.startStep) === step);
  }

</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access to the horizontal scroll region) -->
<div class="step-grid" data-help-key="step-grid" style:--step-count={pattern.lengthSteps} role="group" tabindex="0" aria-label="Pattern steps">
  <div class="step-grid-content">
  <CompositorPlayhead {playing} {bpm} beats={pattern.lengthSteps / pattern.stepsPerBeat} {syncBeat} />
  {#each Array(lanes) as _, lane}
    <div class="step-lane" role="group" aria-label={`Lane ${lane + 1}`}>
      {#each Array(pattern.lengthSteps) as _, step}
        {@const active = isActive(lane, step)}
        <button
          type="button"
          class:active
          class:beat={step % pattern.stepsPerBeat === 0}
          aria-label={`Lane ${lane + 1}, step ${step + 1}`}
          aria-pressed={active}
          disabled={!editable}
          onclick={() => ontoggle?.(lane, step)}
        ><span class="visually-hidden">{active ? 'On' : 'Off'}</span></button>
      {/each}
    </div>
  {/each}
  </div>
</div>
