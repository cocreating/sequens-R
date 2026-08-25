# Studio UI reorganization evidence

Status: implementation complete on 2026-08-24; follow-up refinements and current regression acceptance recorded on 2026-08-25.

This is the UI consolidation completed before Phase 6 was defined. It changes hierarchy and control presentation without changing generator output, project persistence, share encoding, or export formats. Its later transport refinement adds exact-beat Pause/Resume scheduling and MIDI Continue behavior. The resulting vertical mobile rack, disclosures, schema-driven controls, and performance-first hierarchy became the foundation used by the implemented Phase 6 mobile editors.

Phase 6 implementation and evidence are recorded separately in `phase-6-mobile-studio.md`; this file remains the record for the cross-phase consolidation and its subsequent desktop refinements.

## Delivered

- Compact global header containing Tap BPM, a stable Play/Pause toggle, Stop, Share, and General Help, followed by a performance deck for tempo, key, Random, and module creation.
- Tap BPM averages up to six valid taps, resets after intervals outside the supported 20–300 BPM range, and writes a whole-number tempo. The labelled BPM field adds 44 px minus/plus controls on its left for one-BPM changes, with disabled 20/300 boundaries; manual entry also writes whole values.
- Pause preserves the current transport beat, freezes the header/grid/piano playheads on it, and clears scheduled internal/MIDI events; Play continues from that beat while Stop resets to zero and hides the playheads.
- Responsive branding that shows `Local generative MIDI` and `sequens-R` on desktop, then reduces to `s-R` without the subtext on mobile.
- Mobile critical path with the rack directly after one collapsed `Workspace` row.
- Desktop studio with a sticky workspace rail and three parallel module lanes at 1440 CSS px.
- Closed desktop Workspace state reduced to one accessible 44 px toolbox trigger, allowing the module lanes to reclaim the released width.
- Workspace grouping for project, racks, scenes, hardware MIDI, audio output, shortcuts, music export, and diagnostics.
- An icon-only 📂 `Demos projects` action directly after project import, retaining its explicit accessible name while opening a native popover that lists the validated `public/projects/index.json` catalog and activates a selected project through the standard import boundary.
- Compact module headers whose first row follows reorder → desktop full-width → collapse → `⋯` actions → top-right editable name; monitor, solo, and mute occupy a balanced second row. The actions disclosure contains Help, duplicate, module MIDI export, and delete.
- Desktop-only per-module full-width toggles that span all current lanes without changing saved project or playback state.
- Musical-first module bodies: slots, mutation, grid/editor, and parameters precede `Output & advanced` routing, seed, and automatic mutation controls.
- Schema-driven control language:
  - rotary native ranges for Swing, Humanize, Density, Fill, Drive, Gate, Decay, Strum, CC values, and LFO depth/fade/center;
  - steppers for counts, ranges, octaves, notes, channels, loop lengths, and Euclidean values;
  - segmented controls for short discrete choices such as 16/32 steps, piano length/mode, and MIDI channel grouping;
  - switches for binary Follow chords and LFO enable states;
  - selects for named styles, qualities, shapes, rates, and longer enumerations;
  - vertical native range faders for desktop mixer levels.
- Rotary parameters delegate to an independent Svelte 5 `RotaryKnob` component. Its SVG arc and indicator remain visual decoration around a native range input; vertical Pointer Events dragging uses pointer capture, Shift increases pixels per domain step, and double click restores the schema default. Component-specific CSS properties keep the visual layer themeable without coupling it to generator definitions or adding a runtime dependency.
- Named Kick, Snare, Closed hat, Open hat, Clap, Tom, Rim, and Perc drum lanes.
- Icon-only affordances for recognizable frequent actions: Play/Pause, Stop, Share, General Help, Random, Add, Undo/Redo, Save, project export/import/demo discovery, rack creation/duplication, scene capture, hardware connect/refresh, music exports, and piano-note creation. Ambiguous or higher-consequence controls such as Delete, Mutate/Revert, scene launch, recording, advanced routing, and module-menu commands retain visible text.

## Accessibility and behavior

- Rotary controls retain `input[type=range]`, value text, arrow-key semantics, a visible focus ring on the rotary face, and native input/change events.
- Rotary pointer and touch gestures snap to the schema step, commit once at the gesture boundary, retain horizontal touch panning, and preserve the existing coalesced undo contract.
- Steppers combine labelled number inputs with 44 px decrement/increment buttons and disabled boundaries.
- Segmented choices use a labelled group of pressed-state buttons; binary controls use native checkboxes.
- Workspace and advanced disclosures preserve their user-selected open state through rack edits and asynchronous status updates.
- Selecting module Help closes the actions disclosure and restores focus to its summary, preventing the relocated panel from obscuring the second-row switches.
- Mobile and desktop keep semantic landmarks, heading order, live status/error regions, touch targets, reduced motion, and the existing contextual-help data model.
- Decorative emoticons are marked `aria-hidden="true"`; text-labelled controls keep their visible name while icon-only controls use explicit accessible names.
- Icon-only controls retain explicit accessible names, pressed state where applicable, and 44 px touch targets.

## Visual evidence

- Selected target: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/00-source-proposed.png`
- Final desktop: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/06-desktop-final.png`
- Final mobile: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/08-mobile-final.png`
- Final desktop comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/09-desktop-comparison-final.png`
- Final mobile comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/10-mobile-comparison-final.png`
- Emoticon pass, desktop: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-emoticon-review/03-desktop-after.png`
- Emoticon pass, mobile: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-emoticon-review/04-mobile-after.png`

## Automated acceptance

The full command is `npm run verify`. The current regression run covers strict Svelte/TypeScript diagnostics, 84 deterministic unit/property tests, the production PWA build, the initial-JavaScript budget, 43 Chrome flows, and the axe serious/critical gates. Browser flows include both bundled demos, Tap BPM placement/integer output, exact-beat Pause/Resume, collapsed Workspace sizing, full-width module/header layout, accessible rotary drag/keyboard/reset with separate Undo boundaries, visible icon assertions with accessible names, and the workspace, module action, advanced disclosure, Phase 6 mobile, Phase 7 sound, round-trip, and accessibility coverage.

Latest execution on 2026-08-25 after the Phase 6 and desktop follow-up refinements:

```text
svelte-check: 0 errors, 0 warnings
Vitest: 15 files / 84 tests passed
production PWA build: 13 entries / 351.53 KiB precached
initial JavaScript: 92.93 KiB gzip / 200.00 KiB budget
Playwright Chrome: 43 tests passed
axe: no serious or critical violations
```
