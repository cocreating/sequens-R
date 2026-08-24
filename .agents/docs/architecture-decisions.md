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
- New documents use `New Project` as their default name. Migration rewrites only the former exact default `Untitled Project`, preserving every user-authored project name.
- Versioned example documents may ship under `public/projects/` and enter the app only through the ordinary import/migration boundary. `basic-electro.sequens-r.json` is the first such schema-version-3 example.

## AD-004 · Phase 3 export contract

Status: accepted on 2026-08-24.

- MIDI and WAV exports offer 1, 2, 4, or 8 bars, with 4 bars selected by default.
- A rack MIDI export is SMF Type 1 with a conductor track plus one track per sound-generating module. Each module also has its own MIDI export action.
- A WAV mix is a stereo PCM16 file rendered through `OfflineAudioContext` and the same internal voice classes used for live monitoring.
- Separate PCM16 WAV stems are delivered together in one uncompressed ZIP file. The ZIP writer is project-owned and dependency-free.
- Export code remains local-only and adds no runtime network access or third-party dependency.

## AD-005 · Phase 4 desktop state and sharing

Status: accepted on 2026-08-24.

- The desktop studio surface activates through the same `64rem` (1024 CSS px) media query in JavaScript and CSS. Core modules keep their existing mobile surface; Phase 4 desktop modules historically rendered a concise playback-only plate below that threshold. AD-009's implemented Phase 6 mobile editors supersede that historical restriction.
- The patch schema is version 2. Version 1 links remain readable because the five original module indexes are unchanged. New shareable desktop generators append indexes; Piano roll is rejected at the codec boundary and must travel in a project file.
- The project schema is version 2 and migrates version 1 documents. Piano-roll notes live in their active `PatternSlot` as `handEdited` pattern data. Recorded CC motion lives on its module. Either kind of local authored data makes the module non-shareable until the automation is cleared where applicable.
- Rack, history, and persistence boundaries clone the JSON-safe project domain explicitly. This strips Svelte proxies while preserving manual patterns and automation before they cross undo/history, IndexedDB, or audio snapshot boundaries.
- Module IDs use UUID-backed values rather than a process-local counter, preventing restored or imported projects from colliding with modules created later in the same session.
- CC automation is normalized both when the loop length changes and when a project crosses the import boundary, keeping every point inside its active loop.
- Multiple racks share one transport engine and only the active rack is published. Switching racks while playing uses the scheduler's existing immutable snapshot boundary, so the change lands on the next safe bar.
- File System Access is a desktop progressive enhancement. Unsupported environments and mobile continue through Blob downloads. Audio output selection similarly feature-detects `AudioContext.setSinkId()` and otherwise retains the system output.

## AD-006 · Phase 5 progressive enhancement and scenes

Status: accepted on 2026-08-24.

- The project schema is version 3. Scenes store only stable module-ID-to-slot assignments and migrate version 1/2 documents with an empty scene list. Launching publishes one immutable rack snapshot, so every assignment reaches the audio scheduler at the same bar boundary.
- Phase 5 does not implement Stabs, Rain, Sampler, or Performer. The SDD makes demonstrated usage a prerequisite for those backlog modules; no usage evidence was available during this phase.
- The Acid voice keeps its existing public scheduling interface while moving oscillator, accent/slide envelopes, and a four-stage zero-delay-feedback TPT ladder into one AudioWorklet. Live playback and offline bounce load the same processor.
- Media Session, position state, Screen Wake Lock, View Transitions, Web Animations, `content-visibility`, `scheduler.postTask`, and `AudioContext.renderCapacity` are progressive enhancements selected only through feature detection. Their fallbacks are respectively in-app transport, no lock, immediate DOM updates, `requestAnimationFrame`, normal rendering, `setTimeout(0)`, and a fixed 16-module ceiling without render telemetry.
- Persistence serialization runs at background priority after its existing debounce. The audio thread still consumes only immutable snapshots and never reads Svelte state.
- Playheads animate `transform` through Web Animations and receive one audio-clock correction per bar. Reduced-motion users get instant view changes and a discrete step-eased playhead, preserving essential position feedback without continuous sweeping motion.
- The diagnostics panel reports audio state, combined base/output latency, scheduler jitter, active voices, render load/underruns when available, and isolation state. It contains no telemetry or runtime network path.
- The accessibility gate combines semantic native controls, tab-pattern keyboard behavior, keyboard piano-note authoring/editing, focus recovery after deletion, reduced motion, visible focus, and automated axe/Chrome coverage.

## AD-007 · Layered contextual help

Status: accepted on 2026-08-24.

- Contextual Help has two explicit layers: a top-right General Help toggle for application panels and primary controls, plus an independent detailed Help toggle inside each desktop module. Neither mode changes or disables instrument behavior.
- General Help uses a fixed top-right readout so guidance remains visible while the user moves through the page. Module Help uses a stable readout inside its plate. Both avoid moving pointer-positioned tooltips, keep dense controls unobscured, and make longer explanations readable.
- General Help delegates `pointermove` and `focusin` through semantic `data-app-help-key` markers. Actual pointer movement is used so layout scrolling cannot overwrite a keyboard-focused description. Module Help delegates its local pointer/focus interest through `data-help-key`; schema-driven parameters resolve through their generator definition.
- Both Help buttons expose pressed state and persistent `aria-controls` relationships. Readouts are deliberately not live regions: keyboard users can reach the same controls and visible copy without generating noisy announcements on every pointer movement. Escape closes General Help even when focus is inside an input.
- The desktop module header places its seven actions in a full-width grid below the module name, preventing Help from clipping existing monitor, solo, mute, duplicate, collapse, or delete actions in two- and three-lane layouts.

## AD-008 · Performance-first studio hierarchy and schema-driven controls

Status: accepted on 2026-08-24.

- At the time of this decision, the next product phase remained undefined until the existing studio hierarchy was consolidated. That consolidation is complete; AD-009 now defines Phase 6 as mobile editing parity.
- Transport, Random, Share, and module creation are the permanent performance path. Mobile keeps the global workspace closed by default so the first rack plate follows immediately; desktop opens the same workspace as a sticky utility rail beside three module lanes.
- Pause captures the scheduler's exact current beat, freezes every compositor playhead at that position, cancels internal and Web MIDI look-ahead, and sends MIDI Stop; Play reconstructs the audio-time origin from that beat and sends MIDI Continue. Stop remains a distinct reset-to-zero and panic action that hides the playheads.
- Tap BPM is an explicit post-SDD transport refinement. A native header button averages recent valid tap intervals and writes an integer from 20–300 BPM; the tempo field adds native minus/plus buttons for one-BPM changes and manual edits also write integers. Existing project/share decoders retain tenth-BPM compatibility so older saved patches remain readable.
- Project persistence, rack management, scenes, hardware, audio output, exports, shortcuts, and diagnostics remain fully available inside one `Workspace` disclosure. Its open state is explicit Svelte state so edits and status updates cannot collapse a user-open disclosure.
- On desktop, a closed Workspace contracts to one accessible 44 CSS px toolbox trigger so the studio lanes reclaim the remaining width without removing the native disclosure semantics.
- Module headers retain reorder, monitor, solo, mute, and collapse as immediate controls. Help, duplicate, module MIDI export, and delete move into one native per-module action disclosure.
- A desktop-only full-width toggle lets one module span every current lane for dense editing. It is local presentation state and does not alter the project document, generator output, or engine snapshot.
- Module plates present slots, mutation, pattern editing, and musical parameters before routing. MIDI output/channel, seed, copy, and automatic mutation scheduling live in `Output & advanced`; this is a presentation change only and does not alter project or patch schemas.
- `ParamDefinition.control` is the single source of UI control selection. Continuous performance parameters use rotary ranges, bounded integer parameters use steppers, short enumerations use segmented buttons, binary modes use switches, named modes use selects, and mixer levels become vertical faders on desktop. Every custom presentation retains a native input or button surface and the existing generator schema remains module-agnostic.
- Drum lanes expose instrument names while retaining horizontal scrolling and native pressed buttons. All controls keep the 44 CSS px target, visible focus, labels, reduced-motion behavior, and automated axe coverage.
- Recognizable frequent actions use a compact icon-only command language across transport, sharing, creation, persistence, capture, hardware, and export. Every icon is decorative and every control keeps an explicit accessible name and 44 CSS px target. Ambiguous, destructive, recording, mutation, launch, routing, and module-menu commands retain visible text so compactness does not obscure consequence or state.

## AD-009 · Phase 6 mobile editing parity

Status: implemented with automated acceptance on 2026-08-25; physical Android acceptance remains open.

- Arp, Euclid, Piano roll, CC Control, and Mod become addable and editable below 1024 CSS px. The existing module types, parameter schemas, generators, project documents, patch indexes, scheduler snapshots, and audio/MIDI paths remain shared with desktop.
- Responsive presentation replaces capability gating. Desktop retains parallel lanes, global shortcuts, `AudioContext.setSinkId()`, and File System Access enhancements; those are not requirements for mobile parity.
- Dense mobile editors use progressive disclosure. The rack remains vertical and collapsible, only one dense body is expanded at a time, and Piano roll opens in a dedicated full-screen editing surface with explicit close and focus restoration.
- Horizontal scrolling is local to musical grids and editors, never the document. All critical actions retain native semantics or an accessible equivalent, visible focus, reduced-motion behavior, and 44 CSS px touch targets.
- UI visibility never controls audio or MIDI lifetime. Collapsed, off-screen, or temporarily hidden modules remain in the immutable engine snapshot and continue playing.
- The phase is accepted only with real Android evidence at 375 CSS px, including all ten module types and the C10 16-module/140-BPM load scenario. Desktop behavior and deterministic outputs must remain unchanged.
- The user's explicit 2026-08-25 amendment authorizes Phase 6 implementation while the already documented physical Phase 3 and Phase 5 acceptance evidence remains pending. It does not waive or mark those earlier gates complete.
