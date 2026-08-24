<script lang="ts">
  import { dragHandle } from 'svelte-dnd-action';
  import { GENERATORS } from '../generators';
  import { modulePattern, type RackModule } from '../state/rack';
  import { isControlModule, isDesktopModule, type MusicalKey, type Pattern } from '../core/pattern';
  import Knob from './Knob.svelte';
  import StepGrid from './StepGrid.svelte';
  import MixerPanel from './MixerPanel.svelte';
  import type { MidiPortInfo } from '../midi/types';
  import PianoRoll from './PianoRoll.svelte';

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
    midiOutputs?: readonly MidiPortInfo[];
    onexportmidi: () => void;
    onpattern: (pattern: Pattern) => void;
    onautomation: (control: 1 | 2 | 3 | 4, step: number, value: number) => void;
    onclearautomation: () => void;
  }

  let { module, musicalKey, bpm, playheadBeat, playing, desktopSurface, onpatch, onparam, onparamcommit, onseed, oncopyseed, onslot, onmutate, onrevert, onintensity, onschedule, onstep, onduplicate, ondelete, rackModules = [], ontargetpatch, midiOutputs = [], onexportmidi, onpattern, onautomation, onclearautomation }: Props = $props();
  let pattern = $derived(modulePattern(module, musicalKey, rackModules));
  let schema = $derived(GENERATORS[module.type].paramSchema.filter((definition) => definition.control !== 'hidden'));
  let recordingCc = $state(false);
  let recordingStartedAt = 0;

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
</script>

{#if isDesktopModule(module.type) && !desktopSurface}
  <article class="desktop-module-readonly" class:muted={module.mute} aria-labelledby={`${module.id}-mobile-name`}>
    <div class="module-progress" aria-hidden="true"></div>
    <header class="desktop-module-readonly-header">
      <div><span>Desktop module</span><h2 id={`${module.id}-mobile-name`}>{module.name}</h2></div>
      <span class="module-state">{module.mute ? 'Muted' : 'Playing'}</span>
    </header>
    <p>This module is reproduced from the patch, but editing is available on screens 1024 px or wider.</p>
  </article>
{:else}
<article class:collapsed={module.collapsed} class:muted={module.mute} class:soloed={module.solo} aria-labelledby={`${module.id}-name`} style:view-transition-name={`module-${module.id}`}>
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
      <div class="midi-route">
        <label for={`${module.id}-midi-output`}>MIDI out</label>
        <select id={`${module.id}-midi-output`} value={module.midi.portId ?? ''} onchange={(event) => {
          const portId = event.currentTarget.value || null;
          onpatch({ midi: { ...module.midi, portId }, ...(portId === null ? {} : { monitor: false }) });
        }}>
          <option value="">None</option>
          {#each midiOutputs as output (output.id)}<option value={output.id}>{output.name}</option>{/each}
        </select>
        <label for={`${module.id}-midi-channel`}>Channel</label>
        <select id={`${module.id}-midi-channel`} value={module.midi.channel} onchange={(event) => onpatch({ midi: { ...module.midi, channel: Number(event.currentTarget.value) } })}>
          {#each Array.from({ length: 16 }, (_, index) => index + 1) as channel}<option value={channel}>{channel}</option>{/each}
        </select>
        {#if module.type !== 'mixer'}<button type="button" class="module-midi-export" onclick={onexportmidi}>Export MIDI</button>{/if}
      </div>
      {#if module.type === 'mixer'}
        <MixerPanel modules={rackModules} onpatch={(id, patch) => ontargetpatch?.(id, patch)} />
      {:else}
        {#if module.type === 'cc'}
          <div class="automation-tools">
            <button type="button" aria-pressed={recordingCc} onclick={toggleCcRecording}>{recordingCc ? 'Recording movement' : 'Record movement'}</button>
            <button type="button" onclick={onclearautomation} disabled={module.automation.length === 0}>Clear automation</button>
            <span>{module.automation.length} recorded {module.automation.length === 1 ? 'point' : 'points'}</span>
          </div>
        {/if}
        {#if module.type !== 'piano' && !isControlModule(module.type)}
        <div class="pattern-tools">
          <div class="slot-picker" role="group" aria-label={`${module.name} pattern slots`}>
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
        {/if}
        {#if module.type === 'piano'}
          <PianoRoll {pattern} {musicalKey} syncBeat={playheadBeat} {playing} {bpm} inKey={module.params.inKey === 1} onchange={onpattern} />
        {:else if !isControlModule(module.type)}
          <StepGrid {pattern} syncBeat={playheadBeat} {playing} {bpm} editable={module.type === 'drums'} ontoggle={onstep} />
        {/if}
      {/if}
      {#if schema.length > 0}
        <div class="parameters">
          {#each schema as definition (definition.key)}
            <Knob id={`${module.id}-${definition.key}`} {definition} value={module.params[definition.key] ?? definition.defaultValue} onchange={(value) => changeParam(definition.key, value)} oncommit={onparamcommit} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</article>
{/if}
