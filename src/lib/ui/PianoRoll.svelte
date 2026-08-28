<script lang="ts">
  import Icon from './Icon.svelte';
  import type { MusicalKey, NoteEvent, Pattern } from '../core/pattern';
  import { SCALE_INTERVALS } from '../core/theory/scales';
  import CompositorPlayhead from './CompositorPlayhead.svelte';

  interface Props {
    editorId: string;
    pattern: Pattern;
    musicalKey: MusicalKey;
    syncBeat?: number | null;
    playing: boolean;
    bpm: number;
    inKey: boolean;
    mobile?: boolean;
    onchange: (pattern: Pattern) => void;
  }

  interface DragState {
    index: number;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    event: NoteEvent;
  }

  const PITCH_MIN = 36;
  const PITCH_MAX = 83;
  const ROWS = PITCH_MAX - PITCH_MIN + 1;
  let { editorId, pattern, musicalKey, syncBeat = null, playing, bpm, inKey, mobile = false, onchange }: Props = $props();
  let surface: HTMLDivElement;
  let drag = $state<DragState | null>(null);
  let draftEvents = $state<readonly NoteEvent[] | null>(null);
  let draftSelectedIndex = $state<number | null>(null);
  let selectedIndex = $state<number | null>(null);
  let visibleEvents = $derived(draftEvents ?? pattern.events);
  let selectedNote = $derived(selectedIndex === null ? null : visibleEvents[selectedIndex] ?? null);

  function snapPitch(pitch: number): number {
    const clamped = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(pitch)));
    if (!inKey) return clamped;
    const intervals = SCALE_INTERVALS[musicalKey.scale];
    for (let distance = 0; distance <= 6; distance += 1) {
      for (const candidate of [clamped - distance, clamped + distance]) {
        const pitchClass = ((candidate - musicalKey.root) % 12 + 12) % 12;
        if (intervals.includes(pitchClass)) return Math.max(PITCH_MIN, Math.min(PITCH_MAX, candidate));
      }
    }
    return clamped;
  }

  function replaceEvent(index: number, event: NoteEvent, source: readonly NoteEvent[] = pattern.events): NoteEvent[] {
    return source.map((current, currentIndex) => currentIndex === index ? event : current)
      .sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch);
  }

  function addNote(event: PointerEvent): void {
    if (event.target !== event.currentTarget) return;
    const bounds = surface.getBoundingClientRect();
    const step = Math.max(0, Math.min(pattern.lengthSteps - 1, Math.floor((event.clientX - bounds.left) / bounds.width * pattern.lengthSteps)));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor((event.clientY - bounds.top) / bounds.height * ROWS)));
    const pitch = snapPitch(PITCH_MAX - row);
    const note = { startStep: step, durationSteps: 1, pitch, velocity: 96 };
    const events = [...pattern.events, note].sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch);
    selectedIndex = events.indexOf(note);
    onchange({ ...pattern, events });
  }

  function addKeyboardNote(): void {
    const occupiedSteps = new Set(pattern.events.map((event) => Math.floor(event.startStep)));
    const startStep = Array.from({ length: pattern.lengthSteps }, (_, index) => index).find((step) => !occupiedSteps.has(step)) ?? 0;
    const pitch = snapPitch(60 + musicalKey.root);
    const note = { startStep, durationSteps: 1, pitch, velocity: 96 };
    const events = [...pattern.events, note].sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch);
    selectedIndex = events.indexOf(note);
    onchange({ ...pattern, events });
  }

  function startDrag(event: PointerEvent, index: number): void {
    event.stopPropagation();
    const target = event.currentTarget as HTMLButtonElement;
    const bounds = target.getBoundingClientRect();
    selectedIndex = index;
    target.setPointerCapture(event.pointerId);
    drag = {
      index,
      mode: event.clientX > bounds.right - 12 ? 'resize' : 'move',
      startX: event.clientX,
      startY: event.clientY,
      event: pattern.events[index]!,
    };
    draftEvents = pattern.events;
    draftSelectedIndex = index;
  }

  function continueDrag(event: PointerEvent): void {
    if (drag === null) return;
    const bounds = surface.getBoundingClientRect();
    const deltaSteps = Math.round((event.clientX - drag.startX) / bounds.width * pattern.lengthSteps);
    const deltaPitch = -Math.round((event.clientY - drag.startY) / bounds.height * ROWS);
    const next = drag.mode === 'resize'
      ? { ...drag.event, durationSteps: Math.max(0.25, Math.min(pattern.lengthSteps - drag.event.startStep, drag.event.durationSteps + deltaSteps)) }
      : {
          ...drag.event,
          startStep: Math.max(0, Math.min(pattern.lengthSteps - drag.event.durationSteps, drag.event.startStep + deltaSteps)),
          pitch: snapPitch(drag.event.pitch + deltaPitch),
        };
    const events = replaceEvent(drag.index, next, pattern.events);
    draftEvents = events;
    draftSelectedIndex = events.indexOf(next);
  }

  function finishDrag(): void {
    if (drag === null || draftEvents === null) return;
    onchange({ ...pattern, events: draftEvents });
    selectedIndex = draftSelectedIndex;
    drag = null;
    draftEvents = null;
    draftSelectedIndex = null;
  }

  function editWithKeyboard(event: KeyboardEvent, index: number): void {
    const note = pattern.events[index];
    if (note === undefined) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onchange({ ...pattern, events: pattern.events.filter((_, current) => current !== index) });
      selectedIndex = null;
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const vertical = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
    const next = event.shiftKey && horizontal !== 0
      ? { ...note, durationSteps: Math.max(0.25, Math.min(pattern.lengthSteps - note.startStep, note.durationSteps + horizontal)) }
      : {
          ...note,
          startStep: Math.max(0, Math.min(pattern.lengthSteps - note.durationSteps, note.startStep + horizontal)),
          pitch: snapPitch(note.pitch + vertical),
        };
    const events = replaceEvent(index, next);
    selectedIndex = events.indexOf(next);
    onchange({ ...pattern, events });
  }

  function editSelected(horizontal: number, vertical: number, resize = false): void {
    if (selectedIndex === null) return;
    const note = pattern.events[selectedIndex];
    if (note === undefined) return;
    const next = resize
      ? { ...note, durationSteps: Math.max(0.25, Math.min(pattern.lengthSteps - note.startStep, note.durationSteps + horizontal)) }
      : {
          ...note,
          startStep: Math.max(0, Math.min(pattern.lengthSteps - note.durationSteps, note.startStep + horizontal)),
          pitch: snapPitch(note.pitch + vertical),
        };
    const events = replaceEvent(selectedIndex, next);
    selectedIndex = events.indexOf(next);
    onchange({ ...pattern, events });
  }

  function deleteSelected(): void {
    if (selectedIndex === null) return;
    onchange({ ...pattern, events: pattern.events.filter((_, index) => index !== selectedIndex) });
    selectedIndex = null;
  }
</script>

<section class:mobile-piano-roll={mobile} class="piano-roll-editor" data-help-key="piano-roll" aria-labelledby={`${editorId}-heading`}>
  <div class="piano-roll-heading">
    <div><h3 id={`${editorId}-heading`}>Piano roll</h3><button type="button" class="has-icon icon-only" data-help-key="add-note" aria-label="Add note" onclick={addKeyboardNote}><Icon name="plus" /></button></div>
    <p>{mobile ? 'Tap the grid to add · tap a note to select · use Edit selected for precise changes.' : 'Click to add · drag to move · drag a note’s right edge to resize · Delete removes.'}</p>
  </div>
  {#if mobile}
    <details class="piano-selection-tools" open={selectedNote !== null}>
      <summary>Edit selected{selectedNote === null ? ' · select a note first' : ` · MIDI ${selectedNote.pitch}, step ${Math.floor(selectedNote.startStep) + 1}`}</summary>
      <div role="group" aria-label="Selected note controls">
        <button type="button" class="icon-only" aria-label="Move selected note left" disabled={selectedNote === null} onclick={() => editSelected(-1, 0)}><Icon name="chevron-left" /></button>
        <button type="button" class="icon-only" aria-label="Move selected note right" disabled={selectedNote === null} onclick={() => editSelected(1, 0)}><Icon name="chevron-right" /></button>
        <button type="button" class="icon-only" aria-label="Move selected note up" disabled={selectedNote === null} onclick={() => editSelected(0, 1)}><Icon name="arrow-up" /></button>
        <button type="button" class="icon-only" aria-label="Move selected note down" disabled={selectedNote === null} onclick={() => editSelected(0, -1)}><Icon name="arrow-down" /></button>
        <button type="button" aria-label="Shorten selected note" disabled={selectedNote === null} onclick={() => editSelected(-1, 0, true)}>Shorten</button>
        <button type="button" aria-label="Lengthen selected note" disabled={selectedNote === null} onclick={() => editSelected(1, 0, true)}>Lengthen</button>
        <button type="button" class="delete" aria-label="Delete selected note" disabled={selectedNote === null} onclick={deleteSelected}>Delete</button>
      </div>
    </details>
  {/if}
  <div class="piano-roll-viewport" role={mobile ? 'region' : undefined} aria-label={mobile ? 'Scrollable piano roll grid' : undefined}>
    <div
      bind:this={surface}
      class="piano-roll-surface"
      style:--piano-steps={pattern.lengthSteps}
      style:--piano-rows={ROWS}
      role="group"
      aria-label={`${pattern.lengthSteps}-step piano roll`}
      onpointerdown={addNote}
      onpointermove={continueDrag}
      onpointerup={finishDrag}
      onpointercancel={finishDrag}
    >
      <CompositorPlayhead {playing} {bpm} beats={pattern.lengthSteps / pattern.stepsPerBeat} {syncBeat} />
      {#each visibleEvents as note, index (index)}
        <button
          type="button"
          class="piano-note"
          style:--note-start={note.startStep}
          style:--note-length={note.durationSteps}
          style:--note-row={PITCH_MAX - note.pitch}
          aria-label={`MIDI note ${note.pitch}, step ${Math.floor(note.startStep) + 1}, length ${note.durationSteps}`}
          aria-pressed={selectedIndex === index}
          onfocus={() => { selectedIndex = index; }}
          onpointerdown={(event) => startDrag(event, index)}
          onkeydown={(event) => editWithKeyboard(event, index)}
        ><span aria-hidden="true"></span></button>
      {/each}
    </div>
  </div>
</section>
