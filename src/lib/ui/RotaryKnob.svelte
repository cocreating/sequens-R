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
      <circle class="rotary-knob__body" cx="32" cy="32" r="24"></circle>
      <path class="rotary-knob__track" pathLength="100" d="M 15.03 48.97 A 24 24 0 1 1 48.97 48.97"></path>
      <path
        class={['rotary-knob__value', { empty: percentage <= 0 }]}
        pathLength="100"
        d="M 15.03 48.97 A 24 24 0 1 1 48.97 48.97"
        stroke-dasharray={`${percentage} 100`}
      ></path>
      <line class="rotary-knob__indicator" x1="32" y1="32" x2="32" y2="13" transform={`rotate(${angle} 32 32)`}></line>
      <circle class="rotary-knob__cap" cx="32" cy="32" r="2.25"></circle>
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
    border-block-start: 1px solid var(--rotary-knob-divider, var(--color-surface-raised, #283034));
    padding: var(--rotary-knob-padding, 0.5rem);
  }

  label {
    min-width: 0;
    overflow: hidden;
    color: var(--rotary-knob-label, var(--color-text-muted, #9aa4a8));
    font-size: var(--rotary-knob-label-size, 0.72rem);
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  output {
    color: var(--rotary-knob-text, var(--color-text, #f4f7f8));
    font: var(--rotary-knob-value-font, 0.75rem var(--font-data, ui-monospace, monospace));
    font-variant-numeric: tabular-nums;
  }

  .rotary-knob__face {
    position: relative;
    grid-column: 1 / -1;
    justify-self: center;
    width: var(--rotary-knob-size, 4.25rem);
    min-width: var(--rotary-knob-min-target, 2.75rem);
    aspect-ratio: 1;
    border-radius: 50%;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 0.3rem 0.5rem rgb(0 0 0 / 28%));
  }

  :is(.rotary-knob__track, .rotary-knob__value) {
    fill: none;
    stroke-linecap: round;
    stroke-width: 3.5;
  }

  .rotary-knob__body {
    fill: var(--rotary-knob-surface, var(--color-canvas, #101315));
    stroke: var(--rotary-knob-border, var(--color-surface-raised, #283034));
    stroke-width: 6;
  }

  .rotary-knob__track {
    stroke: var(--rotary-knob-track, var(--color-structure, #617077));
    opacity: 0.55;
  }

  .rotary-knob__value,
  .rotary-knob__indicator,
  .rotary-knob__cap {
    stroke: var(--rotary-knob-accent, var(--color-playing, #c8ff00));
  }

  .rotary-knob__value {
    transition: stroke 100ms ease;
  }

  .rotary-knob__value.empty {
    opacity: 0;
  }

  .rotary-knob__indicator {
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  .rotary-knob__cap {
    fill: var(--rotary-knob-surface, var(--color-canvas, #101315));
    stroke-width: 1.5;
  }

  .dragging .rotary-knob__value {
    stroke: var(--rotary-knob-active, var(--rotary-knob-accent, var(--color-playing, #c8ff00)));
    filter: drop-shadow(0 0 0.15rem var(--rotary-knob-active, var(--rotary-knob-accent, var(--color-playing, #c8ff00))));
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
    outline: 0.1875rem solid var(--rotary-knob-focus, var(--color-playing, #c8ff00));
    outline-offset: 0.1875rem;
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

    :is(.rotary-knob__body, .rotary-knob__track) {
      stroke: CanvasText;
    }

    :is(.rotary-knob__value, .rotary-knob__indicator, .rotary-knob__cap) {
      stroke: Highlight;
    }
  }
</style>
