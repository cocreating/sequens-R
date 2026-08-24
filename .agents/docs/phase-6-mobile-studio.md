# Phase 6 · Mobile editing parity

Status: specified and ready for implementation on 2026-08-25. No Phase 6 implementation is claimed by this document.

## Outcome

Chrome on Android can add and edit all ten existing module types without requesting a desktop site. Mobile remains a vertical, one-hand-oriented surface; it does not reproduce the desktop parallel-lane layout.

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

- Playwright at 375 × 667 and 375 × 812 covers all ten module types.
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
