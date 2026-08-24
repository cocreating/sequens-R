<script lang="ts">
  import type { RackModule } from '../state/rack';

  interface Props {
    modules: readonly RackModule[];
    onpatch: (id: string, patch: Partial<RackModule>) => void;
  }

  let { modules, onpatch }: Props = $props();

  function levelValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="mixer-panel" role="group" aria-label="Module mixer">
  {#each modules.filter((module) => module.type !== 'mixer') as target (target.id)}
    <div class="mixer-channel">
      <span>{target.name}</span>
      <button type="button" aria-label={`Solo ${target.name} from mixer`} aria-pressed={target.solo} onclick={() => onpatch(target.id, { solo: !target.solo })}>S</button>
      <button type="button" aria-label={`Mute ${target.name} from mixer`} aria-pressed={target.mute} onclick={() => onpatch(target.id, { mute: !target.mute })}>M</button>
      <label for={`mix-${target.id}`}>Level</label>
      <input id={`mix-${target.id}`} type="range" min="0" max="1" step="0.01" value={target.level} aria-valuetext={`${Math.round(target.level * 100)} percent`} oninput={(event) => onpatch(target.id, { level: levelValue(event) })} />
    </div>
  {/each}
</div>
