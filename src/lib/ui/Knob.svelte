<script lang="ts">
  import type { ParamDefinition } from '../core/pattern';
  import RotaryKnob from './RotaryKnob.svelte';

  interface Props {
    id: string;
    definition: ParamDefinition;
    value: number;
    helpKey?: string;
    onchange: (value: number) => void;
    oncommit: () => void;
  }

  let { id, definition, value, helpKey, onchange, oncommit }: Props = $props();
  let displayValue = $derived(definition.options?.[optionIndex(value)] ?? `${value}${definition.unit ? ` ${definition.unit}` : ''}`);
  let resolvedHelpKey = $derived(helpKey ?? `param:${definition.key}`);

  function optionValue(index: number): number {
    if (definition.min === 0 && definition.max === (definition.options?.length ?? 1) - 1) return index;
    return definition.min + index * definition.step;
  }

  function optionIndex(current: number): number {
    if (definition.min === 0 && definition.max === (definition.options?.length ?? 1) - 1) return current;
    return Math.round((current - definition.min) / definition.step);
  }

  function clamp(next: number): number {
    return Math.max(definition.min, Math.min(definition.max, next));
  }

  function setValue(next: number, commit = true): void {
    onchange(clamp(next));
    if (commit) oncommit();
  }

  function update(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
      onchange(Number(target.value));
      if (target instanceof HTMLSelectElement) oncommit();
    }
  }
</script>

{#if definition.control === 'knob'}
  <RotaryKnob
    {id}
    name={definition.key}
    label={definition.label}
    min={definition.min}
    max={definition.max}
    step={definition.step}
    {value}
    defaultValue={definition.defaultValue}
    helpKey={resolvedHelpKey}
    formatValue={(next) => `${next}${definition.unit ? ` ${definition.unit}` : ''}`}
    oninput={onchange}
    oncommit={oncommit}
  />
{:else}
<div class="knob-control" data-help-key={resolvedHelpKey}>
  {#if definition.control === 'segmented' && definition.options}
    <span id={`${id}-label`} class="parameter-label">{definition.label}</span>
    <output aria-hidden="true">{displayValue}</output>
    <div class="segmented-control" role="group" aria-labelledby={`${id}-label`}>
      {#each definition.options as option, index (option)}
        <button type="button" aria-pressed={value === optionValue(index)} onclick={() => setValue(optionValue(index))}>{option}</button>
      {/each}
    </div>
  {:else if definition.control === 'switch' && definition.options}
    <label for={id}>{definition.label}</label>
    <span class="switch-value">{displayValue}</span>
    <label class="switch-control" for={id}>
      <input
        {id}
        name={definition.key}
        type="checkbox"
        checked={value === definition.max}
        onchange={(event) => setValue(event.currentTarget.checked ? definition.max : definition.min)}
      />
      <span aria-hidden="true"></span>
    </label>
  {:else if definition.options}
    <label for={id}>{definition.label}</label>
    <select {id} name={definition.key} value={value} onchange={update}>
      {#each definition.options as option, index (option)}
        <option value={optionValue(index)}>{option}</option>
      {/each}
    </select>
  {:else if definition.control === 'stepper'}
    <label for={id}>{definition.label}</label>
    <span class="stepper-unit">{definition.unit ?? ''}</span>
    <div class="stepper-control">
      <button type="button" aria-label={`Decrease ${definition.label}`} disabled={value <= definition.min} onclick={() => setValue(value - definition.step)}>−</button>
      <input
        {id}
        name={definition.key}
        type="number"
        min={definition.min}
        max={definition.max}
        step={definition.step}
        value={value}
        aria-valuetext={displayValue}
        oninput={update}
        onchange={oncommit}
      />
      <button type="button" aria-label={`Increase ${definition.label}`} disabled={value >= definition.max} onclick={() => setValue(value + definition.step)}>+</button>
    </div>
  {:else}
    <label for={id}>{definition.label}</label>
    <output for={id}>{displayValue}</output>
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
{/if}
