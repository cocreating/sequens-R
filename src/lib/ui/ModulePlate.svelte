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
    onstep: (lane: number, step: number) => void;
    ondelete: () => void;
    rackModules?: readonly RackModule[];
    ontargetpatch?: (id: string, patch: Partial<RackModule>) => void;
  }

  let { module, musicalKey, onpatch, onparam, onstep, ondelete, rackModules = [], ontargetpatch }: Props = $props();
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
      <button type="button" aria-label={`${module.collapsed ? 'Expand' : 'Collapse'} ${module.name}`} aria-expanded={!module.collapsed} onclick={() => onpatch({ collapsed: !module.collapsed })}>{module.collapsed ? '+' : '−'}</button>
      <button type="button" class="delete" aria-label={`Delete ${module.name}`} onclick={ondelete}>×</button>
    </div>
  </header>

  {#if !module.collapsed}
    <div class="module-body">
      {#if module.type === 'mixer'}
        <MixerPanel modules={rackModules} onpatch={(id, patch) => ontargetpatch?.(id, patch)} />
      {:else}
        <StepGrid {pattern} editable={module.type === 'drums'} ontoggle={onstep} />
      {/if}
      {#if schema.length > 0}
        <div class="parameters">
          {#each schema as definition (definition.key)}
            <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => onparam(definition.key, value)} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</article>
