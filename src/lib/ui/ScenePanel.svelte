<script lang="ts">
  import { tick } from 'svelte';
  import type { ProjectScene } from '../project/model';
  import type { RackModule } from '../state/rack';

  interface Props {
    scenes: readonly ProjectScene[];
    modules: readonly RackModule[];
    oncapture: () => void;
    onlaunch: (scene: ProjectScene) => void;
    onrename: (sceneId: string, name: string) => void;
    ondelete: (sceneId: string) => void;
  }

  let { scenes, modules, oncapture, onlaunch, onrename, ondelete }: Props = $props();

  function appliesToRack(scene: ProjectScene): boolean {
    return modules.some((module) => scene.assignments[module.id] !== undefined);
  }

  async function removeScene(sceneId: string): Promise<void> {
    ondelete(sceneId);
    await tick();
    document.getElementById('capture-scene-button')?.focus();
  }
</script>

<section class="scene-panel" data-app-help-key="scenes" aria-labelledby="scene-heading">
  <div class="scene-heading">
    <div><p>Pattern snapshots</p><h2 id="scene-heading">Scenes</h2></div>
    <button id="capture-scene-button" type="button" class="has-emoticon" data-app-help-key="capture-scene" onclick={oncapture}><span class="button-emoticon" aria-hidden="true">📸</span>Capture scene</button>
  </div>
  <p class="scene-help">Capture the active slot of every module. Launches land together on the next bar while playing.</p>
  {#if scenes.length === 0}
    <p class="scene-empty">No scenes captured yet.</p>
  {:else}
    <ul class="scene-list">
      {#each scenes as scene, index (scene.id)}
        <li>
          <label for={`${scene.id}-name`} data-app-help-key="scene-name">Scene {index + 1} name</label>
          <input id={`${scene.id}-name`} data-app-help-key="scene-name" value={scene.name} oninput={(event) => onrename(scene.id, event.currentTarget.value)} />
          <button type="button" data-app-help-key="launch-scene" disabled={!appliesToRack(scene)} onclick={() => onlaunch(scene)}>Launch {scene.name}</button>
          <button type="button" class="delete" data-app-help-key="delete-scene" aria-label={`Delete ${scene.name}`} onclick={() => void removeScene(scene.id)}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
