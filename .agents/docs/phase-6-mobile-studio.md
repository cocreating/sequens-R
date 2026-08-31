# Phase 6 · Mobile editing parity

Status: implementation and automated acceptance complete on 2026-08-25. Physical Android acceptance remains open, so the Phase 6 gate is not yet marked complete.

## Outcome

Chrome on Android can add and edit all ten module types without requesting a desktop site. The permanent Mixer remains available from the header. Mobile remains a vertical, one-hand-oriented surface; it does not reproduce the desktop parallel-lane layout.

## Scope

- Remove viewport-based creation and editing restrictions from Arp, Euclid, Piano roll, CC Control, and Mod.
- Reuse the existing module types, `paramSchema` definitions, deterministic generators, slots, mutation history, project schema, patch indexes, engine snapshots, MIDI routing, and exports.
- Adapt Arp and Euclid through the existing schema-generated controls and locally scrolling musical grids.
- Adapt CC Control and Mod through compact progressive disclosure without removing recording, routing, LFO, mute, solo, or monitor behavior.
- Give Piano roll a dedicated full-screen mobile editor with touch and keyboard entry, selection, movement, resizing, deletion, mode/length controls, an explicit close action, and focus restoration.
- Keep at most one dense mobile module body expanded at a time. Collapsing, hiding, or scrolling a module off-screen must not alter its audio or MIDI state.
- Keep desktop lanes, shortcuts, selectable audio output, and File System Access behavior unchanged.

## Explicit non-goals

- No second mobile engine, generator implementation, project format, or share codec.
- No copy of the desktop multi-column studio squeezed into a narrow viewport.
- No new module type, sound engine, cloud service, dependency, or real-time touch instrument.
- No attempt to emulate desktop-only browser capabilities when Android does not expose them.

## Implementation order

1. Replace capability gating with responsive presentation and add mobile coverage for creation, duplication, deletion, reorder, persistence, and playback.
2. Enable Arp and Euclid editors.
3. Enable CC Control and Mod editors.
4. Implement the dedicated Piano roll editor.
5. Optimize off-screen module rendering without coupling UI lifetime to engine lifetime.
6. Complete automated mobile, accessibility, regression, and physical Android performance evidence.

## Automated acceptance

- Playwright at 375 × 667 and 375 × 812 covers all ten module types after the additive Synth follow-up and Mixer-module retirement.
- A desktop-authored Arp/Euclid/Mod link opens, edits, re-shares, and regenerates identically on mobile.
- Desktop-authored Piano and recorded-CC projects import, edit, persist, export, and re-import identically on mobile.
- Editing, collapsing, reordering, duplicating, and deleting while playing produces no application errors or stuck UI state; audio discontinuity remains a physical listening check.
- The document has no horizontal overflow; grid/editor overflow stays local.
- Keyboard focus returns predictably after closing a dedicated editor or deleting a module.
- Existing desktop flows, golden hashes, schema migrations, link-size gates, bundle budgets, strict TypeScript, and axe serious/critical gates remain green.

## Physical Android Definition of Done

On the reference mid-range Android device with stable Chrome:

1. Add and edit every module type at 375 CSS px without enabling desktop mode.
2. Complete the shareable desktop → mobile → desktop round trip with identical generated output.
3. Complete the Piano/CC project export → mobile import/edit/export → desktop import round trip with identical persisted state.
4. While transport runs, add, edit, collapse, reorder, duplicate, and delete each module family without clicks, interruptions, or stuck MIDI notes.
5. With 16 active modules at 140 BPM, record 0 xruns, `renderCapacity` average ≤ 0.5 and peak ≤ 0.8 when supported, UI frames ≤ 8 ms during rack scrolling/editing, and the remaining C10 measurements.
6. Confirm touch targets, focus visibility, reduced-motion behavior, screen-reader names, and absence of document-level horizontal overflow.

Phase 6 is complete only when both automated and physical Android evidence are appended here. Pending physical evidence from Phases 3 and 5 remains independently open and is not waived by starting this phase.

The next product phase is Phase 7, specified in `phase-7-sound-quality.md`. Its implementation does not form part of Phase 6. The user's explicit “empezamos phase 7” instruction on 2026-08-25 authorizes Phase 7 to begin while this physical gate remains open; it does not approve, waive, or close any Phase 6 evidence.

## Implemented surface

- All ten module types, including Synth, are available from the same mobile creation control used by desktop; Mixer remains a permanent header panel rather than a creatable module.
- Arp and Euclid reuse the schema-driven controls and locally scrolling pattern grids below 1024 CSS px.
- CC Control groups its four controllers into native disclosures while keeping loop length, recording, clearing, routing, mute, solo, and monitor controls available. Mod groups its three LFOs the same way.
- Only one Arp, Euclid, Piano roll, CC Control, or Mod body remains expanded on mobile. Creation, expansion, duplication, shared-link restoration, local restoration, and project import all enforce this presentation rule without changing engine snapshot membership.
- Mobile module menus provide explicit Move earlier and Move later commands in addition to the existing touch drag handle. Reorder, duplicate, and delete remain available while transport runs.
- Piano roll opens through a native full-screen `dialog`. It includes explicit Close, 16/32/64-step length, chromatic/in-key mode, touch/grid and keyboard note entry, selected-note movement, resizing, deletion, local two-axis grid scrolling, Escape dismissal, and focus restoration to its opener. The shared post-phase editor also exposes velocity/accent editing, Fit/50/75/100/150/200% zoom, pitch-key audition, scale-degree/octave transforms, chord guidance/stamping, preserved overflow notes, and the 20-example key-aware melody library on mobile without forking its state or engine path.
- Module plates use `content-visibility: auto` with an intrinsic-size placeholder. Collapsed and off-screen modules remain in rack state and immutable audio/MIDI snapshots.

## Plan A mobile optimization follow-up · 2026-08-31

- The sticky header prioritizes Play/Pause and Stop before transport and utility groups. After 160 CSS px of scroll it becomes one compact row containing the essential session actions.
- The module library becomes a safe-area-aware full-screen dialog below 30rem, with a sticky heading and Close action.
- Workspace project commands gain visible mobile labels instead of relying on icon recognition.
- Piano Melody and Transform tools use native closed disclosures on mobile while the shared desktop controls remain expanded.
- Step-grid cells are at least 32 CSS px wide and advertise local horizontal movement with a Swipe hint.
- Playwright covers both reference mobile heights, compact-header visibility, full-screen library sizing, labelled Workspace actions, Piano disclosures, the Swipe cue, and minimum cell width. Screenshots and audit notes live in `mobile-optimization-audit/`.

## Plan B mobile optimization follow-up · 2026-09-01

- Mobile replaces the multi-action top header with a compact project/Tempo/Key context bar and moves Play/Pause, Stop, Add Module, and Mixer into a fixed safe-area-aware bottom dock.
- Module headers add a compact activity/type/slot summary alongside monitor, solo, mute, and collapse/expand controls. Collapsed state continues through the existing rack model so drag placeholder geometry and persisted projects remain consistent.
- Mobile step cells increase to 40 CSS px and continue to scroll inside their local grid instead of widening the document.
- Workspace, Mixer, and the module library occupy the mobile viewport. Workspace adds sticky section links for Project, Scenes, Hardware, and Export, and owns Randomize, Share, and Help on mobile.
- Piano remains the only full-screen module editor. The proposed extension of full-screen editing to other modules is deliberately not implemented; their Phase 6 inline editors remain unchanged.
- Playwright covers dock access, the focused surfaces, focus restoration, non-Piano inline editing, portrait/landscape transitions, local grid sizing, and horizontal-overflow protection.

## Automated evidence · 2026-08-25

`npm run verify` passes in local Chrome:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 59 passed across 13 files, including existing deterministic golden/schema coverage and production-boundary validation of the bundled example project;
- production PWA build: passed;
- initial JavaScript: 78.68 KiB gzip / 200 KiB budget;
- Playwright: 36 passed, including Phase 6 coverage at 375 × 667 and 375 × 812;
- axe: no serious or critical violations with the mobile Piano dialog open, while the existing desktop accessibility gate remains green;
- all ten module types can be added and played at both mobile sizes without page errors or document-level horizontal overflow;
- Arp, Euclid, CC Control, and Mod mobile editor flows pass, including one-dense-body coordination;
- Piano touch/keyboard authoring, selection, movement, resizing, local overflow, close, and focus restoration pass;
- mobile reorder, duplicate, delete, save, reload, and edit-during-playback flows pass;
- a desktop-authored Arp/Euclid/Mod link edits on mobile, reopens on desktop with the expected parameters, and re-serializes to the identical fragment;
- desktop-authored Piano and recorded-CC data export to mobile, edit and export there, and re-import on desktop with identical authored note and automation counts;
- existing desktop lanes, shortcuts, audio-output/File System Access enhancements, exports, persistence, deterministic output, and Phase 1–5 browser flows remain green.

Post-acceptance regression on 2026-08-28 covers the complete Piano Pro workflow in Chrome and reruns the mobile Piano dialog authoring, focus-restoration, local-overflow, and axe serious/critical gates. The current full suite passes 56 Playwright tests. Physical Android requirements above remain open and are not replaced by this browser evidence.

## Remaining physical evidence

The six Physical Android Definition of Done checks above are still required on the reference mid-range Android device. In particular, browser automation does not claim the listening checks, stuck-note hardware checks, 16-module/140-BPM `renderCapacity` and UI-frame measurements, TalkBack pass, or device-specific touch ergonomics. Phase 3 and Phase 5 physical evidence also remains independently pending.
