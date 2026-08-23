<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
  import { AudioEngine } from './lib/audio/engine';
  import { SCALE_NAMES, type ModuleType, type ScaleName } from './lib/core/pattern';
  import { loadRackFromFragment, rackToFragment } from './lib/share/fragment';
  import { MODULE_TYPES } from './lib/share/schema';
  import { STARTER_RACK } from './lib/share/starter';
  import {
    createModule,
    createRackState,
    randomizeRack,
    setRackKey,
    toEngineSnapshot,
    toShareableRack,
    toggleDrumStep,
    type RackModule,
    type RackState,
  } from './lib/state/rack';
  import ModulePlate from './lib/ui/ModulePlate.svelte';
  import Transport from './lib/ui/Transport.svelte';

  const engine = new AudioEngine();
  const moduleLabels: Readonly<Record<ModuleType, string>> = { drums: 'Drums', bass: 'Bass', acid: 'Acid', chords: 'Chords', mixer: 'Mixer' };

  let rack = $state<RackState>(createRackState(STARTER_RACK));
  let playing = $state(false);
  let selectedModuleType = $state<ModuleType>('acid');
  let status = $state('Starter rack ready');
  let error = $state('');
  let lastStopTime = Number.NEGATIVE_INFINITY;
  let supported = $state(true);
  let schedulerJitter = $state<number | null>(null);
  let diagnosticTimer: number | null = null;

  onDestroy(() => {
    if (diagnosticTimer !== null) window.clearInterval(diagnosticTimer);
  });

  onMount(() => {
    supported = 'AudioContext' in window && 'AudioWorkletNode' in window;
    void loadRackFromFragment(window.location.hash)
      .then((shared) => {
        if (shared !== null) {
          rack = createRackState(shared);
          status = 'Shared patch loaded locally';
        }
        publish();
      })
      .catch((reason: unknown) => {
        error = reason instanceof Error ? reason.message : 'This patch cannot be opened.';
      });
  });

  function publish(): void {
    engine.publish(toEngineSnapshot(rack));
  }

  function replaceRack(next: RackState): void {
    rack = next;
    publish();
  }

  async function play(): Promise<void> {
    error = '';
    try {
      publish();
      await engine.play();
      playing = true;
      status = 'Transport playing';
      diagnosticTimer ??= window.setInterval(() => {
        schedulerJitter = engine.schedulerMessageJitterMs;
      }, 250);
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'Audio could not start.';
      playing = false;
    }
  }

  function stop(): void {
    const now = performance.now();
    engine.stop();
    playing = false;
    status = now - lastStopTime < 400 ? 'Panic: all internal voices stopped' : 'Transport stopped';
    lastStopTime = now;
  }

  function updateModule(id: string, update: (module: RackModule) => RackModule): void {
    replaceRack({ ...rack, modules: rack.modules.map((module) => module.id === id ? update(module) : module) });
  }

  function patchModule(id: string, modulePatch: Partial<RackModule>): void {
    updateModule(id, (module) => ({ ...module, ...modulePatch }));
  }

  function setParam(id: string, key: string, value: number): void {
    updateModule(id, (module) => ({ ...module, params: { ...module.params, [key]: value } }));
  }

  function setTempo(value: number): void {
    if (!Number.isFinite(value) || value < 20 || value > 300) return;
    replaceRack({ ...rack, bpm: Math.round(value * 10) / 10 });
  }

  function setKey(root: number, scale: ScaleName): void {
    if (!SCALE_NAMES.includes(scale)) return;
    replaceRack(setRackKey(rack, root, scale));
  }

  function addModule(): void {
    replaceRack({ ...rack, modules: [...rack.modules, createModule(selectedModuleType)] });
    status = `${moduleLabels[selectedModuleType]} added`;
  }

  function deleteModule(id: string): void {
    if (rack.modules.length === 1) return;
    replaceRack({ ...rack, modules: rack.modules.filter((module) => module.id !== id) });
    status = 'Module deleted';
  }

  function handleConsider(event: CustomEvent<DndEvent<RackModule>>): void {
    rack = { ...rack, modules: event.detail.items };
  }

  function handleFinalize(event: CustomEvent<DndEvent<RackModule>>): void {
    rack = { ...rack, modules: event.detail.items };
    publish();
    status = 'Modules reordered';
  }

  async function share(): Promise<void> {
    error = '';
    try {
      const fragment = await rackToFragment(toShareableRack(rack));
      history.replaceState(null, '', fragment);
      await navigator.clipboard.writeText(window.location.href);
      status = `Patch link copied · ${fragment.length - 3} characters`;
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The patch link could not be copied.';
    }
  }
</script>

<svelte:head><title>sequens-R · generative MIDI sequencer</title></svelte:head>

<a class="skip-link" href="#rack">Skip to rack</a>
<header class:playing class="app-header">
  <div class="brand"><p>Local generative MIDI</p><h1>sequens-R</h1></div>
  <div class="bar-progress" aria-hidden="true"></div>
</header>

{#if supported}
  <main id="rack" tabindex="-1">
    <Transport bpm={rack.bpm} root={rack.key.root} scale={rack.key.scale} {playing} onplay={play} onstop={stop} onbpm={setTempo} onkey={setKey} />

    <section class="rack-tools" aria-label="Rack actions">
      <button type="button" class="random" onclick={() => { replaceRack(randomizeRack(rack)); status = 'New deterministic seeds generated'; }}>Random</button>
      <button type="button" onclick={share}>Share</button>
      <div class="add-module">
        <label for="module-type">New module</label>
        <select id="module-type" bind:value={selectedModuleType}>
          {#each MODULE_TYPES as type}<option value={type}>{moduleLabels[type]}</option>{/each}
        </select>
        <button type="button" onclick={addModule}>Add</button>
      </div>
    </section>

    <p class="session-status" aria-live="polite" data-scheduler-jitter-ms={schedulerJitter?.toFixed(3) ?? ''}>{status}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <section
      class="module-list"
      aria-label="Rack modules"
      use:dragHandleZone={{ items: rack.modules, flipDurationMs: 0, delayTouchStart: 100, zoneTabIndex: -1 }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      {#each rack.modules as module (module.id)}
        <ModulePlate
          {module}
          musicalKey={rack.key}
          onpatch={(modulePatch) => patchModule(module.id, modulePatch)}
          onparam={(key, value) => setParam(module.id, key, value)}
          onstep={(lane, step) => updateModule(module.id, (current) => toggleDrumStep(current, rack.key, lane, step))}
          ondelete={() => deleteModule(module.id)}
          rackModules={rack.modules}
          ontargetpatch={patchModule}
        />
      {/each}
    </section>
  </main>
{:else}
  <main class="unsupported"><h2>This browser cannot run sequens-R.</h2><p>Use a current Chromium browser with AudioWorklet support.</p></main>
{/if}
