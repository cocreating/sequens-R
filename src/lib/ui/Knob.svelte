<script lang="ts">
  import type { ParamDefinition } from '../core/pattern';

  interface Props {
    id: string;
    definition: ParamDefinition;
    value: number;
    onchange: (value: number) => void;
    oncommit: () => void;
  }

  let { id, definition, value, onchange, oncommit }: Props = $props();
  let percentage = $derived((value - definition.min) / (definition.max - definition.min) * 100);
  let angle = $derived(-135 + percentage * 2.7);
  let displayValue = $derived(definition.options?.[value] ?? `${value}${definition.unit ? ` ${definition.unit}` : ''}`);

  function update(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
      onchange(Number(target.value));
      if (target instanceof HTMLSelectElement) oncommit();
    }
  }
</script>

<div class="knob-control">
  <label for={id}>{definition.label}</label>
  {#if definition.options}
    <select {id} name={definition.key} value={value} onchange={update}>
      {#each definition.options as option, index}
        <option value={index}>{option}</option>
      {/each}
    </select>
  {:else}
    <output for={id}>{displayValue}</output>
    <div class="knob-visual" style:--knob-angle={`${angle}deg`} aria-hidden="true"><span></span></div>
    <input
      {id}
      name={definition.key}
      type="range"
      min={definition.min}
      max={definition.max}
      step={definition.step}
      value={value}
      aria-valuetext={displayValue}
      oninput={update}
      onchange={oncommit}
    />
  {/if}
</div>
