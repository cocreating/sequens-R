# Architecture decisions

This file records project-level choices that refine the SDD. Product behavior and phase gates remain governed by the SDD unless a decision is explicitly amended here.

## AD-001 · Product baseline

Status: accepted on 2026-08-22.

- Product name: **sequens-R**.
- Scope: v1 as defined by the SDD.
- Development and verification are local until a hosting approach is selected.
- Product and engineering language: English.
- The intended seed corpus is 40 original grooves distributed across six styles. During development, use one representative groove per style so the behavior can be tested before expanding the corpus at the end.

## AD-002 · SvelteKit evaluation

Status: accepted on 2026-08-23.

Decision: continue with **Svelte 5 + Vite** and do not migrate the application to SvelteKit at this stage.

Rationale:

- sequens-R is a single-screen, browser-only, offline-first instrument with no server data flow.
- SvelteKit would not improve AudioWorklet execution, event scheduling, synthesis, MIDI timestamping, or polyphony.
- The current initial JavaScript bundle is 43.16 KiB gzip, comfortably below the SDD's 200 KiB limit.
- SvelteKit's routing, layouts, server endpoints, and prerendering do not currently offset the additional SSR guards, adapter configuration, and migration surface required by the browser-only audio engine.
- The existing Vite PWA integration already supplies the required offline application shell.

Reconsider this decision if the application gains multiple URL-based sections, authentication, cloud persistence, server endpoints, or a public content site that materially benefits from prerendering or server rendering. Any migration must be benchmarked against the SDD performance budgets before acceptance.

## AD-003 · Local project persistence

Status: accepted on 2026-08-24.

Decision: persist a versioned project document in native IndexedDB through a small project-specific boundary; do not add a storage library.

- The document already contains `racks`, `activeRackId`, scenes, and settings even though the Phase 2 surface exposes one rack. This prevents a schema replacement when multi-rack UI arrives.
- URL-fragment patches remain independent drafts. Fragment decoding has priority and skips IndexedDB entirely; the draft becomes local only through explicit Save.
- IndexedDB values and history entries receive plain `$state.snapshot(...)` objects. Svelte proxies never cross clone or storage boundaries.
- Project import runs through the same migration and validation path as IndexedDB restoration.
- `navigator.storage.persist()` is requested from the explicit Save gesture; ordinary edits still autosave without prompting.

## AD-004 · Phase 3 export contract

Status: accepted on 2026-08-24.

- MIDI and WAV exports offer 1, 2, 4, or 8 bars, with 4 bars selected by default.
- A rack MIDI export is SMF Type 1 with a conductor track plus one track per sound-generating module. Each module also has its own MIDI export action.
- A WAV mix is a stereo PCM16 file rendered through `OfflineAudioContext` and the same internal voice classes used for live monitoring.
- Separate PCM16 WAV stems are delivered together in one uncompressed ZIP file. The ZIP writer is project-owned and dependency-free.
- Export code remains local-only and adds no runtime network access or third-party dependency.

## AD-005 · Phase 4 desktop state and sharing

Status: accepted on 2026-08-24.

- The desktop studio surface activates through the same `64rem` (1024 CSS px) media query in JavaScript and CSS. Core modules keep their existing mobile surface; desktop-only modules render a concise playback-only plate below that threshold.
- The patch schema is version 2. Version 1 links remain readable because the five original module indexes are unchanged. New shareable desktop generators append indexes; Piano roll is rejected at the codec boundary and must travel in a project file.
- The project schema is version 2 and migrates version 1 documents. Piano-roll notes live in their active `PatternSlot` as `handEdited` pattern data. Recorded CC motion lives on its module. Either kind of local authored data makes the module non-shareable until the automation is cleared where applicable.
- Rack, history, and persistence boundaries clone the JSON-safe project domain explicitly. This strips Svelte proxies while preserving manual patterns and automation before they cross undo/history, IndexedDB, or audio snapshot boundaries.
- Module IDs use UUID-backed values rather than a process-local counter, preventing restored or imported projects from colliding with modules created later in the same session.
- CC automation is normalized both when the loop length changes and when a project crosses the import boundary, keeping every point inside its active loop.
- Multiple racks share one transport engine and only the active rack is published. Switching racks while playing uses the scheduler's existing immutable snapshot boundary, so the change lands on the next safe bar.
- File System Access is a desktop progressive enhancement. Unsupported environments and mobile continue through Blob downloads. Audio output selection similarly feature-detects `AudioContext.setSinkId()` and otherwise retains the system output.
