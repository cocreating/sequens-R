<script lang="ts">
  import { dragHandle } from 'svelte-dnd-action';
  import { GENERATORS } from '../generators';
  import { modulePattern, type RackModule } from '../state/rack';
  import type { MusicalKey } from '../core/pattern';
  import Knob from './Knob.svelte';
  import StepGrid from './StepGrid.svelte';
  import MixerPanel from './MixerPanel.svelte';

  interface Props {
    module: RackModule;
    musicalKey: MusicalKey;
    onpatch: (patch: Partial<RackModule>) => void;
    onparam: (key: string, value: number) => void;
    onparamcommit: () => void;
    onseed: (seed: number) => void;
    oncopyseed: () => void;
    onslot: (index: number) => void;
    onmutate: () => void;
    onrevert: () => void;
    onintensity: (intensity: 1 | 2 | 3 | 4) => void;
    onschedule: (on: boolean, everyNLoops: number) => void;
    onstep: (lane: number, step: number) => void;
    onduplicate: () => void;
    ondelete: () => void;
    rackModules?: readonly RackModule[];
    ontargetpatch?: (id: string, patch: Partial<RackModule>) => void;
  }

  let { module, musicalKey, onpatch, onparam, onparamcommit, onseed, oncopyseed, onslot, onmutate, onrevert, onintensity, onschedule, onstep, onduplicate, ondelete, rackModules = [], ontargetpatch }: Props = $props();
  let pattern = $derived(modulePattern(module, musicalKey));
  let schema = $derived(GENERATORS[module.type].paramSchema.filter((definition) => definition.control !== 'hidden'));
</script>

<article class:collapsed={module.collapsed} class:muted={module.mute} class:soloed={module.solo} aria-labelledby={`${module.id}-name`}>
  <div class="module-progress" aria-hidden="true"></div>
  <header class="module-header">
    <span use:dragHandle class="drag-handle" aria-label={`Reorder ${module.name}`}>⠿</span>
    <input id={`${module.id}-name`} class="module-name" value={module.name} aria-label={`${module.type} module name`} oninput={(event) => onpatch({ name: (event.currentTarget as HTMLInputElement).value })} />
    <div class="module-switches">
      <button type="button" aria-label={`Monitor ${module.name}`} aria-pressed={module.monitor} onclick={() => onpatch({ monitor: !module.monitor })}>◖</button>
      <button type="button" aria-label={`Solo ${module.name}`} aria-pressed={module.solo} onclick={() => onpatch({ solo: !module.solo })}>S</button>
      <button type="button" aria-label={`Mute ${module.name}`} aria-pressed={module.mute} onclick={() => onpatch({ mute: !module.mute })}>M</button>
      <button type="button" aria-label={`Duplicate ${module.name}`} onclick={onduplicate}>⧉</button>
      <button type="button" aria-label={`${module.collapsed ? 'Expand' : 'Collapse'} ${module.name}`} aria-expanded={!module.collapsed} onclick={() => onpatch({ collapsed: !module.collapsed })}>{module.collapsed ? '+' : '−'}</button>
      <button type="button" class="delete" aria-label={`Delete ${module.name}`} onclick={ondelete}>×</button>
    </div>
  </header>

  {#if !module.collapsed}
    <div class="module-body">
      {#if module.type === 'mixer'}
        <MixerPanel modules={rackModules} onpatch={(id, patch) => ontargetpatch?.(id, patch)} />
      {:else}
        <div class="pattern-tools">
          <div class="slot-picker" aria-label={`${module.name} pattern slots`}>
            {#each module.slots as _, index}
              <button type="button" aria-label={`${module.name} slot ${index + 1}`} aria-pressed={module.activeSlot === index} onclick={() => onslot(index)}>{index + 1}</button>
            {/each}
          </div>
          <label for={`${module.id}-seed`}>Seed</label>
          <input id={`${module.id}-seed`} class="seed-input" type="number" min="0" max="4294967295" step="1" value={module.seed} onchange={(event) => onseed(Number(event.currentTarget.value))} />
          <button type="button" aria-label={`Copy ${module.name} seed`} onclick={oncopyseed}>Copy</button>
          <label for={`${module.id}-mutation-intensity`}>Mutation</label>
          <select id={`${module.id}-mutation-intensity`} value={module.mutation.intensity} onchange={(event) => onintensity(Number(event.currentTarget.value) as 1 | 2 | 3 | 4)}>
            {#each [1, 2, 3, 4] as intensity}<option value={intensity}>Level {intensity}</option>{/each}
          </select>
          <button type="button" onclick={onmutate}>Mutate</button>
          <button type="button" onclick={onrevert} disabled={module.mutation.revert === null}>Revert</button>
          <label class="auto-mutate"><input type="checkbox" checked={module.mutation.on} onchange={(event) => onschedule(event.currentTarget.checked, module.mutation.everyNLoops)} /> Auto</label>
          <label for={`${module.id}-mutation-loops`}>Every</label>
          <select class="mutation-loop-select" id={`${module.id}-mutation-loops`} value={module.mutation.everyNLoops} onchange={(event) => onschedule(module.mutation.on, Number(event.currentTarget.value))}>
            {#each [1, 2, 4, 8, 16] as loops}<option value={loops}>{loops} {loops === 1 ? 'loop' : 'loops'}</option>{/each}
          </select>
        </div>
        <StepGrid {pattern} editable={module.type === 'drums'} ontoggle={onstep} />
      {/if}
      {#if schema.length > 0}
        <div class="parameters">
          {#each schema as definition (definition.key)}
            <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => onparam(definition.key, value)} oncommit={onparamcommit} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</article>
