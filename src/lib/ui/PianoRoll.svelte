<script lang="ts">
  import type { MusicalKey, NoteEvent, Pattern } from '../core/pattern';
  import { SCALE_INTERVALS } from '../core/theory/scales';

  interface Props {
    pattern: Pattern;
    musicalKey: MusicalKey;
    playheadBeat?: number | null;
    inKey: boolean;
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
  let { pattern, musicalKey, playheadBeat = null, inKey, onchange }: Props = $props();
  let surface: HTMLDivElement;
  let drag = $state<DragState | null>(null);
  let draftEvents = $state<readonly NoteEvent[] | null>(null);
  let visibleEvents = $derived(draftEvents ?? pattern.events);
  let currentStep = $derived(playheadBeat === null ? null : Math.floor(playheadBeat * pattern.stepsPerBeat) % pattern.lengthSteps);

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
    onchange({ ...pattern, events: [...pattern.events, { startStep: step, durationSteps: 1, pitch, velocity: 96 }].sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch) });
  }

  function startDrag(event: PointerEvent, index: number): void {
    event.stopPropagation();
    const target = event.currentTarget as HTMLButtonElement;
    const bounds = target.getBoundingClientRect();
    target.setPointerCapture(event.pointerId);
    drag = {
      index,
      mode: event.clientX > bounds.right - 12 ? 'resize' : 'move',
      startX: event.clientX,
      startY: event.clientY,
      event: pattern.events[index]!,
    };
    draftEvents = pattern.events;
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
    draftEvents = replaceEvent(drag.index, next, pattern.events);
  }

  function finishDrag(): void {
    if (drag === null || draftEvents === null) return;
    onchange({ ...pattern, events: draftEvents });
    drag = null;
    draftEvents = null;
  }

  function editWithKeyboard(event: KeyboardEvent, index: number): void {
    const note = pattern.events[index];
    if (note === undefined) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onchange({ ...pattern, events: pattern.events.filter((_, current) => current !== index) });
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
    onchange({ ...pattern, events: replaceEvent(index, next) });
  }
</script>

<section class="piano-roll-editor" aria-labelledby="piano-roll-heading">
  <div class="piano-roll-heading">
    <h3 id="piano-roll-heading">Piano roll</h3>
    <p>Click to add · drag to move · drag a note’s right edge to resize · Delete removes.</p>
  </div>
  <div
    bind:this={surface}
    class="piano-roll-surface"
    style:--piano-steps={pattern.lengthSteps}
    style:--piano-rows={ROWS}
    role="grid"
    tabindex="0"
    aria-label={`${pattern.lengthSteps}-step piano roll`}
    onpointerdown={addNote}
    onpointermove={continueDrag}
    onpointerup={finishDrag}
    onpointercancel={finishDrag}
  >
    {#if currentStep !== null}
      <div class="piano-playhead" style:--playhead-step={currentStep} aria-hidden="true"></div>
    {/if}
    {#each visibleEvents as note, index (index)}
      <button
        type="button"
        class="piano-note"
        style:--note-start={note.startStep}
        style:--note-length={note.durationSteps}
        style:--note-row={PITCH_MAX - note.pitch}
        aria-label={`MIDI note ${note.pitch}, step ${Math.floor(note.startStep) + 1}, length ${note.durationSteps}`}
        onpointerdown={(event) => startDrag(event, index)}
        onkeydown={(event) => editWithKeyboard(event, index)}
      ><span aria-hidden="true"></span></button>
    {/each}
  </div>
</section>
