<script lang="ts">
  import { dragHandle } from 'svelte-dnd-action';
  import { GENERATORS } from '../generators';
  import { chordEventsForModule, modulePattern, pianoEditorPattern, type RackModule } from '../state/rack';
  import { isControlModule, type MusicalKey, type NoteEvent, type Pattern } from '../core/pattern';
  import Knob from './Knob.svelte';
  import StepGrid from './StepGrid.svelte';
  import type { MidiPortInfo } from '../midi/types';
  import PianoRoll from './PianoRoll.svelte';
  import { moduleHelpFor } from './module-help';
  import SoundPanel from './SoundPanel.svelte';
  import { MODULE_COLOR_OPTIONS, moduleColorValue, type ModuleColor } from '../state/module-color';
  import Icon from './Icon.svelte';
  import DroneField from './DroneField.svelte';

  interface Props {
    module: RackModule;
    musicalKey: MusicalKey;
    bpm: number;
    playheadBeat: number | null;
    playing: boolean;
    desktopSurface: boolean;
    onpatch: (patch: Partial<RackModule>) => void;
    onparam: (key: string, value: number) => void;
    onparamcommit: () => void;
    onsoundparam: (key: string, value: number) => void;
    onsoundpreset: (presetId: string) => void;
    onseed: (seed: number) => void;
    oncopyseed: () => void;
    onslot: (index: number) => void;
    onmutate: () => void;
    onrevert: () => void;
    onintensity: (intensity: 1 | 2 | 3 | 4) => void;
    onschedule: (on: boolean, everyNLoops: number) => void;
    onstep: (lane: number, step: number) => void;
    onduplicate: () => void;
    onmove: (offset: -1 | 1) => void;
    ondelete: () => void;
    rackModules?: readonly RackModule[];
    midiOutputs?: readonly MidiPortInfo[];
    onexportmidi: () => void;
    onpattern: (pattern: Pattern) => void;
    onpianoaudition: (event: NoteEvent) => void;
    onautomation: (control: 1 | 2 | 3 | 4, step: number, value: number) => void;
    onclearautomation: () => void;
  }

  let { module, musicalKey, bpm, playheadBeat, playing, desktopSurface, onpatch, onparam, onparamcommit, onsoundparam, onsoundpreset, onseed, oncopyseed, onslot, onmutate, onrevert, onintensity, onschedule, onstep, onduplicate, onmove, ondelete, rackModules = [], midiOutputs = [], onexportmidi, onpattern, onpianoaudition, onautomation, onclearautomation }: Props = $props();
  let pattern = $derived(module.type === 'piano' ? pianoEditorPattern(module) : modulePattern(module, musicalKey, rackModules));
  let pianoHarmonySources = $derived(rackModules
    .filter((candidate) => candidate.type === 'chords')
    .map((candidate) => ({ id: candidate.id, name: candidate.name, chords: chordEventsForModule(candidate, musicalKey) })));
  let schema = $derived(GENERATORS[module.type].paramSchema.filter((definition) => definition.control !== 'hidden'));
  let recordingCc = $state(false);
  let recordingStartedAt = 0;
  let helpActive = $state(false);
  let fullWidth = $state(false);
  let mobilePianoDialog = $state<HTMLDialogElement | null>(null);
  let mobilePianoTrigger = $state<HTMLButtonElement | null>(null);
  let activeHelpKey = $state('module');
  let activeHelpDefinition = $derived(activeHelpKey.startsWith('param:') ? schema.find((definition) => definition.key === activeHelpKey.slice('param:'.length)) : undefined);
  let activeHelp = $derived(moduleHelpFor(activeHelpKey, module.type, module.name, activeHelpDefinition));
  let ccParameterGroups = $derived(Array.from({ length: 4 }, (_, index) => schema.filter((definition) => definition.key.endsWith(String(index + 1)))));
  let modParameterGroups = $derived(Array.from({ length: 3 }, (_, index) => schema.filter((definition) => definition.key.endsWith(String(index + 1)))));
  let loopParameters = $derived(schema.filter((definition) => definition.key === 'bars'));

  function toggleCcRecording(): void {
    recordingCc = !recordingCc;
    if (recordingCc) recordingStartedAt = performance.now();
  }

  function changeParam(key: string, value: number): void {
    onparam(key, value);
    const match = /^value([1-4])$/u.exec(key);
    if (!recordingCc || module.type !== 'cc' || match === null) return;
    const control = Number(match[1]) as 1 | 2 | 3 | 4;
    const elapsedBeats = (performance.now() - recordingStartedAt) / 1000 * bpm / 60;
    const loopSteps = (module.params.bars ?? 1) * 16;
    onautomation(control, elapsedBeats * 4 % loopSteps, value);
  }

  function toggleHelp(): void {
    helpActive = !helpActive;
    activeHelpKey = helpActive ? 'help-toggle' : 'module';
  }

  function selectHelpAction(event: MouseEvent): void {
    toggleHelp();
    const menu = (event.currentTarget as HTMLElement).closest('details');
    if (!(menu instanceof HTMLDetailsElement)) return;
    menu.open = false;
    menu.querySelector<HTMLElement>('summary')?.focus();
  }

  function showContextualHelp(event: PointerEvent | FocusEvent): void {
    if (!desktopSurface || !helpActive || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[data-help-key]');
    activeHelpKey = target?.dataset.helpKey ?? 'module';
  }

  function openMobilePiano(): void {
    if (mobilePianoDialog === null || mobilePianoDialog.open) return;
    mobilePianoDialog.showModal();
  }

  function closeMobilePiano(): void {
    mobilePianoDialog?.close();
  }

  function restoreMobilePianoFocus(): void {
    mobilePianoTrigger?.focus();
  }

</script>

<article
  class:collapsed={module.collapsed}
  class:muted={module.mute}
  class:soloed={module.solo}
  class:help-active={desktopSurface && helpActive}
  class:module-full-width={desktopSurface && fullWidth}
  data-app-help-key="module-panel"
  aria-labelledby={`${module.id}-name`}
  style:view-transition-name={`module-${module.id}`}
  style:--module-background={moduleColorValue(module.color)}
  onpointerover={showContextualHelp}
  onfocusin={showContextualHelp}
>
  <div class="module-progress" aria-hidden="true"></div>
  <header class="module-header">
    <span use:dragHandle class="drag-handle" data-help-key="reorder" aria-label={`Reorder ${module.name}`}><Icon name="bars-3" /></span>
    {#if desktopSurface}
      <button type="button" class="module-width-toggle has-icon icon-only" data-help-key="module-width" aria-label={`Full-width layout for ${module.name}`} aria-pressed={fullWidth} onclick={() => { fullWidth = !fullWidth; }}><Icon name="arrows-pointing-out" /></button>
    {/if}
    <button type="button" class="module-collapse-toggle icon-only" data-help-key="collapse" aria-label={`${module.collapsed ? 'Expand' : 'Collapse'} ${module.name}`} aria-expanded={!module.collapsed} onclick={() => onpatch({ collapsed: !module.collapsed })}><Icon name={module.collapsed ? 'chevron-right' : 'chevron-down'} /></button>
    <input id={`${module.id}-name`} class="module-name" data-help-key="module-name" value={module.name} aria-label={`${module.type} module name`} oninput={(event) => onpatch({ name: (event.currentTarget as HTMLInputElement).value })} />
    <details class="module-menu">
      <summary aria-label={`${module.name} actions`}><Icon name="ellipsis-vertical" /></summary>
      <div class="module-menu-popover">
        {#if desktopSurface}
          <button
            type="button"
            class="module-help-toggle"
            data-help-key="help-toggle"
            aria-label={`${helpActive ? 'Turn off' : 'Turn on'} help for ${module.name}`}
            aria-pressed={helpActive}
            aria-controls={`${module.id}-help`}
            onclick={selectHelpAction}
          ><Icon name="question-mark-circle" /> Help</button>
        {/if}
        <label class="module-color-control" data-help-key="module-color">
          <span>Color</span>
          <select aria-label={`${module.name} color`} value={module.color} onchange={(event) => onpatch({ color: event.currentTarget.value as ModuleColor })}>
            {#each MODULE_COLOR_OPTIONS as option (option.id)}
              <option value={option.id}>{option.label}</option>
            {/each}
          </select>
        </label>
        <button type="button" data-help-key="duplicate" aria-label={`Duplicate ${module.name}`} onclick={onduplicate}>Duplicate</button>
        {#if !desktopSurface}
          <button type="button" aria-label={`Move ${module.name} earlier`} onclick={() => onmove(-1)}>Move earlier</button>
          <button type="button" aria-label={`Move ${module.name} later`} onclick={() => onmove(1)}>Move later</button>
        {/if}
        <button type="button" data-help-key="export-midi" onclick={onexportmidi}>Export MIDI</button>
        <button type="button" class="delete" data-help-key="delete" aria-label={`Delete ${module.name}`} onclick={ondelete}>Delete</button>
      </div>
    </details>
    <div class="module-switches">
      <button type="button" class="icon-only" data-help-key="monitor" aria-label={`Monitor ${module.name}`} aria-pressed={module.monitor} onclick={() => onpatch({ monitor: !module.monitor })}><Icon name="speaker-wave" /></button>
      <button type="button" data-help-key="solo" aria-label={`Solo ${module.name}`} aria-pressed={module.solo} onclick={() => onpatch({ solo: !module.solo })}>S</button>
      <button type="button" data-help-key="mute" aria-label={`Mute ${module.name}`} aria-pressed={module.mute} onclick={() => onpatch({ mute: !module.mute })}>M</button>
    </div>
    {#if !desktopSurface}
      <div class="mobile-module-meta" aria-label={`${module.type} module, slot ${module.activeSlot + 1}, ${playing && module.monitor && !module.mute ? 'active' : 'idle'}`}>
        <span class:active={playing && module.monitor && !module.mute} aria-hidden="true"></span>
        <strong>{module.type}</strong>
        <span>Slot {module.activeSlot + 1}</span>
      </div>
    {/if}
  </header>

  {#if desktopSurface}
    <section class="module-help-panel" id={`${module.id}-help`} aria-labelledby={`${module.id}-help-title`} hidden={!helpActive}>
      <div class="module-help-marker" aria-hidden="true"><Icon name="question-mark-circle" /></div>
      <div>
        <p class="module-help-kicker">Contextual help · hover or focus a control</p>
        <h3 id={`${module.id}-help-title`}>{activeHelp.title}</h3>
        <p>{activeHelp.body}</p>
      </div>
    </section>
  {/if}

  {#if !module.collapsed}
    <div class="module-body">
      {#if module.type === 'cc'}
          <div class="automation-tools">
            <button type="button" data-help-key="record-movement" aria-pressed={recordingCc} onclick={toggleCcRecording}>{recordingCc ? 'Recording movement' : 'Record movement'}</button>
            <button type="button" data-help-key="clear-automation" onclick={onclearautomation} disabled={module.automation.length === 0}>Clear automation</button>
            <span data-help-key="automation-count">{module.automation.length} recorded {module.automation.length === 1 ? 'point' : 'points'}</span>
          </div>
      {/if}
      {#if module.type !== 'piano' && !isControlModule(module.type)}
        <div class="pattern-tools">
          <div class="slot-picker" data-help-key="pattern-slots" role="group" aria-label={`${module.name} pattern slots`}>
            {#each module.slots as _, index (`${module.id}-slot-${index}`)}
              <button type="button" aria-label={`${module.name} slot ${index + 1}`} aria-pressed={module.activeSlot === index} onclick={() => onslot(index)}>{index + 1}</button>
            {/each}
          </div>
          <label for={`${module.id}-mutation-intensity`} data-help-key="mutation-intensity">Mutation</label>
          <select id={`${module.id}-mutation-intensity`} data-help-key="mutation-intensity" value={module.mutation.intensity} onchange={(event) => onintensity(Number(event.currentTarget.value) as 1 | 2 | 3 | 4)}>
            {#each [1, 2, 3, 4] as intensity (intensity)}<option value={intensity}>Level {intensity}</option>{/each}
          </select>
          <button type="button" data-help-key="mutate" onclick={onmutate}>Mutate</button>
          <button type="button" data-help-key="revert" onclick={onrevert} disabled={module.mutation.revert === null}>Revert</button>
        </div>
      {/if}
      {#if module.type === 'piano'}
          {#if desktopSurface}
            <PianoRoll editorId={`${module.id}-desktop-piano`} {pattern} {musicalKey} harmonySources={pianoHarmonySources} syncBeat={playheadBeat} {playing} {bpm} inKey={module.params.inKey === 1} onchange={onpattern} onaudition={onpianoaudition} />
          {:else}
            <button bind:this={mobilePianoTrigger} type="button" class="open-mobile-piano" aria-haspopup="dialog" aria-controls={`${module.id}-mobile-piano-dialog`} onclick={openMobilePiano}>Open Piano roll editor</button>
            <dialog
              bind:this={mobilePianoDialog}
              id={`${module.id}-mobile-piano-dialog`}
              class="mobile-piano-dialog"
              aria-labelledby={`${module.id}-mobile-piano-title`}
              onclose={restoreMobilePianoFocus}
            >
              <div class="mobile-piano-shell">
                <header>
                  <div><p>Full-screen editor</p><h2 id={`${module.id}-mobile-piano-title`}>{module.name}</h2></div>
                  <button type="button" aria-label={`Close ${module.name} editor`} onclick={closeMobilePiano}>Close</button>
                </header>
                <section class="mobile-piano-mode-controls" aria-labelledby={`${module.id}-mobile-piano-mode-heading`}>
                  <h3 id={`${module.id}-mobile-piano-mode-heading`}>Loop setup</h3>
                  <div class="parameters">
                    {#each schema as definition (definition.key)}
                      <Knob id={`${module.id}-mobile-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
                    {/each}
                  </div>
                </section>
                <PianoRoll editorId={`${module.id}-mobile-piano`} {pattern} {musicalKey} harmonySources={pianoHarmonySources} syncBeat={playheadBeat} {playing} {bpm} inKey={module.params.inKey === 1} mobile onchange={onpattern} onaudition={onpianoaudition} />
              </div>
            </dialog>
          {/if}
      {:else if module.type === 'drone'}
          <DroneField {pattern} syncBeat={playheadBeat} {playing} {bpm} />
      {:else if !isControlModule(module.type)}
          <StepGrid {pattern} syncBeat={playheadBeat} {playing} {bpm} editable={module.type === 'drums'} laneLabels={module.type === 'drums' ? ['Kick', 'Snare', 'Closed hat', 'Open hat', 'Clap', 'Tom', 'Rim', 'Perc'] : []} ontoggle={onstep} />
      {/if}
      {#if schema.length > 0 && (module.type !== 'piano' || desktopSurface)}
        {#if !desktopSurface && module.type === 'cc'}
          <div class="mobile-parameter-groups">
            <div class="parameters compact-parameters">
              {#each loopParameters as definition (definition.key)}
                <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
              {/each}
            </div>
            {#each ccParameterGroups as group, index (`cc-${index}`)}
              <details open={index === 0}>
                <summary>Control {index + 1}</summary>
                <div class="parameters">
                  {#each group as definition (definition.key)}
                    <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
                  {/each}
                </div>
              </details>
            {/each}
          </div>
        {:else if !desktopSurface && module.type === 'mod'}
          <div class="mobile-parameter-groups">
            <div class="parameters compact-parameters">
              {#each loopParameters as definition (definition.key)}
                <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
              {/each}
            </div>
            {#each modParameterGroups as group, index (`mod-${index}`)}
              <details open={index === 0}>
                <summary>LFO {index + 1}</summary>
                <div class="parameters">
                  {#each group as definition (definition.key)}
                    <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
                  {/each}
                </div>
              </details>
            {/each}
          </div>
        {:else}
        <div class="parameters">
          {#each schema as definition (definition.key)}
            <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
          {/each}
        </div>
        {/if}
      {/if}
      <SoundPanel
        moduleId={module.id}
        moduleType={module.type}
        sound={module.sound}
        onparam={onsoundparam}
        oncommit={onparamcommit}
        onpreset={onsoundpreset}
      />
      <details class="module-advanced">
        <summary>Output &amp; advanced</summary>
        <div class="module-advanced-content">
          <div class="midi-route">
            <label for={`${module.id}-midi-output`} data-help-key="midi-output">MIDI out</label>
            <select id={`${module.id}-midi-output`} data-help-key="midi-output" value={module.midi.portId ?? ''} onchange={(event) => {
              const portId = event.currentTarget.value || null;
              onpatch({ midi: { ...module.midi, portId }, ...(portId === null ? {} : { monitor: false }) });
            }}>
              <option value="">None</option>
              {#each midiOutputs as output (output.id)}<option value={output.id}>{output.name}</option>{/each}
            </select>
            <label for={`${module.id}-midi-channel`} data-help-key="midi-channel">Channel</label>
            <select id={`${module.id}-midi-channel`} data-help-key="midi-channel" value={module.midi.channel} onchange={(event) => onpatch({ midi: { ...module.midi, channel: Number(event.currentTarget.value) } })}>
              {#each Array.from({ length: 16 }, (_, index) => index + 1) as channel (channel)}<option value={channel}>{channel}</option>{/each}
            </select>
          </div>
          {#if module.type !== 'piano' && !isControlModule(module.type)}
            <div class="advanced-pattern-tools">
              <label for={`${module.id}-seed`} data-help-key="seed">Seed</label>
              <input id={`${module.id}-seed`} class="seed-input" data-help-key="seed" type="number" min="0" max="4294967295" step="1" value={module.seed} onchange={(event) => onseed(Number(event.currentTarget.value))} />
              <button type="button" data-help-key="copy-seed" aria-label={`Copy ${module.name} seed`} onclick={oncopyseed}>Copy</button>
              <label class="auto-mutate" data-help-key="auto-mutate"><input type="checkbox" checked={module.mutation.on} onchange={(event) => onschedule(event.currentTarget.checked, module.mutation.everyNLoops)} /> Auto mutate</label>
              <label for={`${module.id}-mutation-loops`} data-help-key="mutation-frequency">Every</label>
              <select class="mutation-loop-select" id={`${module.id}-mutation-loops`} data-help-key="mutation-frequency" value={module.mutation.everyNLoops} onchange={(event) => onschedule(module.mutation.on, Number(event.currentTarget.value))}>
                {#each [1, 2, 4, 8, 16] as loops (loops)}<option value={loops}>{loops} {loops === 1 ? 'loop' : 'loops'}</option>{/each}
              </select>
            </div>
          {/if}
        </div>
      </details>
    </div>
  {/if}
</article>
