<script lang="ts">
  import type { Pattern } from '../core/pattern';
  import CompositorPlayhead from './CompositorPlayhead.svelte';

  interface Props {
    pattern: Pattern;
    syncBeat?: number | null;
    playing: boolean;
    bpm: number;
  }

  let { pattern, syncBeat = null, playing, bpm }: Props = $props();
  let lanes = $derived(Math.max(1, ...pattern.events.map((event) => (event.lane ?? 0) + 1)));
  let bars = $derived(pattern.lengthSteps / pattern.stepsPerBeat / 4);
  let eventsByLane = $derived(Array.from(
    { length: lanes },
    (_, lane) => pattern.events.filter((event) => (event.lane ?? 0) === lane),
  ));

  function percentage(value: number): string {
    return `${Math.max(0, Math.min(100, value / pattern.lengthSteps * 100))}%`;
  }
</script>

<div class="drone-field" data-help-key="drone-field" role="group" aria-label={`Drone field, ${lanes} voices across ${bars} bars`}>
  <div class="drone-field-heading" aria-hidden="true">
    <span>Continuous field</span>
    <span>{bars} {bars === 1 ? 'bar' : 'bars'}</span>
  </div>
  <div class="drone-field-timeline">
    <CompositorPlayhead {playing} {bpm} beats={pattern.lengthSteps / pattern.stepsPerBeat} {syncBeat} />
    {#each eventsByLane as events, lane (lane)}
      <div class="drone-field-lane" aria-hidden="true">
        <span class="drone-field-lane-label">{lane === 0 ? 'Anchor' : `Voice ${lane + 1}`}</span>
        <div class="drone-field-track">
          {#each events as event (`${lane}-${event.startStep}-${event.pitch}`)}
            <span
              class="drone-field-segment"
              class:anchor={lane === 0}
              style:left={percentage(event.startStep)}
              style:width={percentage(event.durationSteps)}
              title={`MIDI ${event.pitch}, ${event.durationSteps / pattern.stepsPerBeat} beats`}
            ></span>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  <ul class="visually-hidden">
    {#each eventsByLane as events, lane (lane)}
      <li>{lane === 0 ? 'Anchor' : `Voice ${lane + 1}`}: {events.map((event) => `MIDI ${event.pitch} for ${event.durationSteps / pattern.stepsPerBeat} beats`).join(', ')}</li>
    {/each}
  </ul>
</div>

<style>
  .drone-field {
    min-width: 0;
    border: 1px solid var(--color-structure);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    background:
      radial-gradient(circle at 20% 0%, color-mix(in oklab, var(--color-playing) 12%, transparent), transparent 42%),
      color-mix(in oklab, var(--color-canvas) 72%, transparent);
  }

  .drone-field-heading {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
    color: var(--color-text-muted);
    font: 700 0.72rem/1.2 var(--font-data);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .drone-field-timeline {
    position: relative;
    display: grid;
    gap: var(--space-1);
    overflow: hidden;
  }

  .drone-field-lane {
    display: grid;
    grid-template-columns: 3.8rem minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    min-height: 1.3rem;
  }

  .drone-field-lane-label {
    color: var(--color-text-muted);
    font: 650 0.68rem/1 var(--font-data);
  }

  .drone-field-track {
    position: relative;
    height: 0.72rem;
    border-radius: 999px;
    background:
      repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), color-mix(in oklab, var(--color-structure) 72%, transparent) calc(25% - 1px) 25%),
      color-mix(in oklab, var(--color-surface-raised) 55%, transparent);
    overflow: hidden;
  }

  .drone-field-segment {
    position: absolute;
    inset-block: 0;
    min-width: 2px;
    border-inline-end: 1px solid color-mix(in oklab, var(--color-canvas) 72%, transparent);
    border-radius: 999px;
    background: linear-gradient(90deg, color-mix(in oklab, var(--color-playing) 48%, var(--color-structure)), color-mix(in oklab, var(--color-playing) 82%, white 8%));
    box-shadow: 0 0 0.55rem color-mix(in oklab, var(--color-playing) 18%, transparent);
  }

  .drone-field-segment.anchor {
    background: linear-gradient(90deg, color-mix(in oklab, var(--color-playing) 62%, var(--color-structure)), var(--color-playing));
  }
</style>
