<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
  import { AudioEngine } from './lib/audio/engine';
  import { CORE_MODULE_TYPES, isControlModule, SCALE_NAMES, type ModuleType, type Pattern, type ScaleName } from './lib/core/pattern';
  import {
    activeProjectRack,
    captureProjectScene,
    createProject,
    deleteProjectScene,
    nonShareableModuleNames,
    projectFromJson,
    projectToJson,
    renameProjectScene,
    updateProjectRack,
    type ProjectDocument,
    type ProjectScene,
  } from './lib/project/model';
  import { loadCurrentProject, requestPersistentStorage, saveCurrentProject } from './lib/project/storage';
  import { loadRackFromFragment, rackToFragment } from './lib/share/fragment';
  import { MODULE_TYPES } from './lib/share/schema';
  import { STARTER_RACK } from './lib/share/starter';
  import {
    createModule,
    createRackState,
    applyScene,
    mutateModule,
    randomizeRack,
    revertModule,
    setModuleParams,
    setModuleSeed,
    setModuleSlot,
    setMutationIntensity,
    setMutationSchedule,
    setRackKey,
    setCcAutomation,
    setManualPattern,
    toEngineSnapshot,
    toShareableRack,
    toggleDrumStep,
    type RackModule,
    type RackState,
  } from './lib/state/rack';
  import { RackHistory } from './lib/state/history';
  import ModulePlate from './lib/ui/ModulePlate.svelte';
  import Transport from './lib/ui/Transport.svelte';
  import HardwarePanel from './lib/ui/HardwarePanel.svelte';
  import DesktopStudioPanel from './lib/ui/DesktopStudioPanel.svelte';
  import ScenePanel from './lib/ui/ScenePanel.svelte';
  import { createBrowserMidiEnvironment, midiSupported } from './lib/midi/environment';
  import { MidiManager, type MidiManagerState } from './lib/midi/manager';
  import { createSmfType1 } from './lib/export/smf';
  import { binaryBlob, safeFileName, saveBlob } from './lib/export/download';
  import { renderRackAudio } from './lib/export/bounce';
  import { encodePcm16Wav } from './lib/export/wav';
  import { createStoredZip } from './lib/export/zip';
  import { createBrowserPlaybackPlatform, PlaybackSession } from './lib/platform/playback-session';
  import { postBackgroundTask } from './lib/platform/tasks';
  import { runViewTransition } from './lib/platform/view-transition';
  import CompositorPlayhead from './lib/ui/CompositorPlayhead.svelte';
  import DiagnosticsPanel from './lib/ui/DiagnosticsPanel.svelte';
  import type { AudioDiagnostics } from './lib/audio/engine';

  let midiState = $state<MidiManagerState>({ permission: 'unknown', connected: false, outputs: [], clockPortIds: [] });
  const midi = new MidiManager(createBrowserMidiEnvironment(), (next) => { midiState = next; });
  const engine = new AudioEngine(handleBar, midi);
  const playbackSession = new PlaybackSession(createBrowserPlaybackPlatform(), {
    play: () => { void play(); },
    pause: () => stop(),
    stop: () => stop(),
  });
  const moduleLabels: Readonly<Record<ModuleType, string>> = {
    drums: 'Drums', bass: 'Bass', acid: 'Acid', chords: 'Chords', mixer: 'Mixer',
    arp: 'Arp', euclid: 'Euclid', piano: 'Piano roll', cc: 'CC Control', mod: 'Mod',
  };
  const initialRack = createRackState(STARTER_RACK);

  let rack = $state<RackState>(initialRack);
  let project = $state<ProjectDocument>(createProject(initialRack));
  const rackHistory = new RackHistory(initialRack);
  let playing = $state(false);
  let playheadBeat = $state<number | null>(null);
  let selectedModuleType = $state<ModuleType>('acid');
  let status = $state('Starter rack ready');
  let error = $state('');
  let lastStopTime = Number.NEGATIVE_INFINITY;
  let supported = $state(true);
  let schedulerJitter = $state<number | null>(null);
  let diagnosticTimer: number | null = null;
  let saveTimer: number | null = null;
  let saveRevision = 0;
  let initialized = $state(false);
  let sharedDraft = $state(false);
  let canUndo = $state(false);
  let canRedo = $state(false);
  let exportBars = $state(4);
  let exportingAudio = $state(false);
  let desktopSurface = $state(false);
  let audioOutputs = $state<readonly MediaDeviceInfo[]>([]);
  let selectedAudioOutputId = $state('');
  let audioState = $state<AudioContextState | 'uninitialized'>('uninitialized');
  let audioDiagnostics = $state<AudioDiagnostics>(engine.diagnostics);
  let desktopMedia: MediaQueryList | null = null;

  onDestroy(() => {
    if (diagnosticTimer !== null) window.clearInterval(diagnosticTimer);
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    void engine.destroy();
    void playbackSession.destroy();
    midi.disconnect();
    window.removeEventListener('keydown', handleKeyboardShortcut);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    desktopMedia?.removeEventListener('change', handleDesktopChange);
  });

  onMount(() => {
    supported = 'AudioContext' in window && 'AudioWorkletNode' in window && midiSupported();
    if (supported) void midi.inspectPermission();
    desktopMedia = window.matchMedia('(min-width: 64rem)');
    desktopSurface = desktopMedia.matches;
    desktopMedia.addEventListener('change', handleDesktopChange);
    window.addEventListener('keydown', handleKeyboardShortcut);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    playbackSession.initialize();
    void initializeApp();
  });

  async function handleVisibilityChange(): Promise<void> {
    if (document.visibilityState !== 'visible' || !playing) return;
    await engine.resume();
    await playbackSession.restoreAfterVisibility();
    audioState = engine.state;
    status = engine.state === 'running' ? 'Audio session recovered' : 'Audio is suspended · resume playback';
  }

  function handleDesktopChange(event: MediaQueryListEvent): void {
    desktopSurface = event.matches;
    if (!desktopSurface && !CORE_MODULE_TYPES.includes(selectedModuleType as (typeof CORE_MODULE_TYPES)[number])) selectedModuleType = 'acid';
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
  }

  function handleKeyboardShortcut(event: KeyboardEvent): void {
    if (!desktopSurface || isTypingTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (playing) stop(); else void play();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveProject();
    } else if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'r') {
      replaceRack(randomizeRack(rack));
      status = 'New deterministic seeds generated';
    } else if (event.key === '[' || event.key === ']') {
      const current = project.racks.findIndex(({ id }) => id === project.activeRackId);
      const offset = event.key === '[' ? -1 : 1;
      const next = (current + offset + project.racks.length) % project.racks.length;
      switchRack(project.racks[next]!.id);
    }
  }

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
    return JSON.parse(JSON.stringify(value)) as unknown as RackState;
  }

  function projectSnapshot(): ProjectDocument {
    return JSON.parse(JSON.stringify(project)) as unknown as ProjectDocument;
  }

  function syncHistoryButtons(): void {
    canUndo = rackHistory.canUndo;
    canRedo = rackHistory.canRedo;
  }

  function scheduleSave(): void {
    if (!initialized || sharedDraft) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveRevision += 1;
    const revision = saveRevision;
    saveTimer = window.setTimeout(() => {
      void postBackgroundTask(async () => {
        if (revision !== saveRevision) return;
        project = updateProjectRack(projectSnapshot(), rackSnapshot());
        await saveCurrentProject(projectSnapshot());
      }).catch((reason: unknown) => {
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
    playheadBeat = bar * 4;
    playbackSession.updatePosition(rack.bpm, bar * 4);
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
      playheadBeat = 0;
      audioState = engine.state;
      await playbackSession.setPlaying(true, rack.bpm, 0);
      status = 'Transport playing';
      diagnosticTimer ??= window.setInterval(() => {
        schedulerJitter = engine.schedulerMessageJitterMs;
        audioState = engine.state;
        audioDiagnostics = engine.diagnostics;
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
    playheadBeat = null;
    audioState = engine.state;
    audioDiagnostics = engine.diagnostics;
    if (diagnosticTimer !== null) window.clearInterval(diagnosticTimer);
    diagnosticTimer = null;
    void playbackSession.setPlaying(false, rack.bpm, 0);
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
    const source = rack.modules.find((module) => module.id === id);
    updateModule(id, (module) => setModuleParams(module, { ...module.params, [key]: value }), `param:${id}:${key}`);
    const control = source?.type === 'cc' ? /^value([1-4])$/u.exec(key) : null;
    if (source !== undefined && control !== null) {
      const index = Number(control[1]);
      midi.control(source.midi, {
        cc: source.params[`cc${index}`] ?? 0,
        value,
        channel: source.params[`channel${index}`] ?? 1,
      }, performance.now());
    }
  }

  function setPattern(id: string, pattern: Pattern): void {
    updateModule(id, (module) => setManualPattern(module, pattern), `piano:${id}`);
    endCoalescing();
    status = 'Piano roll updated · project export required for sharing';
  }

  function addAutomationPoint(id: string, control: 1 | 2 | 3 | 4, step: number, value: number): void {
    updateModule(id, (module) => setCcAutomation(module, [...module.automation, { control, step, value }]), `automation:${id}`);
    status = 'CC movement recorded · project export required for sharing';
  }

  function clearAutomation(id: string): void {
    updateModule(id, (module) => setCcAutomation(module, []));
    status = 'CC automation cleared';
  }

  function setTempo(value: number): void {
    if (!Number.isFinite(value) || value < 20 || value > 300) return;
    replaceRack({ ...rack, bpm: Math.round(value * 10) / 10 }, 'tempo');
    if (playing) playbackSession.updatePosition(value, playheadBeat ?? 0);
  }

  async function resumeAudio(): Promise<void> {
    await engine.resume();
    audioState = engine.state;
    status = audioState === 'running' ? 'Audio resumed' : 'Audio remains suspended';
  }

  function setKey(root: number, scale: ScaleName): void {
    if (!SCALE_NAMES.includes(scale)) return;
    replaceRack(setRackKey(rack, root, scale));
  }

  function setProjectName(name: string): void {
    project = { ...project, name: name.trimStart() || 'Untitled Project' };
    scheduleSave();
  }

  function currentProject(): ProjectDocument {
    return updateProjectRack(projectSnapshot(), rackSnapshot());
  }

  function switchRack(id: string): void {
    if (id === project.activeRackId) return;
    const committed = currentProject();
    const target = committed.racks.find((entry) => entry.id === id);
    if (target === undefined) return;
    project = { ...committed, activeRackId: id, updatedAt: new Date().getTime() };
    rack = rackSnapshot(target.state);
    rackHistory.reset(rackSnapshot());
    syncHistoryButtons();
    publish();
    scheduleSave();
    status = `${target.name} active`;
  }

  async function handleRackTabKey(event: KeyboardEvent, index: number): Promise<void> {
    const lastIndex = project.racks.length - 1;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;
    event.preventDefault();
    const target = project.racks[nextIndex];
    if (target === undefined) return;
    switchRack(target.id);
    await tick();
    document.getElementById(`rack-tab-${target.id}`)?.focus();
  }

  function renameRack(name: string): void {
    const normalized = name.trimStart() || 'Untitled rack';
    const committed = currentProject();
    project = {
      ...committed,
      racks: committed.racks.map((entry) => entry.id === committed.activeRackId ? { ...entry, name: normalized } : entry),
    };
    scheduleSave();
  }

  function addRack(): void {
    const committed = currentProject();
    const id = crypto.randomUUID();
    const state: RackState = { bpm: rack.bpm, key: { ...rack.key }, modules: [createModule('drums')] };
    project = {
      ...committed,
      racks: [...committed.racks, { id, name: `Rack ${committed.racks.length + 1}`, state: rackSnapshot(state) }],
      activeRackId: id,
      updatedAt: new Date().getTime(),
    };
    rack = state;
    rackHistory.reset(rackSnapshot());
    syncHistoryButtons();
    publish();
    scheduleSave();
    status = 'New rack added';
  }

  function duplicateRack(): void {
    const committed = currentProject();
    const source = activeProjectRack(committed);
    const id = crypto.randomUUID();
    project = {
      ...committed,
      racks: [...committed.racks, { id, name: `${source.name} copy`, state: rackSnapshot(source.state) }],
      activeRackId: id,
      updatedAt: new Date().getTime(),
    };
    rack = rackSnapshot(source.state);
    rackHistory.reset(rackSnapshot());
    syncHistoryButtons();
    publish();
    scheduleSave();
    status = 'Rack duplicated';
  }

  function deleteRack(): void {
    if (project.racks.length <= 1) return;
    const committed = currentProject();
    const currentIndex = committed.racks.findIndex(({ id }) => id === committed.activeRackId);
    const racks = committed.racks.filter(({ id }) => id !== committed.activeRackId);
    const target = racks[Math.min(currentIndex, racks.length - 1)]!;
    project = { ...committed, racks, activeRackId: target.id, updatedAt: new Date().getTime() };
    rack = rackSnapshot(target.state);
    rackHistory.reset(rackSnapshot());
    syncHistoryButtons();
    publish();
    scheduleSave();
    status = 'Rack deleted';
  }

  function captureScene(): void {
    project = captureProjectScene(currentProject(), rackSnapshot());
    scheduleSave();
    status = `${project.scenes.at(-1)?.name ?? 'Scene'} captured`;
  }

  function launchScene(scene: ProjectScene): void {
    replaceRack(applyScene(rack, scene));
    status = playing ? `${scene.name} queued for the next bar` : `${scene.name} launched`;
  }

  function renameScene(sceneId: string, name: string): void {
    project = renameProjectScene(currentProject(), sceneId, name);
    scheduleSave();
  }

  function deleteScene(sceneId: string): void {
    const scene = project.scenes.find(({ id }) => id === sceneId);
    project = deleteProjectScene(currentProject(), sceneId);
    scheduleSave();
    status = `${scene?.name ?? 'Scene'} deleted`;
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
    if (rack.modules.length >= 16) {
      status = 'The 16-module rack limit is reached';
      return;
    }
    void runViewTransition(async () => {
      replaceRack({ ...rack, modules: [...rack.modules, createModule(selectedModuleType)] });
      await tick();
    });
    status = `${moduleLabels[selectedModuleType]} added`;
  }

  function duplicateModule(id: string): void {
    const index = rack.modules.findIndex((module) => module.id === id);
    if (index < 0 || rack.modules.length >= 16) return;
    const source = rack.modules[index]!;
    const duplicate = JSON.parse(JSON.stringify(source)) as unknown as RackModule;
    duplicate.id = createModule(source.type).id;
    duplicate.name = `${source.name} copy`;
    void runViewTransition(async () => {
      replaceRack({ ...rack, modules: [...rack.modules.slice(0, index + 1), duplicate, ...rack.modules.slice(index + 1)] });
      await tick();
    });
    status = `${source.name} duplicated`;
  }

  function deleteModule(id: string): void {
    if (rack.modules.length === 1) return;
    void runViewTransition(async () => {
      replaceRack({ ...rack, modules: rack.modules.filter((module) => module.id !== id) });
      await tick();
      document.getElementById('add-module-button')?.focus();
    });
    status = 'Module deleted';
  }

  function handleConsider(event: CustomEvent<DndEvent<RackModule>>): void {
    rack = { ...rack, modules: event.detail.items };
  }

  function handleFinalize(event: CustomEvent<DndEvent<RackModule>>): void {
    const reordered = { ...rack, modules: event.detail.items };
    void runViewTransition(async () => {
      replaceRack(reordered);
      await tick();
    });
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

  async function exportProject(): Promise<void> {
    project = updateProjectRack(projectSnapshot(), rackSnapshot());
    const blob = new Blob([projectToJson(projectSnapshot())], { type: 'application/json' });
    const fileName = `${project.name.trim().replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'sequens-r-project'}.sequens-r.json`;
    const destination = await saveBlob(blob, fileName, { description: 'sequens-R project', mime: 'application/json', extensions: ['.json'] });
    status = destination === 'cancelled' ? 'Project export cancelled' : destination === 'file' ? 'Project saved to disk' : 'Project downloaded';
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

  async function connectMidi(): Promise<void> {
    error = '';
    try {
      await midi.connect();
      status = midiState.outputs.length === 0 ? 'MIDI connected · no outputs found' : `${midiState.outputs.length} MIDI output${midiState.outputs.length === 1 ? '' : 's'} ready`;
    } catch (reason: unknown) {
      error = reason instanceof DOMException && (reason.name === 'SecurityError' || reason.name === 'NotAllowedError')
        ? 'MIDI access was denied. Allow MIDI devices in this site’s browser permissions, then try again.'
        : reason instanceof Error ? reason.message : 'MIDI hardware could not be connected.';
    }
  }

  async function exportMidi(module: RackModule | null = null): Promise<void> {
    const bytes = createSmfType1(rackSnapshot(), exportBars, module?.id ?? null);
    const baseName = safeFileName(module?.name ?? project.name, module === null ? 'sequens-r-rack' : 'sequens-r-module');
    const destination = await saveBlob(binaryBlob(bytes, 'audio/midi'), `${baseName}-${exportBars}-bars.mid`, { description: 'MIDI file', mime: 'audio/midi', extensions: ['.mid'] });
    status = destination === 'cancelled' ? 'MIDI export cancelled' : `${module?.name ?? 'Rack'} MIDI exported · ${exportBars} bars`;
  }

  async function bounceMix(): Promise<void> {
    if (exportingAudio) return;
    error = '';
    exportingAudio = true;
    status = 'Rendering WAV mix offline…';
    try {
      const audio = await renderRackAudio(rackSnapshot(), exportBars);
      const wav = encodePcm16Wav(audio);
      const destination = await saveBlob(binaryBlob(wav, 'audio/wav'), `${safeFileName(project.name, 'sequens-r-mix')}-${exportBars}-bars.wav`, { description: 'WAV audio', mime: 'audio/wav', extensions: ['.wav'] });
      status = destination === 'cancelled' ? 'WAV export cancelled' : `WAV mix exported · ${exportBars} bars`;
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The WAV mix could not be rendered.';
    } finally {
      exportingAudio = false;
    }
  }

  async function bounceStems(): Promise<void> {
    if (exportingAudio) return;
    error = '';
    exportingAudio = true;
    status = 'Rendering WAV stems offline…';
    try {
      const modules = rack.modules.filter((module) => !isControlModule(module.type) && module.monitor);
      if (modules.length === 0) throw new Error('No monitored sound modules are available to render.');
      const snapshot = rackSnapshot();
      const entries = await Promise.all(modules.map(async (module, index) => {
        const audio = await renderRackAudio(snapshot, exportBars, module.id);
        return { name: `${String(index + 1).padStart(2, '0')}-${safeFileName(module.name, module.type)}.wav`, data: encodePcm16Wav(audio) };
      }));
      const zip = createStoredZip(entries);
      const destination = await saveBlob(binaryBlob(zip, 'application/zip'), `${safeFileName(project.name, 'sequens-r-stems')}-${exportBars}-bars-stems.zip`, { description: 'ZIP archive', mime: 'application/zip', extensions: ['.zip'] });
      status = destination === 'cancelled' ? 'Stem export cancelled' : `${modules.length} WAV stems exported · ${exportBars} bars`;
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The WAV stems could not be rendered.';
    } finally {
      exportingAudio = false;
    }
  }

  async function refreshAudioOutputs(): Promise<void> {
    error = '';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      audioOutputs = devices.filter((device) => device.kind === 'audiooutput');
      status = `${audioOutputs.length} audio output${audioOutputs.length === 1 ? '' : 's'} found`;
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'Audio outputs could not be enumerated.';
    }
  }

  async function selectAudioOutput(deviceId: string): Promise<void> {
    error = '';
    try {
      await engine.setOutputDevice(deviceId);
      selectedAudioOutputId = deviceId;
      status = deviceId === '' ? 'System audio output selected' : 'Desktop audio output selected';
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The audio output could not be selected.';
    }
  }
</script>

<svelte:head><title>sequens-R · generative MIDI sequencer</title></svelte:head>

<a class="skip-link" href="#rack">Skip to rack</a>
<header class:playing class="app-header">
  <div class="brand"><p>Local generative MIDI</p><h1>sequens-R</h1></div>
  <CompositorPlayhead {playing} bpm={rack.bpm} beats={4} syncBeat={playheadBeat} className="bar-progress" />
</header>

{#if !supported}
  <main class="unsupported"><h2>This browser cannot run sequens-R.</h2><p>Use a current Chromium browser with AudioWorklet and Web MIDI support. iOS and WebKit are outside this instrument’s supported platform.</p></main>
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
      <button type="button" onclick={() => void exportProject()}>Export</button>
      <label class="import-project" for="project-import">Import</label>
      <input id="project-import" class="visually-hidden" type="file" accept="application/json,.json" onchange={importProject} />
    </section>

    {#if desktopSurface}
      <section class="rack-switcher" aria-labelledby="rack-switcher-heading">
        <div class="rack-switcher-heading">
          <div><p>Project racks</p><h2 id="rack-switcher-heading">Studio lanes</h2></div>
          <div class="rack-actions">
            <button type="button" onclick={addRack}>New rack</button>
            <button type="button" onclick={duplicateRack}>Duplicate rack</button>
            <button type="button" onclick={deleteRack} disabled={project.racks.length <= 1}>Delete rack</button>
          </div>
        </div>
        <div class="rack-tabs" role="tablist" aria-label="Project racks">
          {#each project.racks as projectRack, index (projectRack.id)}
            <button
              id={`rack-tab-${projectRack.id}`}
              type="button"
              role="tab"
              tabindex={projectRack.id === project.activeRackId ? 0 : -1}
              aria-selected={projectRack.id === project.activeRackId}
              aria-controls="module-lanes"
              onclick={() => switchRack(projectRack.id)}
              onkeydown={(event) => void handleRackTabKey(event, index)}
            >{index + 1} · {projectRack.name}</button>
          {/each}
        </div>
        <label for="rack-name">Active rack name</label>
        <input id="rack-name" value={activeProjectRack(project).name} oninput={(event) => renameRack(event.currentTarget.value)} />
      </section>
    {/if}

    <Transport bpm={rack.bpm} root={rack.key.root} scale={rack.key.scale} {playing} onplay={play} onstop={stop} onbpm={setTempo} onbpmcommit={endCoalescing} onkey={setKey} />

    <ScenePanel scenes={project.scenes} modules={rack.modules} oncapture={captureScene} onlaunch={launchScene} onrename={renameScene} ondelete={deleteScene} />

    <HardwarePanel state={midiState} onconnect={connectMidi} onclock={(portId, enabled) => midi.setClock(portId, enabled)} />

    {#if desktopSurface}
      <DesktopStudioPanel
        {audioOutputs}
        selectedOutputId={selectedAudioOutputId}
        outputSelectionSupported={engine.outputSelectionSupported}
        onrefreshoutputs={refreshAudioOutputs}
        onselectoutput={selectAudioOutput}
      />
    {/if}

    <section class="music-export" aria-labelledby="music-export-heading" aria-busy={exportingAudio}>
      <div><h2 id="music-export-heading">Music export</h2><p>Render the current deterministic rack without connecting hardware.</p></div>
      <label for="export-bars">Length</label>
      <select id="export-bars" bind:value={exportBars}>
        {#each [1, 2, 4, 8] as bars}<option value={bars}>{bars} {bars === 1 ? 'bar' : 'bars'}</option>{/each}
      </select>
      <button type="button" onclick={() => void exportMidi()} disabled={exportingAudio}>Rack MIDI</button>
      <button type="button" onclick={bounceMix} disabled={exportingAudio}>Mix WAV</button>
      <button type="button" onclick={bounceStems} disabled={exportingAudio}>WAV stems</button>
    </section>

    <section class="rack-tools" aria-label="Rack actions">
      <button type="button" class="random" onclick={() => { replaceRack(randomizeRack(rack)); status = 'New deterministic seeds generated'; }}>Random</button>
      <button type="button" onclick={share}>Share</button>
      <div class="add-module">
        <label for="module-type">New module</label>
        <select id="module-type" bind:value={selectedModuleType}>
          {#each (desktopSurface ? MODULE_TYPES : CORE_MODULE_TYPES) as type}<option value={type}>{moduleLabels[type]}</option>{/each}
        </select>
        <button id="add-module-button" type="button" onclick={addModule} disabled={rack.modules.length >= 16}>Add</button>
      </div>
    </section>

    <p class="session-status" aria-live="polite" data-scheduler-jitter-ms={schedulerJitter?.toFixed(3) ?? ''}>{status}</p>
    {#if playing && audioState === 'suspended'}<button type="button" class="resume-audio" onclick={resumeAudio}>Resume audio</button>{/if}
    {#if schedulerJitter !== null}
      <p class="scheduler-jitter">Scheduler jitter <data value={schedulerJitter.toFixed(3)}>{schedulerJitter.toFixed(3)}</data> ms σ</p>
    {/if}
    <DiagnosticsPanel diagnostics={audioDiagnostics} crossOriginIsolated={window.crossOriginIsolated} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <section
      class="module-list"
      id="module-lanes"
      role={desktopSurface ? 'tabpanel' : undefined}
      aria-label={desktopSurface ? undefined : 'Rack modules'}
      aria-labelledby={desktopSurface ? `rack-tab-${project.activeRackId}` : undefined}
      use:dragHandleZone={{ items: rack.modules, flipDurationMs: 0, zoneTabIndex: -1 }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      {#each rack.modules as module (module.id)}
        <ModulePlate
          {module}
          musicalKey={rack.key}
          bpm={rack.bpm}
          {playheadBeat}
          {playing}
          {desktopSurface}
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
          onpattern={(pattern) => setPattern(module.id, pattern)}
          onautomation={(control, step, value) => addAutomationPoint(module.id, control, step, value)}
          onclearautomation={() => clearAutomation(module.id)}
          onduplicate={() => duplicateModule(module.id)}
          ondelete={() => deleteModule(module.id)}
          rackModules={rack.modules}
          ontargetpatch={patchModule}
          midiOutputs={midiState.outputs}
          onexportmidi={() => { void exportMidi(module); }}
        />
      {/each}
    </section>
  </main>
{/if}
