<script lang="ts">
  import Icon from './Icon.svelte';
  import type { ChordEvent, MusicalKey, NoteEvent, Pattern } from '../core/pattern';
  import { SCALE_INTERVALS } from '../core/theory/scales';
  import CompositorPlayhead from './CompositorPlayhead.svelte';
  import {
    PIANO_PITCH_MAX,
    PIANO_PITCH_MIN,
    chordAtStep,
    hiddenPianoEventCount,
    setPianoEventAccent,
    setPianoEventVelocity,
    stampChord,
    transposePatternByOctave,
    transposePatternByScaleDegree,
  } from './piano-roll-model';
  import { PIANO_MELODY_EXAMPLES, pianoMelodyPattern } from './piano-melodies';

  interface HarmonySource {
    id: string;
    name: string;
    chords: readonly ChordEvent[];
  }

  interface Props {
    editorId: string;
    pattern: Pattern;
    musicalKey: MusicalKey;
    syncBeat?: number | null;
    playing: boolean;
    bpm: number;
    inKey: boolean;
    mobile?: boolean;
    harmonySources?: readonly HarmonySource[];
    onchange: (pattern: Pattern) => void;
    onaudition?: (event: NoteEvent) => void;
  }

  interface DragState {
    index: number;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    event: NoteEvent;
  }

  const ROWS = PIANO_PITCH_MAX - PIANO_PITCH_MIN + 1;
  const PITCHES = Array.from({ length: ROWS }, (_, row) => PIANO_PITCH_MAX - row);
  const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
  const MELODY_LEVELS = ['Simple', 'Developing', 'Intermediate', 'Advanced'] as const;
  let { editorId, pattern, musicalKey, syncBeat = null, playing, bpm, inKey, mobile = false, harmonySources = [], onchange, onaudition }: Props = $props();
  let surface: HTMLDivElement;
  let velocityLane: HTMLDivElement;
  let drag = $state<DragState | null>(null);
  let velocityDragIndex = $state<number | null>(null);
  let draftEvents = $state.raw<readonly NoteEvent[] | null>(null);
  let draftSelectedIndex = $state<number | null>(null);
  let selectedIndex = $state<number | null>(null);
  let cursorStep = $state(0);
  let zoom = $state(1);
  let auditionEdits = $state(false);
  let harmonySourceId = $state('');
  let melodyId = $state('');
  let visibleEvents = $derived(draftEvents ?? pattern.events);
  let activeEntries = $derived(visibleEvents
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.startStep >= 0 && note.startStep < pattern.lengthSteps));
  let selectedNote = $derived(selectedIndex === null ? null : visibleEvents[selectedIndex] ?? null);
  let hiddenNotes = $derived(hiddenPianoEventCount(pattern));
  let activeHarmonySource = $derived(harmonySources.find(({ id }) => id === harmonySourceId) ?? harmonySources[0] ?? null);
  let activeChord = $derived(activeHarmonySource === null ? null : chordAtStep(activeHarmonySource.chords, selectedNote?.startStep ?? cursorStep));
  let surfaceWidth = $derived(zoom === 0 ? '38rem' : `${Math.max(38, pattern.lengthSteps * 1.4) * zoom}rem`);
  let surfaceHeight = $derived(zoom === 0 ? '26rem' : `${ROWS * 1.15 * zoom}rem`);

  function pitchName(pitch: number): string {
    return `${PITCH_NAMES[pitch % 12]!}${Math.floor(pitch / 12) - 1}`;
  }

  function isScalePitch(pitch: number): boolean {
    const pitchClass = ((pitch - musicalKey.root) % 12 + 12) % 12;
    return SCALE_INTERVALS[musicalKey.scale].includes(pitchClass);
  }

  function isChordPitch(pitch: number): boolean {
    return activeChord?.pitches.some((candidate) => ((candidate - pitch) % 12 + 12) % 12 === 0) ?? false;
  }

  function snapPitch(pitch: number): number {
    const clamped = Math.max(PIANO_PITCH_MIN, Math.min(PIANO_PITCH_MAX, Math.round(pitch)));
    if (!inKey) return clamped;
    for (let distance = 0; distance <= 6; distance += 1) {
      for (const candidate of [clamped - distance, clamped + distance]) {
        if (isScalePitch(candidate)) return Math.max(PIANO_PITCH_MIN, Math.min(PIANO_PITCH_MAX, candidate));
      }
    }
    return clamped;
  }

  function sortedEvents(events: readonly NoteEvent[]): NoteEvent[] {
    return [...events].sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch);
  }

  function replaceEvent(index: number, event: NoteEvent, source: readonly NoteEvent[] = pattern.events): NoteEvent[] {
    return sortedEvents(source.map((current, currentIndex) => currentIndex === index ? event : current));
  }

  function maybeAudition(event: NoteEvent): void {
    if (auditionEdits) onaudition?.(event);
  }

  function auditionPitch(pitch: number): void {
    onaudition?.({ startStep: cursorStep, durationSteps: 1, pitch, velocity: 96 });
  }

  function addNote(event: PointerEvent): void {
    if (event.target !== event.currentTarget) return;
    const bounds = surface.getBoundingClientRect();
    const step = Math.max(0, Math.min(pattern.lengthSteps - 1, Math.floor((event.clientX - bounds.left) / bounds.width * pattern.lengthSteps)));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor((event.clientY - bounds.top) / bounds.height * ROWS)));
    const pitch = snapPitch(PIANO_PITCH_MAX - row);
    const note = { startStep: step, durationSteps: 1, pitch, velocity: 96 };
    const events = sortedEvents([...pattern.events, note]);
    selectedIndex = events.indexOf(note);
    cursorStep = step;
    onchange({ ...pattern, events });
    maybeAudition(note);
  }

  function addKeyboardNote(): void {
    const occupiedSteps = new Set(activeEntries.map(({ note }) => Math.floor(note.startStep)));
    const startStep = Array.from({ length: pattern.lengthSteps }, (_, index) => index).find((step) => !occupiedSteps.has(step)) ?? cursorStep;
    const note = { startStep, durationSteps: 1, pitch: snapPitch(60 + musicalKey.root), velocity: 96 };
    const events = sortedEvents([...pattern.events, note]);
    selectedIndex = events.indexOf(note);
    cursorStep = startStep;
    onchange({ ...pattern, events });
    maybeAudition(note);
  }

  function startDrag(event: PointerEvent, index: number): void {
    event.stopPropagation();
    const target = event.currentTarget as HTMLButtonElement;
    const bounds = target.getBoundingClientRect();
    const note = visibleEvents[index];
    if (note === undefined) return;
    selectedIndex = index;
    cursorStep = Math.floor(note.startStep);
    target.setPointerCapture(event.pointerId);
    drag = { index, mode: event.clientX > bounds.right - 12 ? 'resize' : 'move', startX: event.clientX, startY: event.clientY, event: note };
    draftEvents = visibleEvents;
    draftSelectedIndex = index;
    maybeAudition(note);
  }

  function continueDrag(event: PointerEvent): void {
    if (drag === null) return;
    const bounds = surface.getBoundingClientRect();
    const deltaSteps = Math.round((event.clientX - drag.startX) / bounds.width * pattern.lengthSteps);
    const deltaPitch = -Math.round((event.clientY - drag.startY) / bounds.height * ROWS);
    const next = drag.mode === 'resize'
      ? { ...drag.event, durationSteps: Math.max(0.25, Math.min(pattern.lengthSteps - drag.event.startStep, drag.event.durationSteps + deltaSteps)) }
      : { ...drag.event, startStep: Math.max(0, Math.min(pattern.lengthSteps - drag.event.durationSteps, drag.event.startStep + deltaSteps)), pitch: snapPitch(drag.event.pitch + deltaPitch) };
    const events = replaceEvent(drag.index, next, visibleEvents);
    draftEvents = events;
    draftSelectedIndex = events.indexOf(next);
    cursorStep = Math.floor(next.startStep);
  }

  function finishDrag(): void {
    if (drag === null || draftEvents === null) return;
    const auditionEvent = draftSelectedIndex === null ? null : draftEvents[draftSelectedIndex] ?? null;
    onchange({ ...pattern, events: draftEvents });
    selectedIndex = draftSelectedIndex;
    drag = null;
    draftEvents = null;
    draftSelectedIndex = null;
    if (auditionEvent !== null) maybeAudition(auditionEvent);
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
      : { ...note, startStep: Math.max(0, Math.min(pattern.lengthSteps - note.durationSteps, note.startStep + horizontal)), pitch: snapPitch(note.pitch + vertical) };
    const events = replaceEvent(index, next);
    selectedIndex = events.indexOf(next);
    cursorStep = Math.floor(next.startStep);
    onchange({ ...pattern, events });
    maybeAudition(next);
  }

  function editSelected(horizontal: number, vertical: number, resize = false): void {
    if (selectedIndex === null) return;
    const note = pattern.events[selectedIndex];
    if (note === undefined) return;
    const next = resize
      ? { ...note, durationSteps: Math.max(0.25, Math.min(pattern.lengthSteps - note.startStep, note.durationSteps + horizontal)) }
      : { ...note, startStep: Math.max(0, Math.min(pattern.lengthSteps - note.durationSteps, note.startStep + horizontal)), pitch: snapPitch(note.pitch + vertical) };
    const events = replaceEvent(selectedIndex, next);
    selectedIndex = events.indexOf(next);
    cursorStep = Math.floor(next.startStep);
    onchange({ ...pattern, events });
    maybeAudition(next);
  }

  function updateSelected(transform: (event: NoteEvent) => NoteEvent): void {
    if (selectedIndex === null) return;
    const note = pattern.events[selectedIndex];
    if (note === undefined) return;
    const next = transform(note);
    const events = replaceEvent(selectedIndex, next);
    selectedIndex = events.indexOf(next);
    onchange({ ...pattern, events });
    maybeAudition(next);
  }

  function draftSelectedVelocity(velocity: number): void {
    if (selectedIndex === null) return;
    const note = visibleEvents[selectedIndex];
    if (note === undefined) return;
    const next = setPianoEventVelocity(note, velocity);
    const events = replaceEvent(selectedIndex, next, visibleEvents);
    selectedIndex = events.indexOf(next);
    draftEvents = events;
  }

  function commitVelocityEdit(): void {
    if (draftEvents === null) return;
    const note = selectedIndex === null ? null : draftEvents[selectedIndex] ?? null;
    onchange({ ...pattern, events: draftEvents });
    draftEvents = null;
    if (note !== null) maybeAudition(note);
  }

  function deleteSelected(): void {
    if (selectedIndex === null) return;
    onchange({ ...pattern, events: pattern.events.filter((_, index) => index !== selectedIndex) });
    selectedIndex = null;
  }

  function velocityFromPointer(event: PointerEvent): number {
    const bounds = velocityLane.getBoundingClientRect();
    return Math.max(1, Math.min(127, Math.round((bounds.bottom - event.clientY) / bounds.height * 127)));
  }

  function startVelocityDrag(event: PointerEvent, index: number): void {
    event.preventDefault();
    selectedIndex = index;
    velocityDragIndex = index;
    velocityLane.setPointerCapture(event.pointerId);
    updateVelocityDrag(event);
  }

  function updateVelocityDrag(event: PointerEvent): void {
    if (velocityDragIndex === null) return;
    const note = visibleEvents[velocityDragIndex];
    if (note === undefined) return;
    const next = setPianoEventVelocity(note, velocityFromPointer(event));
    const events = replaceEvent(velocityDragIndex, next, visibleEvents);
    velocityDragIndex = events.indexOf(next);
    selectedIndex = velocityDragIndex;
    draftEvents = events;
  }

  function finishVelocityDrag(): void {
    commitVelocityEdit();
    velocityDragIndex = null;
  }

  function velocityKeyboard(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    selectedIndex = index;
    const note = pattern.events[index];
    if (note === undefined) return;
    updateSelected((current) => setPianoEventVelocity(current, current.velocity + (event.key === 'ArrowUp' ? 4 : -4)));
  }

  function transposePhrase(direction: -1 | 1): void {
    const next = transposePatternByScaleDegree(pattern, direction, musicalKey);
    onchange(next);
    if (selectedIndex !== null && next.events[selectedIndex] !== undefined) maybeAudition(next.events[selectedIndex]!);
  }

  function transposeOctave(direction: -1 | 1): void {
    const next = transposePatternByOctave(pattern, direction);
    onchange(next);
    if (selectedIndex !== null && next.events[selectedIndex] !== undefined) maybeAudition(next.events[selectedIndex]!);
  }

  function loadMelody(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    if (select.value === '') return;
    melodyId = select.value;
    const next = pianoMelodyPattern(melodyId, musicalKey);
    selectedIndex = next.events.length === 0 ? null : 0;
    cursorStep = 0;
    onchange(next);
    if (next.events[0] !== undefined) maybeAudition(next.events[0]);
    melodyId = '';
  }

  function stampActiveChord(): void {
    if (activeChord === null) return;
    const startStep = Math.floor(selectedNote?.startStep ?? cursorStep);
    const next = stampChord(pattern, activeChord, startStep, selectedNote?.velocity ?? 96);
    const additions = next.events.filter((event) => !pattern.events.includes(event) && event.startStep === startStep);
    onchange(next);
    for (const note of additions) maybeAudition(note);
  }
</script>

<section class:mobile-piano-roll={mobile} class="piano-roll-editor" data-help-key="piano-roll" aria-labelledby={`${editorId}-heading`}>
  <div class="piano-roll-heading">
    <div><h3 id={`${editorId}-heading`}>Piano roll</h3><button type="button" class="has-icon icon-only" data-help-key="add-note" aria-label="Add note" onclick={addKeyboardNote}><Icon name="plus" /></button></div>
    <p>{mobile ? 'Tap to add · select notes for precise edits.' : 'Click to add · drag to move · drag the right edge to resize.'}</p>
  </div>
  <div class="piano-pro-tools">
    <label>Load melody
      <select aria-label="Load melody example" value={melodyId} onchange={loadMelody}>
        <option value="">Choose an example…</option>
        {#each MELODY_LEVELS as level (level)}
          <optgroup label={level}>{#each PIANO_MELODY_EXAMPLES.filter((example) => example.level === level) as example (example.id)}<option value={example.id}>{example.label}</option>{/each}</optgroup>
        {/each}
      </select>
    </label>
    <label>Zoom <select aria-label="Piano roll zoom" value={zoom} onchange={(event) => { zoom = Number(event.currentTarget.value); }}><option value={0}>Fit</option><option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
    <label class="piano-audition-toggle"><input type="checkbox" checked={auditionEdits} onchange={(event) => { auditionEdits = event.currentTarget.checked; }} /> Audition edits</label>
    <button type="button" aria-label="Transpose active notes down one scale degree" onclick={() => transposePhrase(-1)}>Degree −</button>
    <button type="button" aria-label="Transpose active notes up one scale degree" onclick={() => transposePhrase(1)}>Degree +</button>
    <button type="button" aria-label="Transpose active notes down one octave" onclick={() => transposeOctave(-1)}>Octave −</button>
    <button type="button" aria-label="Transpose active notes up one octave" onclick={() => transposeOctave(1)}>Octave +</button>
    {#if harmonySources.length > 0}
      <label>Harmony <select aria-label="Harmony source" value={activeHarmonySource?.id ?? ''} onchange={(event) => { harmonySourceId = event.currentTarget.value; }}>{#each harmonySources as source (source.id)}<option value={source.id}>{source.name}</option>{/each}</select></label>
      <button type="button" onclick={stampActiveChord} disabled={activeChord === null}>Stamp chord</button>
    {/if}
    {#if hiddenNotes > 0}<span class="piano-overflow-status" role="status">{hiddenNotes} {hiddenNotes === 1 ? 'note' : 'notes'} preserved beyond loop</span>{/if}
  </div>
  <details class="piano-selection-tools" open={selectedNote !== null}>
    <summary>Edit selected{selectedNote === null ? ' · select a note first' : ` · ${pitchName(selectedNote.pitch)}, step ${Math.floor(selectedNote.startStep) + 1}`}</summary>
    <div role="group" aria-label="Selected note controls">
      <button type="button" class="icon-only" aria-label="Move selected note left" disabled={selectedNote === null} onclick={() => editSelected(-1, 0)}><Icon name="chevron-left" /></button>
      <button type="button" class="icon-only" aria-label="Move selected note right" disabled={selectedNote === null} onclick={() => editSelected(1, 0)}><Icon name="chevron-right" /></button>
      <button type="button" class="icon-only" aria-label="Move selected note up" disabled={selectedNote === null} onclick={() => editSelected(0, 1)}><Icon name="arrow-up" /></button>
      <button type="button" class="icon-only" aria-label="Move selected note down" disabled={selectedNote === null} onclick={() => editSelected(0, -1)}><Icon name="arrow-down" /></button>
      <button type="button" aria-label="Shorten selected note" disabled={selectedNote === null} onclick={() => editSelected(-1, 0, true)}>Shorten</button>
      <button type="button" aria-label="Lengthen selected note" disabled={selectedNote === null} onclick={() => editSelected(1, 0, true)}>Lengthen</button>
      <label class="piano-selected-velocity">Velocity <input aria-label="Selected note velocity" type="range" min="1" max="127" value={selectedNote?.velocity ?? 1} disabled={selectedNote === null} oninput={(event) => draftSelectedVelocity(Number(event.currentTarget.value))} onchange={commitVelocityEdit} /><output>{selectedNote?.velocity ?? '—'}</output></label>
      <label class="piano-accent-toggle"><input aria-label="Accent selected note" type="checkbox" checked={selectedNote?.accent ?? false} disabled={selectedNote === null} onchange={(event) => updateSelected((note) => setPianoEventAccent(note, event.currentTarget.checked))} /> Accent</label>
      <button type="button" class="delete" aria-label="Delete selected note" disabled={selectedNote === null} onclick={deleteSelected}>Delete</button>
    </div>
  </details>
  <div class="piano-roll-viewport" role="region" aria-label="Scrollable piano roll grid">
    <div class="piano-grid" style:--piano-surface-width={surfaceWidth} style:--piano-surface-height={surfaceHeight}>
      <div class="piano-keyboard" aria-label="Piano keyboard">
        {#each PITCHES as pitch (pitch)}<button type="button" class:black-key={PITCH_NAMES[pitch % 12]!.includes('♯')} class:scale-key={isScalePitch(pitch)} class:chord-key={isChordPitch(pitch)} class="piano-key" aria-label={`Audition ${pitchName(pitch)}`} onclick={() => auditionPitch(pitch)}>{PITCH_NAMES[pitch % 12] === 'C' ? pitchName(pitch) : PITCH_NAMES[pitch % 12]}</button>{/each}
      </div>
      <div bind:this={surface} class="piano-roll-surface" style:--piano-steps={pattern.lengthSteps} style:--piano-rows={ROWS} role="group" aria-label={`${pattern.lengthSteps}-step piano roll`} onpointerdown={addNote} onpointermove={continueDrag} onpointerup={finishDrag} onpointercancel={finishDrag}>
        {#each PITCHES as pitch, row (pitch)}<span class:scale-row={isScalePitch(pitch)} class:chord-row={isChordPitch(pitch)} class="piano-row-guide" style:--note-row={row} aria-hidden="true"></span>{/each}
        <CompositorPlayhead {playing} {bpm} beats={pattern.lengthSteps / pattern.stepsPerBeat} {syncBeat} />
        {#each activeEntries as entry (entry.index)}
          <button type="button" class:accented={entry.note.accent} class="piano-note" style:--note-start={entry.note.startStep} style:--note-length={entry.note.durationSteps} style:--note-row={PIANO_PITCH_MAX - entry.note.pitch} style:--note-velocity={entry.note.velocity} aria-label={`${pitchName(entry.note.pitch)}, step ${Math.floor(entry.note.startStep) + 1}, length ${entry.note.durationSteps}, velocity ${entry.note.velocity}${entry.note.accent ? ', accented' : ''}`} aria-pressed={selectedIndex === entry.index} onfocus={() => { selectedIndex = entry.index; cursorStep = Math.floor(entry.note.startStep); }} onpointerdown={(event) => startDrag(event, entry.index)} onkeydown={(event) => editWithKeyboard(event, entry.index)}><span aria-hidden="true"></span></button>
        {/each}
      </div>
      <div class="velocity-lane-label" aria-hidden="true">VEL</div>
      <div bind:this={velocityLane} class="piano-velocity-lane" role="group" aria-label="Note velocity lane" onpointermove={updateVelocityDrag} onpointerup={finishVelocityDrag} onpointercancel={finishVelocityDrag}>
        {#each activeEntries as entry (entry.index)}
          <button type="button" class:accented={entry.note.accent} class="piano-velocity-bar" style:--note-start={entry.note.startStep} style:--note-length={entry.note.durationSteps} style:--note-velocity={entry.note.velocity} aria-label={`${pitchName(entry.note.pitch)} velocity ${entry.note.velocity}${entry.note.accent ? ', accented' : ''}`} aria-pressed={selectedIndex === entry.index} onpointerdown={(event) => startVelocityDrag(event, entry.index)} onkeydown={(event) => velocityKeyboard(event, entry.index)}></button>
        {/each}
      </div>
    </div>
  </div>
</section>
