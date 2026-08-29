<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
  import { AudioEngine } from './lib/audio/engine';
  import { isControlModule, isDesktopModule, SCALE_NAMES, type ModuleType, type NoteEvent, type Pattern, type ScaleName } from './lib/core/pattern';
  import { TapTempo } from './lib/core/tap-tempo';
  import {
    activeProjectRack,
    captureProjectScene,
    createProject,
    DEFAULT_PROJECT_NAME,
    deleteProjectScene,
    nonShareableModuleNames,
    projectFromJson,
    projectToJson,
    renameProjectScene,
    updateProjectRack,
    type ProjectDocument,
    type ProjectScene,
  } from './lib/project/model';
  import { DEMO_PROJECT_INDEX_URL, demoProjectUrl, groupDemoProjects, parseDemoProjectIndex, type DemoProjectEntry } from './lib/project/demos';
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
    selectModulePreset,
    setModuleSoundParam,
    toEngineSnapshot,
    toSoundSnapshot,
    toShareableRack,
    toggleDrumStep,
    type RackModule,
    type RackState,
  } from './lib/state/rack';
  import { RackHistory } from './lib/state/history';
  import ModulePlate from './lib/ui/ModulePlate.svelte';
  import MixerPanel from './lib/ui/MixerPanel.svelte';
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
  import Icon from './lib/ui/Icon.svelte';
  import { createC10AcceptanceRack } from './lib/diagnostics/phase7-acceptance';
  import type { AudioDiagnostics } from './lib/audio/engine';
  import { appHelpFor } from './lib/ui/app-help';
  import { DEFAULT_RACK_MIX, presetById, type RackMixState } from './lib/audio/sound';

  const APP_VERSION = __APP_VERSION__;
  const EMPTY_MODULE_METERS: AudioDiagnostics['moduleMeters'] = Object.freeze({});
  const SILENT_METER: AudioDiagnostics['masterMeter'] = Object.freeze({ peakDbfs: -120, rmsDbfs: -120 });

  let midiState = $state<MidiManagerState>({ permission: 'unknown', connected: false, outputs: [], clockPortIds: [] });
  const midi = new MidiManager(createBrowserMidiEnvironment(), (next) => { midiState = next; });
  const engine = new AudioEngine(handleBar, midi);
  const playbackSession = new PlaybackSession(createBrowserPlaybackPlatform(), {
    play: () => { void play(); },
    pause: () => pause(),
    stop: () => stop(),
  });
  const moduleCatalog: Readonly<Record<ModuleType, { label: string; description: string; icon: string }>> = {
    drums: { label: 'Drums', description: 'Eight-lane rhythmic step sequencer', icon: 'rectangle-group' },
    bass: { label: 'Bass', description: 'Monophonic low-end pattern generator', icon: 'musical-note' },
    acid: { label: 'Acid', description: 'Resonant 303-style melodic sequence', icon: 'adjustments-horizontal' },
    chords: { label: 'Chords', description: 'Polyphonic harmonic progressions', icon: 'squares' },
    mixer: { label: 'Mixer', description: 'Rack levels, panorama, and effects', icon: 'adjustments-horizontal' },
    arp: { label: 'Arp', description: 'Chord-driven melodic arpeggiator', icon: 'arrow-path' },
    euclid: { label: 'Euclid', description: 'Polymetric Euclidean percussion', icon: 'sparkles' },
    piano: { label: 'Piano roll', description: 'Editable notes, velocity, and accents', icon: 'musical-note' },
    cc: { label: 'CC Control', description: 'Record external MIDI automation', icon: 'cpu-chip' },
    mod: { label: 'Mod', description: 'Tempo-synced external MIDI LFOs', icon: 'arrow-path' },
  };
  const initialRack = createRackState(STARTER_RACK);
  const tempoTapper = new TapTempo();

  let rack = $state<RackState>(initialRack);
  let project = $state<ProjectDocument>(createProject(initialRack));
  const rackHistory = new RackHistory(initialRack);
  let playing = $state(false);
  let playheadBeat = $state<number | null>(null);
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
  let appHelpActive = $state(false);
  let appHelpKey = $state('overview');
  let demoProjects = $state<readonly DemoProjectEntry[]>([]);
  let demoProjectsLoaded = $state(false);
  let demoProjectsLoading = $state(false);
  let demoProjectLoadingFile = $state<string | null>(null);
  let demoProjectsError = $state('');
  let demoProjectsPopover = $state<HTMLDivElement>();
  let mixerPanVisible = $state(false);
  let mixerSendsVisible = $state(false);
  let mixerOpen = $state(false);
  let workspaceOpen = $state(false);
  let pageScrollY = $state(0);
  let headerHeight = $state(0);
  let appHelp = $derived(appHelpFor(appHelpKey));
  let demoProjectGroups = $derived(groupDemoProjects(demoProjects));

  onDestroy(() => {
    if (diagnosticTimer !== null) window.clearTimeout(diagnosticTimer);
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
    if (!desktopSurface) normalizeMobileDenseModules();
  }

  function scrollToTop(): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function normalizeMobileDenseModules(): void {
    let expandedDenseModuleFound = false;
    let changed = false;
    const modules = rack.modules.map((module) => {
      if (!isDesktopModule(module.type) || module.collapsed) return module;
      if (!expandedDenseModuleFound) {
        expandedDenseModuleFound = true;
        return module;
      }
      changed = true;
      return { ...module, collapsed: true };
    });
    if (!changed) return;
    rack = { ...rack, modules };
    publish();
    scheduleSave();
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
  }

  function handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.key === 'Escape' && appHelpActive) {
      appHelpActive = false;
      appHelpKey = 'overview';
      return;
    }
    if (!desktopSurface || isTypingTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (playing) pause(); else void play();
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

  function toggleAppHelp(): void {
    appHelpActive = !appHelpActive;
    appHelpKey = 'overview';
  }

  function showAppHelp(event: PointerEvent | FocusEvent): void {
    if (!appHelpActive || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[data-app-help-key]');
    appHelpKey = target?.dataset.appHelpKey ?? 'overview';
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
      if (!desktopSurface) normalizeMobileDenseModules();
      rackHistory.reset(rackSnapshot());
      syncHistoryButtons();
      initialized = true;
      publish();
    }
  }

  function publish(): void {
    engine.publish(toEngineSnapshot(rack), toSoundSnapshot(rack));
    syncMetering();
  }

  function meteringRequested(): boolean {
    return mixerOpen || workspaceOpen || rack.modules.some((module) => module.type === 'mixer' && !module.collapsed);
  }

  function syncMetering(): void {
    engine.setMeteringEnabled(meteringRequested());
  }

  function handleStudioPopoverToggle(event: Event, panel: 'mixer' | 'workspace'): void {
    const open = event.currentTarget instanceof HTMLElement && event.currentTarget.matches(':popover-open');
    if (panel === 'mixer') mixerOpen = open;
    else workspaceOpen = open;
    syncMetering();
    if (open) audioDiagnostics = engine.diagnostics;
    if (playing) startDiagnosticPolling();
  }

  function pollDiagnostics(): void {
    if (!playing) return;
    schedulerJitter = engine.schedulerMessageJitterMs;
    audioState = engine.state;
    audioDiagnostics = engine.diagnostics;
    diagnosticTimer = window.setTimeout(pollDiagnostics, meteringRequested() ? 100 : 500);
  }

  function startDiagnosticPolling(): void {
    if (diagnosticTimer !== null) window.clearTimeout(diagnosticTimer);
    diagnosticTimer = null;
    pollDiagnostics();
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

  function replaceSoundRack(next: RackState, coalesceKey: string | null = null): void {
    rack = rackHistory.record(rackSnapshot(next), coalesceKey);
    syncHistoryButtons();
    engine.publishSound(toSoundSnapshot(rack));
    scheduleSave();
  }

  function prepareC10AcceptanceRack(): void {
    replaceRack(createC10AcceptanceRack());
    status = 'Phase 7 C10 rack prepared · Start transport and run Diagnostics · Undo is available';
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
      const startBeat = playheadBeat ?? 0;
      publish();
      await engine.play();
      playing = true;
      playheadBeat = startBeat;
      audioState = engine.state;
      await playbackSession.setPlaying(true, rack.bpm, startBeat);
      status = 'Transport playing';
      startDiagnosticPolling();
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'Audio could not start.';
      playing = false;
    }
  }

  function haltPlaybackUi(): void {
    playing = false;
    audioState = engine.state;
    audioDiagnostics = engine.diagnostics;
    if (diagnosticTimer !== null) window.clearTimeout(diagnosticTimer);
    diagnosticTimer = null;
  }

  function pause(): void {
    const pausedBeat = engine.pause();
    if (pausedBeat !== null) playheadBeat = pausedBeat;
    haltPlaybackUi();
    void playbackSession.setPlaying(false, rack.bpm, playheadBeat ?? 0);
    status = 'Transport paused';
  }

  function stop(): void {
    const now = performance.now();
    engine.stop();
    playheadBeat = null;
    haltPlaybackUi();
    void playbackSession.setPlaying(false, rack.bpm, 0);
    status = now - lastStopTime < 400 ? 'Panic: all internal voices stopped' : 'Transport stopped';
    lastStopTime = now;
  }

  function updateModule(id: string, update: (module: RackModule) => RackModule, coalesceKey: string | null = null): void {
    replaceRack({ ...rack, modules: rack.modules.map((module) => module.id === id ? update(module) : module) }, coalesceKey);
  }

  function patchModule(id: string, modulePatch: Partial<RackModule>): void {
    const target = rack.modules.find((module) => module.id === id);
    if (!desktopSurface && target !== undefined && isDesktopModule(target.type) && modulePatch.collapsed === false) {
      replaceRack({
        ...rack,
        modules: rack.modules.map((module) => module.id === id
          ? { ...module, ...modulePatch }
          : isDesktopModule(module.type) ? { ...module, collapsed: true } : module),
      });
      return;
    }
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

  function setSoundParam(id: string, key: string, value: number): void {
    replaceSoundRack({
      ...rack,
      modules: rack.modules.map((module) => module.id === id ? setModuleSoundParam(module, key, value) : module),
    }, `sound:${id}:${key}`);
  }

  function setRackMixParam(key: keyof RackMixState, value: number): void {
    replaceSoundRack({ ...rack, mix: { ...rack.mix, [key]: value } }, `mix:${key}`);
  }

  function selectSoundPreset(id: string, presetId: string): void {
    replaceSoundRack({
      ...rack,
      modules: rack.modules.map((module) => module.id === id ? selectModulePreset(module, presetId) : module),
    });
    status = `${presetById(presetId).label} selected`;
  }

  function setPattern(id: string, pattern: Pattern): void {
    updateModule(id, (module) => setManualPattern(module, pattern), `piano:${id}`);
    endCoalescing();
    status = 'Piano roll updated · project export required for sharing';
  }

  function auditionPiano(id: string, event: NoteEvent): void {
    void engine.audition(id, event).catch((reason: unknown) => {
      status = reason instanceof Error ? reason.message : 'Piano audition failed';
    });
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
    const nextBpm = Math.round(value);
    replaceRack({ ...rack, bpm: nextBpm }, 'tempo');
    if (playing) playbackSession.updatePosition(nextBpm, playheadBeat ?? 0);
  }

  function tapTempo(): void {
    const tappedBpm = tempoTapper.tap(performance.now());
    if (tappedBpm === null) {
      status = 'Tap tempo · tap again';
      return;
    }
    setTempo(tappedBpm);
    endCoalescing();
    status = `Tap tempo · ${tappedBpm} BPM`;
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
    project = { ...project, name: name.trimStart() || DEFAULT_PROJECT_NAME };
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
    const state: RackState = { bpm: rack.bpm, key: { ...rack.key }, modules: [createModule('drums')], mix: structuredClone(DEFAULT_RACK_MIX) };
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

  function addModule(type: ModuleType): void {
    if (rack.modules.length >= 16) {
      status = 'The 16-module rack limit is reached';
      return;
    }
    const nextModule = createModule(type);
    void runViewTransition(async () => {
      replaceRack({
        ...rack,
        modules: [
          ...rack.modules.map((module) => !desktopSurface && isDesktopModule(nextModule.type) && isDesktopModule(module.type)
            ? { ...module, collapsed: true }
            : module),
          nextModule,
        ],
      });
      await tick();
    });
    status = `${moduleCatalog[type].label} added`;
  }

  function duplicateModule(id: string): void {
    const index = rack.modules.findIndex((module) => module.id === id);
    if (index < 0 || rack.modules.length >= 16) return;
    const source = rack.modules[index]!;
    const duplicate = JSON.parse(JSON.stringify(source)) as unknown as RackModule;
    duplicate.id = createModule(source.type).id;
    duplicate.name = `${source.name} copy`;
    if (!desktopSurface && isDesktopModule(source.type)) duplicate.collapsed = false;
    void runViewTransition(async () => {
      const modules = !desktopSurface && isDesktopModule(source.type)
        ? rack.modules.map((module) => isDesktopModule(module.type) ? { ...module, collapsed: true } : module)
        : rack.modules;
      replaceRack({ ...rack, modules: [...modules.slice(0, index + 1), duplicate, ...modules.slice(index + 1)] });
      await tick();
    });
    status = `${source.name} duplicated`;
  }

  function moveModule(id: string, offset: -1 | 1): void {
    const sourceIndex = rack.modules.findIndex((module) => module.id === id);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= rack.modules.length) return;
    const modules = [...rack.modules];
    const [module] = modules.splice(sourceIndex, 1);
    if (module === undefined) return;
    modules.splice(targetIndex, 0, module);
    void runViewTransition(async () => {
      replaceRack({ ...rack, modules });
      await tick();
    }).then(() => {
      status = `${module.name} moved ${offset < 0 ? 'earlier' : 'later'}`;
    });
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

  async function activateImportedProject(imported: ProjectDocument, nextStatus: string): Promise<void> {
    project = imported;
    rack = activeProjectRack(imported).state;
    if (!desktopSurface) normalizeMobileDenseModules();
    project = updateProjectRack(projectSnapshot(), rackSnapshot());
    rackHistory.reset(rackSnapshot());
    syncHistoryButtons();
    sharedDraft = false;
    publish();
    await saveCurrentProject(projectSnapshot());
    status = nextStatus;
  }

  async function importProject(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    error = '';
    try {
      const imported = projectFromJson(await file.text());
      await activateImportedProject(imported, 'Project imported and saved locally');
    } catch (reason: unknown) {
      error = reason instanceof Error ? reason.message : 'The project file could not be imported.';
    }
  }

  async function loadDemoProjectIndex(): Promise<void> {
    if (demoProjectsLoaded || demoProjectsLoading) return;
    demoProjectsLoading = true;
    demoProjectsError = '';
    try {
      const response = await fetch(DEMO_PROJECT_INDEX_URL);
      if (!response.ok) throw new Error(`Demo project list returned ${response.status}.`);
      demoProjects = parseDemoProjectIndex(await response.json());
      demoProjectsLoaded = true;
    } catch (reason: unknown) {
      demoProjectsError = reason instanceof Error ? reason.message : 'Demo projects could not be listed.';
    } finally {
      demoProjectsLoading = false;
    }
  }

  async function loadDemoProject(entry: DemoProjectEntry): Promise<void> {
    if (demoProjectLoadingFile !== null) return;
    demoProjectLoadingFile = entry.file;
    demoProjectsError = '';
    error = '';
    try {
      const response = await fetch(demoProjectUrl(entry.file));
      if (!response.ok) throw new Error(`${entry.name} returned ${response.status}.`);
      const imported = projectFromJson(await response.text());
      await activateImportedProject(imported, `${imported.name} demo loaded and saved locally`);
      demoProjectsPopover?.hidePopover();
    } catch (reason: unknown) {
      demoProjectsError = reason instanceof Error ? reason.message : 'The demo project could not be loaded.';
    } finally {
      demoProjectLoadingFile = null;
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

<svelte:window bind:scrollY={pageScrollY} />
<svelte:head><title>sequens-R · generative MIDI sequencer</title></svelte:head>

<a class="skip-link" href="#rack">Skip to rack</a>
<header bind:clientHeight={headerHeight} class:playing class:app-help-active={appHelpActive} class="app-header">
  <div class="brand">
    <div class="brand-kicker">
      <p>Local generative MIDI</p>
      <span class="app-version" aria-label={`Application version ${APP_VERSION}`}>v{APP_VERSION}</span>
    </div>
    <h1 aria-label="sequens-R"><span class="brand-title-full" aria-hidden="true">sequens-R</span><span class="brand-title-compact" aria-hidden="true">s-R</span></h1>
  </div>
  {#if supported && initialized}
    <div class="app-header-controls" role="group" aria-label="Application controls" onpointermove={showAppHelp} onfocusin={showAppHelp}>
      <Transport bpm={rack.bpm} root={rack.key.root} scale={rack.key.scale} ontap={tapTempo} onbpm={setTempo} onbpmcommit={endCoalescing} onkey={setKey} />
      <button
        type="button"
        class="header-action workspace-toggle has-icon icon-only"
        data-app-help-key="workspace"
        aria-label="Workspace"
        popovertarget="studio-workspace"
      ><Icon name="squares" /></button>
      <button
        type="button"
        class="header-action mixer-toggle has-icon icon-only"
        data-app-help-key="mixer"
        aria-label="Mixer"
        popovertarget="studio-mixer"
      ><Icon name="adjustments-horizontal" /></button>
      <button
        id="add-module-button"
        type="button"
        class="header-action has-icon"
        data-app-help-key="add-module"
        aria-label="Add Module"
        aria-haspopup="dialog"
        popovertarget="module-picker"
        disabled={rack.modules.length >= 16}
      ><Icon name="plus" /><span>Add Module</span></button>
      <button type="button" class="header-action header-random has-icon icon-only" data-app-help-key="random" aria-label="Random" onclick={() => { replaceRack(randomizeRack(rack)); status = 'New deterministic seeds generated'; }}><Icon name="sparkles" /></button>
      <button type="button" class="header-action icon-only" data-app-help-key="stop" aria-label="Stop" onclick={stop}><Icon name="stop" /></button>
      <button type="button" class="header-action has-icon icon-only" data-app-help-key="share" aria-label="Share" onclick={share}><Icon name="link" /></button>
      <button
        type="button"
        class="app-help-toggle"
        aria-label={`${appHelpActive ? 'Turn off' : 'Turn on'} general help`}
        aria-pressed={appHelpActive}
        aria-controls="app-help-readout"
        onclick={toggleAppHelp}
      ><Icon name="question-mark-circle" /></button>
      <button
        type="button"
        class="header-action header-play"
        data-app-help-key={playing ? 'pause' : 'play'}
        data-playing={playing}
        aria-label={playing ? 'Pause' : 'Play'}
        onclick={playing ? pause : play}
      ><Icon name={playing ? 'pause' : 'play'} /></button>
    </div>
  {/if}
  <CompositorPlayhead {playing} bpm={rack.bpm} beats={4} syncBeat={playheadBeat} className="bar-progress" />
</header>

{#if supported && initialized}
  <div class="module-picker" id="module-picker" popover role="dialog" aria-labelledby="module-picker-title" style={`--app-header-height: ${headerHeight}px`}>
    <header>
      <div>
        <p>Module library</p>
        <h2 id="module-picker-title">Add a module</h2>
      </div>
      <button type="button" class="icon-only" aria-label="Close module library" popovertarget="module-picker" popovertargetaction="hide"><Icon name="x-mark" /></button>
    </header>
    <div class="module-picker-grid">
      {#each MODULE_TYPES as type (type)}
        <button
          type="button"
          class="module-choice"
          data-module-type={type}
          aria-label={`Add ${moduleCatalog[type].label} module`}
          popovertarget="module-picker"
          popovertargetaction="hide"
          onclick={() => addModule(type)}
        >
          <Icon name={moduleCatalog[type].icon} />
          <strong>{moduleCatalog[type].label}</strong>
          <span>{moduleCatalog[type].description}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if supported && initialized}
  <aside class="app-help-readout" id="app-help-readout" aria-labelledby="app-help-title" hidden={!appHelpActive} style={`--app-header-height: ${headerHeight}px`}>
    <div class="app-help-marker" aria-hidden="true"><Icon name="question-mark-circle" /></div>
    <div>
      <p class="app-help-kicker">General Help · hover or focus a panel</p>
      <h2 id="app-help-title">{appHelp.title}</h2>
      <p>{appHelp.body}</p>
    </div>
  </aside>
{/if}

{#if !supported}
  <main class="unsupported"><h2>This browser cannot run sequens-R.</h2><p>Use a current Chromium browser with AudioWorklet and Web MIDI support. iOS and WebKit are outside this instrument’s supported platform.</p></main>
{:else if !initialized}
  <main class="loading" aria-busy="true"><p>Loading local project…</p></main>
{:else}
  <main id="rack" tabindex="-1" class:app-help-active={appHelpActive} onpointermove={showAppHelp} onfocusin={showAppHelp} style={`--app-header-height: ${headerHeight}px`}>
    <p class="session-status" data-app-help-key="status" aria-live="polite" data-scheduler-jitter-ms={schedulerJitter?.toFixed(3) ?? ''}>{status}</p>
    {#if playing && audioState === 'suspended'}<button type="button" class="resume-audio" onclick={resumeAudio}>Resume audio</button>{/if}
    {#if schedulerJitter !== null}
      <p class="scheduler-jitter">Scheduler jitter <data value={schedulerJitter.toFixed(3)}>{schedulerJitter.toFixed(3)}</data> ms σ</p>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <aside class="studio-mixer" id="studio-mixer" popover aria-labelledby="mixer-heading" ontoggle={(event) => handleStudioPopoverToggle(event, 'mixer')}>
      <header class="workspace-heading">
        <div>
          <p>Always-on rack mix</p>
          <h2 id="mixer-heading">Mixer</h2>
          <small>{activeProjectRack(project).name}</small>
        </div>
        <div class="mixer-heading-actions">
          <div class="mixer-heading-toggles" role="group" aria-label="Mixer channel controls">
            <button class="mixer-heading-toggle" type="button" aria-label={mixerPanVisible ? 'Hide PAN controls' : 'Show PAN controls'} aria-pressed={mixerPanVisible} onclick={() => { mixerPanVisible = !mixerPanVisible; }}>PAN</button>
            <button class="mixer-heading-toggle" type="button" aria-label={mixerSendsVisible ? 'Hide SENDS controls' : 'Show SENDS controls'} aria-pressed={mixerSendsVisible} onclick={() => { mixerSendsVisible = !mixerSendsVisible; }}>SENDS</button>
          </div>
          <button type="button" class="icon-only" aria-label="Close mixer" popovertarget="studio-mixer" popovertargetaction="hide"><Icon name="x-mark" /></button>
        </div>
      </header>
      {#if mixerOpen}
        <div class="studio-mixer-content">
          <MixerPanel
            id="rack-mixer"
            modules={rack.modules}
            mix={rack.mix}
            meters={audioDiagnostics.moduleMeters}
            masterMeter={audioDiagnostics.masterMeter}
            onpatch={patchModule}
            onsound={setSoundParam}
            onmix={setRackMixParam}
            oncommit={endCoalescing}
            showPan={mixerPanVisible}
            showSends={mixerSendsVisible}
            ariaLabel="Rack mixer controls"
          />
        </div>
      {/if}
    </aside>

    <aside class="studio-workspace" id="studio-workspace" popover aria-labelledby="workspace-heading" ontoggle={(event) => handleStudioPopoverToggle(event, 'workspace')}>
      <header class="workspace-heading">
        <div>
          <p>Studio utilities</p>
          <h2 id="workspace-heading">Workspace</h2>
          <small>{project.name}</small>
        </div>
        <button type="button" class="icon-only" aria-label="Close workspace" popovertarget="studio-workspace" popovertargetaction="hide"><Icon name="x-mark" /></button>
      </header>
      {#if workspaceOpen}<div class="workspace-utilities">
        <div class="utility-stack">
          <section class="project-tools" data-app-help-key="project-actions" aria-label="Project actions">
            <label for="project-name" data-app-help-key="project-name">Project</label>
            <input id="project-name" data-app-help-key="project-name" value={project.name} oninput={(event) => setProjectName(event.currentTarget.value)} />
            <button type="button" class="has-icon icon-only" data-app-help-key="undo" aria-label="Undo" onclick={undo} disabled={!canUndo}><Icon name="arrow-uturn-left" /></button>
            <button type="button" class="has-icon icon-only" data-app-help-key="redo" aria-label="Redo" onclick={redo} disabled={!canRedo}><Icon name="arrow-uturn-right" /></button>
            <button type="button" class="has-icon icon-only" data-app-help-key="save" aria-label={sharedDraft ? 'Save draft' : 'Save'} onclick={saveProject}><Icon name="document-check" /></button>
            <button type="button" class="has-icon icon-only" data-app-help-key="export-project" aria-label="Export" onclick={() => void exportProject()}><Icon name="document-arrow-up" /></button>
            <label class="import-project has-icon icon-only" data-app-help-key="import-project" for="project-import"><Icon name="document-arrow-down" /><span class="visually-hidden">Import</span></label>
            <input id="project-import" class="visually-hidden" data-app-help-key="import-project" type="file" accept="application/json,.json" onchange={importProject} />
            <button type="button" class="demo-projects-trigger has-icon icon-only" data-app-help-key="demo-projects" popovertarget="demo-projects-popover" aria-label="Demos projects" onclick={() => void loadDemoProjectIndex()}><Icon name="folder-open" /></button>
          </section>

          <div bind:this={demoProjectsPopover} class="demo-projects-popover" id="demo-projects-popover" popover aria-labelledby="demo-projects-heading">
            <div class="demo-projects-heading">
              <div><p>Bundled examples</p><h2 id="demo-projects-heading">Demos projects</h2></div>
              <button type="button" class="icon-only" popovertarget="demo-projects-popover" popovertargetaction="hide" aria-label="Close demos projects"><Icon name="x-mark" /></button>
            </div>
            {#if demoProjectsLoading}
              <p class="demo-projects-state" role="status">Loading demo projects…</p>
            {:else if demoProjectsError !== ''}
              <p class="demo-projects-state error" role="alert">{demoProjectsError}</p>
            {:else if demoProjectsLoaded && demoProjects.length === 0}
              <p class="demo-projects-state">No demo projects are available.</p>
            {:else}
              <div class="demo-projects-groups">
                {#each demoProjectGroups as group, genreIndex (group.genre)}
                  <section class="demo-projects-group" aria-labelledby={`demo-project-genre-${genreIndex}`}>
                    <div class="demo-projects-genre-heading"><h3 id={`demo-project-genre-${genreIndex}`}>{group.genre}</h3><span>{group.projects.length} projects</span></div>
                    <ul class="demo-projects-list">
                      {#each group.projects as entry (entry.file)}
                        <li><button type="button" onclick={() => void loadDemoProject(entry)} disabled={demoProjectLoadingFile !== null}><strong>{entry.name}</strong>{#if entry.description}<span>{entry.description}</span>{/if}{#if demoProjectLoadingFile === entry.file}<small>Loading…</small>{/if}</button></li>
                      {/each}
                    </ul>
                  </section>
                {/each}
              </div>
            {/if}
          </div>

          {#if desktopSurface}
            <section class="rack-switcher" data-app-help-key="rack-switcher" aria-labelledby="rack-switcher-heading">
              <div class="rack-switcher-heading">
                <div><p>Project racks</p><h2 id="rack-switcher-heading">Studio lanes</h2></div>
                <div class="rack-actions">
                  <button type="button" class="has-icon icon-only" data-app-help-key="new-rack" aria-label="New rack" onclick={addRack}><Icon name="plus" /></button>
                  <button type="button" class="has-icon icon-only" data-app-help-key="duplicate-rack" aria-label="Duplicate rack" onclick={duplicateRack}><Icon name="squares" /></button>
                  <button type="button" data-app-help-key="delete-rack" onclick={deleteRack} disabled={project.racks.length <= 1}>Delete rack</button>
                </div>
              </div>
              <div class="rack-tabs" role="tablist" aria-label="Project racks">
                {#each project.racks as projectRack, index (projectRack.id)}
                  <button
                    id={`rack-tab-${projectRack.id}`}
                    data-app-help-key="rack-tabs"
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
              <label for="rack-name" data-app-help-key="rack-name">Active rack name</label>
              <input id="rack-name" data-app-help-key="rack-name" value={activeProjectRack(project).name} oninput={(event) => renameRack(event.currentTarget.value)} />
            </section>
          {/if}

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

          <section class="music-export" data-app-help-key="music-export" aria-labelledby="music-export-heading" aria-busy={exportingAudio}>
            <div><h2 id="music-export-heading">Music export</h2><p>Render the current deterministic rack without connecting hardware.</p></div>
            <label for="export-bars" data-app-help-key="export-length">Length</label>
            <select id="export-bars" data-app-help-key="export-length" bind:value={exportBars}>
              {#each [1, 2, 4, 8] as bars (bars)}<option value={bars}>{bars} {bars === 1 ? 'bar' : 'bars'}</option>{/each}
            </select>
            <button type="button" class="has-icon icon-only" data-app-help-key="rack-midi" aria-label="Rack MIDI" onclick={() => void exportMidi()} disabled={exportingAudio}><Icon name="musical-note" /></button>
            <button type="button" class="has-icon icon-only" data-app-help-key="mix-wav" aria-label="Mix WAV" onclick={bounceMix} disabled={exportingAudio}><Icon name="speaker-wave" /></button>
            <button type="button" class="has-icon icon-only" data-app-help-key="wav-stems" aria-label="WAV stems" onclick={bounceStems} disabled={exportingAudio}><Icon name="rectangle-group" /></button>
          </section>
          <DiagnosticsPanel
            diagnostics={audioDiagnostics}
            crossOriginIsolated={window.crossOriginIsolated}
            bpm={rack.bpm}
            moduleCount={rack.modules.length}
            {playing}
            onpreparec10={prepareC10AcceptanceRack}
          />
        </div>
      </div>{/if}
    </aside>

    <section
      class="module-list"
      id="module-lanes"
      data-app-help-key="module-lanes"
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
          onsoundparam={(key, value) => setSoundParam(module.id, key, value)}
          onsoundpreset={(presetId) => selectSoundPreset(module.id, presetId)}
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
          onpianoaudition={(event) => auditionPiano(module.id, event)}
          onautomation={(control, step, value) => addAutomationPoint(module.id, control, step, value)}
          onclearautomation={() => clearAutomation(module.id)}
          onduplicate={() => duplicateModule(module.id)}
          onmove={(offset) => moveModule(module.id, offset)}
          ondelete={() => deleteModule(module.id)}
          rackModules={rack.modules}
          ontargetpatch={patchModule}
          rackMix={rack.mix}
          meters={module.type === 'mixer' ? audioDiagnostics.moduleMeters : EMPTY_MODULE_METERS}
          masterMeter={module.type === 'mixer' ? audioDiagnostics.masterMeter : SILENT_METER}
          ontargetsound={setSoundParam}
          onmixparam={setRackMixParam}
          midiOutputs={midiState.outputs}
          onexportmidi={() => { void exportMidi(module); }}
        />
      {/each}
    </section>
  </main>
{/if}

{#if pageScrollY > 240}
  <button type="button" class="back-to-top icon-only" aria-label="Scroll to top" onclick={scrollToTop}><Icon name="arrow-up" /></button>
{/if}
