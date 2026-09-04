<!--
@component
Accessible rotary range for Svelte 5. It preserves the native range input while
adding vertical Pointer Events dragging, Shift fine control, SVG feedback and
double-click reset. Visuals are customizable through `--rotary-knob-*` CSS
properties; continuous updates use `oninput` and gesture boundaries use
`oncommit`.
-->
<script lang="ts">
  interface Props {
    id: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    defaultValue?: number;
    name?: string;
    disabled?: boolean;
    helpKey?: string;
    /** Drops the outer hairline circle. For the 54px channel-strip and 62px
        master knobs; the 66px in-plate knob keeps it. */
    compact?: boolean;
    pixelsPerStep?: number;
    finePixelsPerStep?: number;
    formatValue?: (value: number) => string;
    oninput?: (value: number) => void;
    oncommit?: (value: number) => void;
  }

  let {
    id,
    label,
    min = 0,
    max = 1,
    step = 0.01,
    value = $bindable(0),
    defaultValue,
    name,
    disabled = false,
    helpKey,
    compact = false,
    pixelsPerStep = 2,
    finePixelsPerStep = 10,
    formatValue = (next) => String(next),
    oninput,
    oncommit,
  }: Props = $props();

  let activePointer = $state<number | null>(null);
  let lastPointerY = 0;
  let dragValue = 0;
  let dragChanged = false;

  let inputName = $derived(name ?? id);
  let normalizedValue = $derived(normalize(value));
  let percentage = $derived(max === min ? 0 : (normalizedValue - min) / (max - min) * 100);
  let angle = $derived(-135 + percentage * 2.7);
  let displayValue = $derived(formatValue(normalizedValue));

  function clamp(next: number): number {
    return Math.max(min, Math.min(max, next));
  }

  function normalize(next: number): number {
    const bounded = clamp(Number.isFinite(next) ? next : min);
    if (!(step > 0)) return bounded;
    const snapped = min + Math.round((bounded - min) / step) * step;
    return Math.round(clamp(snapped) * 1e10) / 1e10;
  }

  function setValue(next: number): boolean {
    const normalized = normalize(next);
    if (normalized === normalizedValue) return false;
    value = normalized;
    oninput?.(normalized);
    return true;
  }

  function handleNativeInput(event: Event): void {
    setValue(Number((event.currentTarget as HTMLInputElement).value));
  }

  function handleNativeChange(): void {
    oncommit?.(normalizedValue);
  }

  function handlePointerDown(event: PointerEvent): void {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const input = event.currentTarget as HTMLInputElement;
    input.focus({ preventScroll: true });
    input.setPointerCapture(event.pointerId);
    activePointer = event.pointerId;
    lastPointerY = event.clientY;
    dragValue = normalizedValue;
    dragChanged = false;
  }

  function handlePointerMove(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    event.preventDefault();
    const distance = lastPointerY - event.clientY;
    lastPointerY = event.clientY;
    const sensitivity = event.shiftKey ? finePixelsPerStep : pixelsPerStep;
    dragValue = clamp(dragValue + distance / Math.max(1, sensitivity) * step);
    dragChanged = setValue(dragValue) || dragChanged;
  }

  function finishPointer(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    const input = event.currentTarget as HTMLInputElement;
    activePointer = null;
    if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId);
    if (dragChanged) oncommit?.(normalizedValue);
    dragChanged = false;
  }

  function handleLostPointerCapture(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    if (dragChanged) oncommit?.(normalizedValue);
    dragChanged = false;
  }

  function resetToDefault(): void {
    if (disabled || defaultValue === undefined || !setValue(defaultValue)) return;
    oncommit?.(normalize(defaultValue));
  }
</script>

<div class={['rotary-knob', { dragging: activePointer !== null }]} data-help-key={helpKey}>
  <label for={id}>{label}</label>
  <output for={id}>{displayValue}</output>
  <div class="rotary-knob__face">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {#if !compact}
        <circle class="rotary-knob__rim" cx="32" cy="32" r="28"></circle>
      {/if}
      <path class="rotary-knob__track" pathLength="100" d="M 12.2 51.8 A 28 28 0 1 1 51.8 51.8"></path>
      <path
        class={['rotary-knob__value', { empty: percentage <= 0 }]}
        pathLength="100"
        d="M 12.2 51.8 A 28 28 0 1 1 51.8 51.8"
        stroke-dasharray={`${percentage} 100`}
      ></path>
      <circle class="rotary-knob__cap" cx="32" cy="30.5" r="19"></circle>
      <circle class="rotary-knob__ring" cx="32" cy="32" r="19"></circle>
      <line class="rotary-knob__indicator" x1="32" y1="16.5" x2="32" y2="24.5" transform={`rotate(${angle} 32 32)`}></line>
    </svg>
    <input
      {id}
      name={inputName}
      type="range"
      {min}
      {max}
      {step}
      value={normalizedValue}
      {disabled}
      aria-valuetext={displayValue}
      oninput={handleNativeInput}
      onchange={handleNativeChange}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={finishPointer}
      onpointercancel={finishPointer}
      onlostpointercapture={handleLostPointerCapture}
      ondblclick={resetToDefault}
    />
  </div>
</div>

<style>
  .rotary-knob {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    gap: var(--rotary-knob-gap, 0.25rem);
    align-items: center;
    min-width: 0;
    padding: var(--rotary-knob-padding, 0.5rem);
    box-shadow: inset 0 1px 0 var(--rotary-knob-divider, var(--n-520));
  }

  label {
    min-width: 0;
    overflow: hidden;
    /* Held at --color-text-muted (currently --text-1) rather than --text-2:
       these labels still sit on the legacy --module-background tints, where
       --text-2 measures 3.7:1 and fails the axe check in phase5. Move to
       --text-2 once ModulePlate replaces the tint with a spine. */
    color: var(--rotary-knob-label, var(--color-text-muted));
    font: 500 var(--rotary-knob-label-size, 0.57rem) / 1 var(--font-data);
    letter-spacing: 0.13em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  output {
    color: var(--rotary-knob-text, var(--text-hi));
    font: var(--rotary-knob-value-font, 500 0.78rem/1 var(--font-data));
    font-variant-numeric: tabular-nums;
  }

  .rotary-knob__face {
    position: relative;
    grid-column: 1 / -1;
    justify-self: center;
    width: var(--rotary-knob-size, 4.125rem);
    min-width: var(--rotary-knob-min-target, 2.75rem);
    aspect-ratio: 1;
    border-radius: 50%;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 2px 3px oklch(0% 0 0 / 55%));
  }

  /* 1 · outer hairline, completing the ring behind the track gap */
  .rotary-knob__rim {
    fill: none;
    stroke: var(--n-560);
    stroke-width: 1;
  }

  /* 2 · track arc, and 3 · value arc */
  :is(.rotary-knob__track, .rotary-knob__value) {
    fill: none;
    stroke-linecap: round;
    stroke-width: 4.25;
  }

  .rotary-knob__track {
    stroke: var(--n-560);
  }

  .rotary-knob__value {
    stroke: var(--rotary-knob-accent, var(--signal));
    transition: stroke 100ms ease;
  }

  .rotary-knob__value.empty {
    opacity: 0;
  }

  /* 4 · cap, sitting 1.5px high — this offset is what reads as machined */
  .rotary-knob__cap {
    fill: var(--rotary-knob-surface, var(--n-460));
  }

  /* 5 · body ring */
  .rotary-knob__ring {
    fill: none;
    stroke: var(--n-750);
    stroke-width: 1;
  }

  /* 6 · pointer */
  .rotary-knob__indicator {
    stroke: var(--text-hi);
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  .dragging .rotary-knob__value {
    filter: drop-shadow(0 0 0.15rem var(--rotary-knob-accent, var(--signal)));
  }

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
    opacity: 0;
    cursor: ns-resize;
    touch-action: pan-x;
  }

  .rotary-knob__face:has(input:focus-visible) {
    outline: 2px solid var(--rotary-knob-focus, var(--signal));
    outline-offset: 2px;
  }

  .rotary-knob:has(input:disabled) {
    opacity: 0.55;
  }

  .rotary-knob:has(input:disabled) input {
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .rotary-knob__value {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    svg {
      filter: none;
    }

    :is(.rotary-knob__rim, .rotary-knob__track, .rotary-knob__ring) {
      stroke: CanvasText;
    }

    .rotary-knob__cap {
      fill: Canvas;
    }

    :is(.rotary-knob__value, .rotary-knob__indicator) {
      stroke: Highlight;
    }
  }
</style>
