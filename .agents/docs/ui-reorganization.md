# Studio UI reorganization evidence

Status: implementation and automated acceptance complete on 2026-08-24.

This is the UI consolidation requested before the next SDD phase is defined. It changes hierarchy and control presentation without changing audio scheduling, generator output, project persistence, share encoding, MIDI timing, or export formats.

## Delivered

- Compact performance deck containing Play/Stop, tempo, key, Random, Share, and module creation.
- Mobile critical path with the rack directly after one collapsed `Workspace` row.
- Desktop studio with a sticky workspace rail and three parallel module lanes at 1440 CSS px.
- Workspace grouping for project, racks, scenes, hardware MIDI, audio output, shortcuts, music export, and diagnostics.
- Compact module headers with reorder/name/monitor/solo/mute/collapse plus a `More` disclosure for Help, duplicate, module MIDI export, and delete.
- Musical-first module bodies: slots, mutation, grid/editor, and parameters precede `Output & advanced` routing, seed, and automatic mutation controls.
- Schema-driven control language:
  - rotary native ranges for Swing, Humanize, Density, Fill, Drive, Gate, Decay, Strum, CC values, and LFO depth/fade/center;
  - steppers for counts, ranges, octaves, notes, channels, loop lengths, and Euclidean values;
  - segmented controls for short discrete choices such as 16/32 steps, piano length/mode, and MIDI channel grouping;
  - switches for binary Follow chords and LFO enable states;
  - selects for named styles, qualities, shapes, rates, and longer enumerations;
  - vertical native range faders for desktop mixer levels.
- Named Kick, Snare, Closed hat, Open hat, Clap, Tom, Rim, and Perc drum lanes.

## Accessibility and behavior

- Rotary controls retain `input[type=range]`, value text, arrow-key semantics, a visible focus ring on the rotary face, and native input/change events.
- Steppers combine labelled number inputs with 44 px decrement/increment buttons and disabled boundaries.
- Segmented choices use a labelled group of pressed-state buttons; binary controls use native checkboxes.
- Workspace and advanced disclosures preserve their user-selected open state through rack edits and asynchronous status updates.
- Mobile and desktop keep semantic landmarks, heading order, live status/error regions, touch targets, reduced motion, and the existing contextual-help data model.

## Visual evidence

- Selected target: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/00-source-proposed.png`
- Final desktop: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/06-desktop-final.png`
- Final mobile: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/08-mobile-final.png`
- Final desktop comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/09-desktop-comparison-final.png`
- Final mobile comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/10-mobile-comparison-final.png`

## Automated acceptance

The full command is `npm run verify`. It covers strict Svelte/TypeScript diagnostics, 52 deterministic unit tests, the production PWA build, the initial-JavaScript budget, 23 Chrome flows, and the existing axe serious/critical gate. Browser flows were updated to open the new workspace, module action, and advanced disclosures before exercising the unchanged underlying operations.

Executed on 2026-08-24:

```text
svelte-check: 0 errors, 0 warnings
Vitest: 11 files / 52 tests passed
production PWA build: 10 entries / 252.00 KiB precached
initial JavaScript: 75.21 KiB gzip / 200.00 KiB budget
Playwright Chrome: 23 tests passed
axe: no serious or critical violations
```
