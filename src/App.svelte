<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
  import { AudioEngine } from './lib/audio/engine';
  import { SCALE_NAMES, type ModuleType, type ScaleName } from './lib/core/pattern';
  import {
    activeProjectRack,
    createProject,
    nonShareableModuleNames,
    projectFromJson,
    projectToJson,
    updateProjectRack,
    type ProjectDocument,
  } from './lib/project/model';
  import { loadCurrentProject, requestPersistentStorage, saveCurrentProject } from './lib/project/storage';
  import { loadRackFromFragment, rackToFragment } from './lib/share/fragment';
  import { MODULE_TYPES } from './lib/share/schema';
  import { STARTER_RACK } from './lib/share/starter';
  import {
    createModule,
    createRackState,
    mutateModule,
    randomizeRack,
    revertModule,
    setModuleParams,
    setModuleSeed,
    setModuleSlot,
    setMutationIntensity,
    setMutationSchedule,
    setRackKey,
    toEngineSnapshot,
    toShareableRack,
    toggleDrumStep,
    type RackModule,
    type RackState,
  } from './lib/state/rack';
  import { RackHistory } from './lib/state/history';
  import ModulePlate from './lib/ui/ModulePlate.svelte';
  import Transport from './lib/ui/Transport.svelte';

  const engine = new AudioEngine(handleBar);
  const moduleLabels: Readonly<Record<ModuleType, string>> = { drums: 'Drums', bass: 'Bass', acid: 'Acid', chords: 'Chords', mixer: 'Mixer' };
  const initialRack = createRackState(STARTER_RACK);

  let rack = $state<RackState>(initialRack);
  let project = $state<ProjectDocument>(createProject(initialRack));
  const rackHistory = new RackHistory(initialRack);
  let playing = $state(false);
  let selectedModuleType = $state<ModuleType>('acid');
  let status = $state('Starter rack ready');
  let error = $state('');
  let lastStopTime = Number.NEGATIVE_INFINITY;
  let supported = $state(true);
  let schedulerJitter = $state<number | null>(null);
  let diagnosticTimer: number | null = null;
  let saveTimer: number | null = null;
  let initialized = $state(false);
  let sharedDraft = $state(false);
  let canUndo = $state(false);
  let canRedo = $state(false);

  onDestroy(() => {
    if (diagnosticTimer !== null) window.clearInterval(diagnosticTimer);
    if (saveTimer !== null) window.clearTimeout(saveTimer);
  });

  onMount(() => {
    supported = 'AudioContext' in window && 'AudioWorkletNode' in window;
    void initializeApp();
  });

  async function initializeApp(): Promise<void> {
    try {
      const shared = await loadRackFromFragment(window.location.hash);
      if (shared !== null) {
        rack = createRackState(shared);
        project = createProject(rackSnapshot(), 'Shared Patch');
        sharedDraft = true;
        status = 'Shared patch loaded locally';
      } else {
        const saved = await loadCurrentProject();
        if (saved !== null) {
          project = saved;
          rack = activeProjectRack(saved).state;
          status = 'Local project restored';
        }
      }
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'Local state could not be restored; the starter rack was loaded.';
    } finally {
      rackHistory.reset(rackSnapshot());
      syncHistoryButtons();
      initialized = true;
      publish();
    }
  }

  function publish(): void {
    engine.publish(toEngineSnapshot(rack));
  }

  function rackSnapshot(value: RackState = rack): RackState {
    return $state.snapshot(value);
  }

  function projectSnapshot(): ProjectDocument {
    return $state.snapshot(project);
  }

  function syncHistoryButtons(): void {
    canUndo = rackHistory.canUndo;
    canRedo = rackHistory.canRedo;
  }

  function scheduleSave(): void {
    if (!initialized || sharedDraft) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      project = updateProjectRack(projectSnapshot(), rackSnapshot());
      void saveCurrentProject(projectSnapshot()).catch((reason: unknown) => {
        error = reason instanceof Error ? reason.message : 'The project could not be saved locally.';
      });
    }, 250);
  }

  function replaceRack(next: RackState, coalesceKey: string | null = null): void {
    rack = rackHistory.record(rackSnapshot(next), coalesceKey);
    syncHistoryButtons();
    publish();
    scheduleSave();
  }

  function endCoalescing(): void {
    rackHistory.endCoalescing();
  }

  function undo(): void {
    const previous = rackHistory.undo();
    if (previous === null) return;
    rack = previous;
    syncHistoryButtons();
    publish();
    scheduleSave();
    status = 'Undo';
  }

  function redo(): void {
    const next = rackHistory.redo();
    if (next === null) return;
    rack = next;
    syncHistoryButtons();
    publish();
    scheduleSave();
    status = 'Redo';
  }

  function handleBar(bar: number): void {
    if (bar === 0) return;
    const due = rack.modules.some((module) => module.mutation.on && bar % module.mutation.everyNLoops === 0);
    if (!due) return;
    replaceRack({
      ...rack,
      modules: rack.modules.map((module) => module.mutation.on && bar % module.mutation.everyNLoops === 0 ? mutateModule(module) : module),
    });
    status = 'Scheduled mutation applied';
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

  function updateModule(id: string, update: (module: RackModule) => RackModule, coalesceKey: string | null = null): void {
    replaceRack({ ...rack, modules: rack.modules.map((module) => module.id === id ? update(module) : module) }, coalesceKey);
  }

  function patchModule(id: string, modulePatch: Partial<RackModule>): void {
    updateModule(id, (module) => ({ ...module, ...modulePatch }));
  }

  function setParam(id: string, key: string, value: number): void {
    updateModule(id, (module) => setModuleParams(module, { ...module.params, [key]: value }), `param:${id}:${key}`);
  }

  function setTempo(value: number): void {
    if (!Number.isFinite(value) || value < 20 || value > 300) return;
    replaceRack({ ...rack, bpm: Math.round(value * 10) / 10 }, 'tempo');
  }

  function setKey(root: number, scale: ScaleName): void {
    if (!SCALE_NAMES.includes(scale)) return;
    replaceRack(setRackKey(rack, root, scale));
  }

  function setProjectName(name: string): void {
    project = { ...project, name: name.trimStart() || 'Untitled Project' };
    scheduleSave();
  }

  function setSeed(id: string, seed: number): void {
    updateModule(id, (module) => setModuleSeed(module, seed));
    status = 'Seed updated';
  }

  async function copySeed(seed: number): Promise<void> {
    await navigator.clipboard.writeText(String(seed));
    status = 'Seed copied';
  }

  function selectSlot(id: string, index: number): void {
    updateModule(id, (module) => setModuleSlot(module, index));
    status = `Slot ${index + 1} selected`;
  }

  function mutate(id: string): void {
    updateModule(id, mutateModule);
    status = 'Pattern mutated';
  }

  function revert(id: string): void {
    updateModule(id, revertModule);
    status = 'Mutation reverted';
  }

  function addModule(): void {
    replaceRack({ ...rack, modules: [...rack.modules, createModule(selectedModuleType)] });
    status = `${moduleLabels[selectedModuleType]} added`;
  }

  function duplicateModule(id: string): void {
    const index = rack.modules.findIndex((module) => module.id === id);
    if (index < 0 || rack.modules.length >= 16) return;
    const source = rack.modules[index]!;
    const duplicate = structuredClone($state.snapshot(source));
    duplicate.id = createModule(source.type).id;
    duplicate.name = `${source.name} copy`;
    replaceRack({ ...rack, modules: [...rack.modules.slice(0, index + 1), duplicate, ...rack.modules.slice(index + 1)] });
    status = `${source.name} duplicated`;
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
    const reordered = { ...rack, modules: event.detail.items };
    replaceRack(reordered);
    status = 'Modules reordered';
  }

  async function saveProject(): Promise<void> {
    error = '';
    try {
      project = updateProjectRack(projectSnapshot(), rackSnapshot());
      await saveCurrentProject(projectSnapshot());
      const persisted = await requestPersistentStorage();
      sharedDraft = false;
      if (window.location.hash !== '') window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      status = persisted === false ? 'Project saved · durable storage was not granted' : 'Project saved locally';
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The project could not be saved.';
    }
  }

  function exportProject(): void {
    project = updateProjectRack(projectSnapshot(), rackSnapshot());
    const blob = new Blob([projectToJson(projectSnapshot())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.trim().replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'sequens-r-project'}.sequens-r.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    status = 'Project exported';
  }

  async function importProject(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    error = '';
    try {
      const imported = projectFromJson(await file.text());
      project = imported;
      rack = activeProjectRack(imported).state;
      rackHistory.reset(rackSnapshot());
      syncHistoryButtons();
      sharedDraft = false;
      publish();
      await saveCurrentProject(projectSnapshot());
      status = 'Project imported and saved locally';
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The project file could not be imported.';
    }
  }

  async function share(): Promise<void> {
    error = '';
    try {
      const blocked = nonShareableModuleNames(rack);
      if (blocked.length > 0) {
        error = `This patch cannot be shared by link because these modules contain local data: ${blocked.join(', ')}. Export the project instead.`;
        return;
      }
      const fragment = await rackToFragment(toShareableRack(rack));
      window.history.replaceState(null, '', fragment);
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

{#if !supported}
  <main class="unsupported"><h2>This browser cannot run sequens-R.</h2><p>Use a current Chromium browser with AudioWorklet support.</p></main>
{:else if !initialized}
  <main class="loading" aria-busy="true"><p>Loading local project…</p></main>
{:else}
  <main id="rack" tabindex="-1">
    <section class="project-tools" aria-label="Project actions">
      <label for="project-name">Project</label>
      <input id="project-name" value={project.name} oninput={(event) => setProjectName(event.currentTarget.value)} />
      <button type="button" onclick={undo} disabled={!canUndo}>Undo</button>
      <button type="button" onclick={redo} disabled={!canRedo}>Redo</button>
      <button type="button" onclick={saveProject}>{sharedDraft ? 'Save draft' : 'Save'}</button>
      <button type="button" onclick={exportProject}>Export</button>
      <label class="import-project" for="project-import">Import</label>
      <input id="project-import" class="visually-hidden" type="file" accept="application/json,.json" onchange={importProject} />
    </section>

    <Transport bpm={rack.bpm} root={rack.key.root} scale={rack.key.scale} {playing} onplay={play} onstop={stop} onbpm={setTempo} onbpmcommit={endCoalescing} onkey={setKey} />

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
    {#if schedulerJitter !== null}
      <p class="scheduler-jitter">Scheduler jitter <data value={schedulerJitter.toFixed(3)}>{schedulerJitter.toFixed(3)}</data> ms σ</p>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <section
      class="module-list"
      aria-label="Rack modules"
      use:dragHandleZone={{ items: rack.modules, flipDurationMs: 0, zoneTabIndex: -1 }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      {#each rack.modules as module (module.id)}
        <ModulePlate
          {module}
          musicalKey={rack.key}
          onpatch={(modulePatch) => patchModule(module.id, modulePatch)}
          onparam={(key, value) => setParam(module.id, key, value)}
          onparamcommit={endCoalescing}
          onseed={(seed) => setSeed(module.id, seed)}
          oncopyseed={() => copySeed(module.seed)}
          onslot={(index) => selectSlot(module.id, index)}
          onmutate={() => mutate(module.id)}
          onrevert={() => revert(module.id)}
          onintensity={(intensity) => updateModule(module.id, (current) => setMutationIntensity(current, intensity))}
          onschedule={(on, everyNLoops) => updateModule(module.id, (current) => setMutationSchedule(current, on, everyNLoops))}
          onstep={(lane, step) => updateModule(module.id, (current) => toggleDrumStep(current, rack.key, lane, step))}
          onduplicate={() => duplicateModule(module.id)}
          ondelete={() => deleteModule(module.id)}
          rackModules={rack.modules}
          ontargetpatch={patchModule}
        />
      {/each}
    </section>
  </main>
{/if}
