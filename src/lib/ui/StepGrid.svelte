<script lang="ts">
  import type { Pattern } from '../core/pattern';

  interface Props {
    pattern: Pattern;
    editable?: boolean;
    ontoggle?: (lane: number, step: number) => void;
  }

  let { pattern, editable = false, ontoggle }: Props = $props();
  let lanes = $derived(Math.max(1, ...pattern.events.map((event) => (event.lane ?? 0) + 1)));

  function isActive(lane: number, step: number): boolean {
    return pattern.events.some((event) => (event.lane ?? 0) === lane && Math.floor(event.startStep) === step);
  }
</script>

<div class="step-grid" style:--step-count={pattern.lengthSteps} aria-label="Pattern steps">
  {#each Array(lanes) as _, lane}
    <div class="step-lane" aria-label={`Lane ${lane + 1}`}>
      {#each Array(pattern.lengthSteps) as _, step}
        <button
          type="button"
          class:active={isActive(lane, step)}
          class:beat={step % pattern.stepsPerBeat === 0}
          aria-label={`Lane ${lane + 1}, step ${step + 1}`}
          aria-pressed={isActive(lane, step)}
          disabled={!editable}
          onclick={() => ontoggle?.(lane, step)}
        ><span class="visually-hidden">{isActive(lane, step) ? 'On' : 'Off'}</span></button>
      {/each}
    </div>
  {/each}
</div>
