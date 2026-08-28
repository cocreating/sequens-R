# Studio UI reorganization evidence

Status: implementation complete on 2026-08-24; follow-up refinements and current regression acceptance recorded through 2026-08-28.

This is the UI consolidation completed before Phase 6 was defined. It changes hierarchy and control presentation without changing generator output, project persistence, share encoding, or export formats. Its later transport refinement adds exact-beat Pause/Resume scheduling and MIDI Continue behavior. The resulting vertical mobile rack, disclosures, schema-driven controls, and performance-first hierarchy became the foundation used by the implemented Phase 6 mobile editors.

Phase 6 implementation and evidence are recorded separately in `phase-6-mobile-studio.md`; this file remains the record for the cross-phase consolidation and its subsequent desktop refinements.

## Delivered

- A sticky global header containing Tap BPM, Workspace, Mixer, the visibly labelled Add Module action, a stable Play/Pause toggle, Stop, Share, and General Help. Its action group wraps onto additional rows at constrained widths instead of overflowing. The former sticky performance deck now moves with the document.
- Tap BPM averages up to six valid taps, resets after intervals outside the supported 20–300 BPM range, and writes a whole-number tempo. Hovering or focusing the labelled BPM number reveals a 20–300 native vertical range control; keyboard and touch-focus access do not depend on hover. Tempo, Root, and Scale remain on one compact row, and manual entry also writes whole values.
- Pause preserves the current transport beat, freezes the header/grid/piano playheads on it, and clears scheduled internal/MIDI events; Play continues from that beat while Stop resets to zero and hides the playheads.
- Responsive branding that shows `Local generative MIDI`, a build-derived current-version badge, and `sequens-R` on desktop, then reduces to `s-R` without the subtext on mobile.
- Mobile critical path with the rack directly after the performance controls and Workspace removed from document flow.
- Desktop studio with three full-width parallel module lanes at 1440 CSS px.
- Workspace utilities live in a top-layer floating panel opened by an icon-only toolbox button immediately after TAP. The native popover supports light dismiss and Escape, restores focus to its trigger, and scrolls internally within the viewport.
- The rack mixer is an always-available full-width top-layer panel opened by the header button beside Workspace. It exposes the existing shared rack mix without requiring a Mixer module in the rack; saved Mixer modules remain compatible duplicate views. Channel gain uses keyboard-accessible native vertical faders with hardware-style caps and bottom-up fill; channels and the rack master pair them with live 12-segment green/amber/red dBFS LED ladders.
- The mobile `s-R` title is presented as a padded circular mark. Once the document has scrolled 240 CSS px, a fixed icon-only up-arrow appears near the safe-area bottom edge; it returns to the top smoothly unless reduced motion is requested.
- The floating mixer starts with PAN and SENDS hidden to prioritize channel levels. Two pressed-state toggles in its heading reveal or hide PAN and both send controls across every channel. Its responsive grid fits up to six channels per row: four, five, or six as desktop and mobile-landscape space permits, while narrow portrait layouts retain their compact two- or three-channel rows.
- Workspace grouping for project, racks, scenes, hardware MIDI, audio output, shortcuts, music export, and diagnostics.
- An icon-only `Demos projects` action directly after project import, retaining its explicit accessible name while opening a native popover that lists the validated `public/projects/index.json` catalog and activates a selected project through the standard import boundary.
- Compact module headers whose first row follows reorder → desktop full-width → collapse → actions → top-right editable name; monitor, solo, and mute occupy a balanced second row. The actions disclosure contains Help, duplicate, module MIDI export, and delete.
- Desktop-only per-module full-width toggles that span all current lanes without changing saved project or playback state.
- Desktop modules use responsive CSS columns as a masonry-like layout (two columns from 1024 px, three from 1440 px); full-width modules span every column while mobile remains a single vertical rack.
- Each module type receives a distinct dark default theme color. The module actions menu exposes a labelled palette selector, and the selected color is normalized, saved in project files, and restored through import/migration.
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
- Icon-only affordances for recognizable frequent actions: Play/Pause, Stop, Share, General Help, Random, Undo/Redo, Save, project export/import/demo discovery, rack creation/duplication, scene capture, hardware connect/refresh, music exports, and piano-note creation. The module creation action deliberately keeps its `Add Module` text label. Ambiguous or higher-consequence controls such as Delete, Mutate/Revert, scene launch, recording, advanced routing, and module-menu commands retain visible text.
- The final Phase 7 UI pass replaces platform-dependent emoticons and text glyphs with one local, dependency-free `Icon.svelte` renderer containing the selected 24 px outline Heroicon paths. SVGs inherit `currentColor`, remain decorative, and share consistent stroke, sizing, focus, pressed-state, disabled-state, and high-contrast behavior without loading an icon font or external asset.
- A restrained semantic palette makes the command language easier to scan and remember: green marks positive/play/create actions, amber pause and file operations, red stop/destructive results, blue navigation/share, violet creative/workspace actions, cyan audio/hardware, and yellow help. Active filled controls deliberately return their icon to inherited foreground color so state contrast remains stronger than category color.

## Accessibility and behavior

- Rotary controls retain `input[type=range]`, value text, arrow-key semantics, a visible focus ring on the rotary face, and native input/change events.
- Rotary pointer and touch gestures snap to the schema step, commit once at the gesture boundary, retain horizontal touch panning, and preserve the existing coalesced undo contract.
- Steppers combine labelled number inputs with 44 px decrement/increment buttons and disabled boundaries.
- Segmented choices use a labelled group of pressed-state buttons; binary controls use native checkboxes.
- The native Workspace popover remains stable through rack edits and asynchronous status updates, closes through its explicit button, light dismiss, or Escape, and restores focus to the toolbox invoker. Module advanced disclosures preserve their user-selected open state independently.
- Selecting module Help closes the actions disclosure and restores focus to its summary, preventing the relocated panel from obscuring the second-row switches.
- Mobile and desktop keep semantic landmarks, heading order, live status/error regions, touch targets, reduced motion, and the existing contextual-help data model.
- Decorative SVG icons are marked `aria-hidden="true"` and cannot receive focus; text-labelled controls keep their visible name while icon-only controls use explicit accessible names.
- The compact module-type select retains the `New module` accessible name even though its former visible caption was removed. Its visibly and programmatically named `Add Module` action now lives in the global header, so it remains available while the rack scrolls.
- Icon-only controls retain explicit accessible names, pressed state where applicable, and 44 px touch targets.
- Mixer PAN and SENDS visibility toggles expose dynamic Show/Hide accessible names and pressed state; hiding either group removes its controls from the keyboard and accessibility trees.

## Visual evidence

- Selected target: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/00-source-proposed.png`
- Final desktop: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/06-desktop-final.png`
- Final mobile: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/08-mobile-final.png`
- Final desktop comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/09-desktop-comparison-final.png`
- Final mobile comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/10-mobile-comparison-final.png`
- Historical emoticon baseline, desktop: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-emoticon-review/03-desktop-after.png`
- Historical emoticon baseline, mobile: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-emoticon-review/04-mobile-after.png`

## Automated acceptance

The full command is `npm run verify`. The current regression run covers strict Svelte/TypeScript diagnostics, deterministic unit/property tests, the production PWA build, the initial-JavaScript budget, Chrome flows, and the axe serious/critical gates. Browser coverage includes responsive masonry columns, full-width module spanning, dark per-module color selection and project round-trip persistence, alongside the existing Workspace, module action, Phase 6 mobile, Phase 7 sound, sharing, and accessibility flows.

Latest complete execution on 2026-08-28 after the Phase 7 acceptance harness and SVG icon migration:

```text
svelte-check: 0 errors, 0 warnings
Vitest: 117 tests passed across 17 files
production PWA build: 110.09 KiB gzip initial JavaScript / 200 KiB; 384.27 KiB across 10 offline-shell entries
Playwright Chrome: 55 checks passed
scheduler-message jitter: 0.107 ms σ
performance mix evidence: 5 modules −15.49 LUFS-I / −3.07 dBTP; 14 modules −13.81 LUFS-I / −1.06 dBTP
```
