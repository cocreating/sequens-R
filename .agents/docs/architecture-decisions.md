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
- Versioned example documents may ship under `public/projects/` and enter the app only through the ordinary import/migration boundary. A validated `public/projects/index.json` catalog drives the Workspace demo picker. Each entry carries a required genre, and the current fifteen schema-version-7 demos are grouped as five Minimal Techno, five Minimal House Techno, and five Ambient Techno & Breakbeats projects at 86–130 BPM. Every demo contains Synth, uses one to three musical modules with eight slots each, and exposes Intro/Groove/Variation/Peak scenes. Demos persist rack mix state and use the permanent Mixer panel. The original Basic Electro document remains an unlisted migration fixture rather than a catalog entry. All catalog files are regenerated with `npm run demos:generate`.

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
- Media Session, position state, Screen Wake Lock, View Transitions, Web Animations, `content-visibility`, `scheduler.postTask`, and `AudioContext.renderCapacity` are progressive enhancements selected only through feature detection. Their original fallbacks were respectively in-app transport, no lock, immediate DOM updates, `requestAnimationFrame`, normal rendering, `setTimeout(0)`, and a fixed 16-module ceiling without render telemetry. AD-011 supersedes the last fallback with bounded platform-specific voice budgets.
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
- The module header keeps DOM and visual focus order aligned: reorder, desktop full-width, collapse, the flexible editable name, then the actions disclosure occupy the first row. Collapse uses the same disclosure language as the rest of the app—a right chevron when closed and a down chevron when open. Monitor, solo, and mute share the second row. Selecting Help closes its disclosure and restores focus to the summary before contextual pointer/focus tracking resumes.

## AD-008 · Performance-first studio hierarchy and schema-driven controls

Status: accepted on 2026-08-24.

- At the time of this decision, the next product phase remained undefined until the existing studio hierarchy was consolidated. That consolidation is complete; AD-009 now defines Phase 6 as mobile editing parity.
- Transport, Random, Share, and module creation are the permanent performance path. The module rack remains in the document flow at full width on every surface; Workspace utilities stay out of that critical path until explicitly opened.
- Pause captures the scheduler's exact current beat, freezes every compositor playhead at that position, cancels internal and Web MIDI look-ahead, and sends MIDI Stop; Play reconstructs the audio-time origin from that beat and sends MIDI Continue. Stop remains a distinct reset-to-zero and panic action that hides the playheads.
- Tap BPM is an explicit post-SDD transport refinement. A compact header button visibly labelled `TAB` averages recent valid tap intervals and writes an integer from 20–300 BPM; manual edits also write integers. The former increment/decrement pair and hover disclosure have been replaced by a native floating tempo panel containing a number input and vertical 20–300 range input, preserving keyboard, pointer, and touch access without spending permanent header width. Existing project/share decoders retain tenth-BPM compatibility so older saved patches remain readable.
- Version 0.1.0 removes the former responsive transport relocation and the `header-initial-core-actions`, `header-core-actions`, and `header-end-actions` wrappers. One `app-header-controls` flex group now owns `transport-fields` followed directly by every global action on all viewport sizes; natural wrapping preserves one DOM/focus order and consistent button alignment without duplicated controls. Tempo uses its own native top-layer panel. Key combines root and scale in a single top-layer panel whose direct option-button grids replace both selects and remain open between selections; its dynamic accessible name exposes the current root and scale together. Random and Add Module remain in the same global sequence, and Add Module opens a native top-layer catalog of icon, name, and description buttons instead of maintaining a separate selected module type. The measured header height positions fixed studio popovers without overlap. A scroll-position-aware up-arrow is rendered only after 240 CSS px and honors reduced-motion preferences when returning to the document start.
- Project persistence, rack management, scenes, hardware, audio output, exports, shortcuts, and diagnostics remain fully available inside one top-layer `Workspace` panel. An icon-only toolbox button immediately after the compact TAB/Tempo/Key transport invokes the native popover; its accessible name remains `Workspace`.
- The shared rack mixer is the sole mixer surface, opened from the header immediately beside Workspace in a full-width top-layer panel. Mixer is no longer a module type or a New module option, and projects containing the retired type are rejected at validation rather than rendered as duplicate views. Its vertical faders write module level state, while adjacent segmented LED ladders read diagnostic peaks. PAN and SENDS are globally hidden by default and revealed from two heading toggles. Channels auto-fit toward three columns on narrow portrait mobile and four, five, or six as landscape/desktop width permits. Additional mixers remain out of scope until buses or submix routing exists.
- The popover is closed by default on every surface, supports explicit close, light dismiss, and Escape with focus restoration, and constrains its independently scrollable utility stack to the viewport. Removing the former sticky rail lets desktop module lanes use the complete studio width without maintaining separate expanded/collapsed layout states.
- Module headers retain reorder, monitor, solo, mute, and collapse as immediate controls. The desktop full-width toggle and chevron collapse precede the flexible name; the native per-module action disclosure follows the name. Help, duplicate, module MIDI export, and delete remain inside that disclosure.
- A desktop-only full-width toggle lets one module span every current lane for dense editing. It is local presentation state and does not alter the project document, generator output, or engine snapshot.
- Desktop modules flow through responsive CSS columns for a masonry-like layout: two columns at the desktop breakpoint and three on wide screens. A full-width module uses column spanning so it remains an isolated row.
- Module backgrounds are type-specific dark palette defaults. A native selector in each module action menu allows a user override; project normalization validates the palette and preserves the choice across save/import while missing legacy values receive the type default.
- Module plates present slots, mutation, pattern editing, and musical parameters before routing. MIDI output/channel, seed, copy, and automatic mutation scheduling live in `Output & advanced`; this is a presentation change only and does not alter project or patch schemas.
- `ParamDefinition.control` is the single source of UI control selection. Continuous performance parameters use rotary ranges, bounded integer parameters use steppers, short enumerations use segmented buttons, binary modes use switches, named modes use selects, and mixer levels use vertical faders on every viewport. Every custom presentation retains a native input or button surface and the existing generator schema remains module-agnostic.
- Drum lanes expose instrument names while retaining horizontal scrolling and native pressed buttons. All controls keep the 44 CSS px target, visible focus, labels, reduced-motion behavior, and automated axe coverage.
- Recognizable frequent actions use a compact icon-only command language across transport, sharing, creation, persistence, capture, hardware, and export. One local dependency-free Svelte renderer owns the selected outline SVG paths; every icon is decorative and every control keeps an explicit accessible name and 44 CSS px target. Ambiguous, destructive, recording, mutation, launch, routing, and module-menu commands retain visible text so compactness does not obscure consequence or state.

## AD-009 · Phase 6 mobile editing parity

Status: implemented with automated acceptance on 2026-08-25; physical Android acceptance remains open.

- Arp, Euclid, Piano roll, CC Control, and Mod become addable and editable below 1024 CSS px. The existing module types, parameter schemas, generators, project documents, patch indexes, scheduler snapshots, and audio/MIDI paths remain shared with desktop.
- Responsive presentation replaces capability gating. Desktop retains parallel lanes, global shortcuts, `AudioContext.setSinkId()`, and File System Access enhancements; those are not requirements for mobile parity.
- Dense mobile editors use progressive disclosure. The rack remains vertical and collapsible, only one dense body is expanded at a time, and Piano roll opens in a dedicated full-screen editing surface with explicit close and focus restoration.
- Horizontal scrolling is local to musical grids and editors, never the document. All critical actions retain native semantics or an accessible equivalent, visible focus, reduced-motion behavior, and 44 CSS px touch targets.
- UI visibility never controls audio or MIDI lifetime. Collapsed, off-screen, or temporarily hidden modules remain in the immutable engine snapshot and continue playing.
- The phase is accepted only with real Android evidence at 375 CSS px, now including all eleven module types after Synth, Drone, and Mixer-module retirement, and the C10 16-module/140-BPM load scenario. Desktop behavior and deterministic outputs must remain unchanged.
- The user's explicit 2026-08-25 amendment authorizes Phase 6 implementation while the already documented physical Phase 3 and Phase 5 acceptance evidence remains pending. It does not waive or mark those earlier gates complete.

## AD-010 · Phase 7 sound identity and mix

Status: specified and accepted on 2026-08-25; Phase 7.0 accepted, Phase 7.1–7.2 implementation/automated evidence completed, Drum, Bass, Acid, Chords, and Arp listening approved, Phase 7.7 Piano plus Phase 7.8 Euclid implementation/objective evidence completed, Phase 7.9 CC Control plus Phase 7.10 Mod automatically accepted, and Phase 7.11 v2-only library implementation completed by 2026-08-26. Mixer/Piano/Euclid listening, scheduler jitter, and physical Android C10 remain open.

- Phase 7 improves the internal monitor without changing deterministic pattern generation, Web MIDI events, MIDI clock, or SMF output. Generator parameters and sound parameters become separate validated contracts.
- Project schema 5 is the released-library boundary: schemas 0–4 normalize missing or retired sound IDs to each module family's current v2 default. Patch schema 4 rejects schemas 1–3 because the temporary registry rows were removed and their compact indexes are no longer meaningful.
- `RackModule.level` remains top-level for compatibility. `SoundState` adds engine version, stable preset ID, quantized macros, pan, and shared delay/reverb sends. `RackMixState` owns the single delay, reverb, and master configuration even when multiple Mixer UI modules exist.
- One `VoiceFactory` accepts `BaseAudioContext` and is the only voice mapping used by live monitoring and offline bounce. Continuous sound updates use short AudioParam ramps; topology/preset changes prepare outside scheduler callbacks and enter at the next note attack with a bounded crossfade.
- AudioWorklet voices expose readiness and a post-scheduling message barrier to offline rendering. Readiness/synchronization failure rejects deterministically, bounce releases every voice and shared graph through `finally`, and transport panic preserves future time-ordered sound changes while cancelling active notes.
- Chords uses eight persistent dual-oscillator/filter/envelope slots and one shared chorus contribution. Allocation selects an available slot, otherwise the quietest and then oldest voice, while protecting new attacks so supported five-note voicings remain intact.
- Arp uses four persistent dual-source pluck slots with velocity/gate articulation and deterministic earliest-ending/oldest allocation. It feeds the existing rack delay send and creates no private delay graph.
- Piano uses eight persistent bounded-FM/partial slots, deterministic earliest-ending/oldest allocation, velocity-dependent level/brightness, finite decay, and one shared tremolo LFO. Hand-authored patterns and MIDI output remain independent from its sound state.
- Euclid uses three persistent tuned-percussion chains keyed from its existing ring lanes. Active same-ring retriggers use a bounded 2.5 ms envelope crossfade rather than an instantaneous reset. Per-ring pitch, decay, tone, and stereo spread affect internal monitoring only; the generator, MIDI note/channel offsets, and SMF output remain independent from sound state.
- CC Control retains its append-only `silent-cc-v2` project/share preset and has an explicit null factory identity. It owns no internal voice, strip, panorama, or sends; live and offline rendering exclude it before audio-node construction while its MIDI automation path remains unchanged.
- Mod retains its append-only `silent-mod-v2` project/share preset and has an explicit null factory identity. Its three tempo-synchronised external MIDI CC LFOs own no internal voice, strip, panorama, sends, or audio modulation target; live and offline rendering exclude it before audio-node construction.
- Bass, Acid, Chords, Arp, Piano, Drums, and Euclid receive specialized voices in independent gated subphases. Mixer edits one shared graph. CC Control and Mod remain silent and do not gain internal modulation targets.
- The procedural engine is the acceptance baseline. Optional sample/impulse assets must be local, provenance-documented, legally redistributable, and removable without breaking the phase DoD.
- Released presets target −18 LUFS-I ±1 LU and ≤ −1 dBTP on deterministic eight-bar family phrases, using ITU-R BS.1770-5 measurements. Loudness matching precedes mandatory human A/B approval.
- The final audible catalog contains 12 Acid presets, 40 non-Acid presets (Bass 8, Chords 10, Arp 8, Piano 8, Euclid 6), and six Drum kits, plus explicit silent CC/Mod records. The retired Mixer preset position remains a reserved compact-wire gap so unrelated links keep their stable indexes without retaining a runtime Mixer type.
- Native Web Audio remains the engine. Tone.js, a second transport, cloud assets, user sampling, per-module convolution, and internal CC/Mod destinations are outside Phase 7.
- Phase 7 cannot be accepted without the existing C10 Android scenario at 16 active modules/140 BPM, all bundle/offline gates, live/bounce parity, migration/share evidence, and explicit listening approval for every audible family.
- Amendment, 2026-08-25, executed on 2026-08-26: the final library pass removes the temporary DSP/presets and performs a one-time local project/PWA cache invalidation. A release marker prevents repeat deletion, and Workbox uses a new Phase-7-v2 namespace. This supersedes permanent compatibility playback but does not waive listening, export, bundle, scheduler, or Android checks.
- Future changes for all eleven modules and the permanent Mixer are centralized in `module-improvement-roadmap.md`. That roadmap may propose work but cannot silently override accepted generator, MIDI, persistence, audio, performance, or accessibility contracts.
- The final Phase 7 gates use an in-app acceptance harness that prepares the fixed 16-module/140-BPM rack, aggregates ten minutes of worst observed browser diagnostics, accepts explicit physical measurements/listening decisions, and copies a Markdown report. The harness is evidence collection only: it cannot self-approve listening, infer physical MIDI jitter/xruns/UI profiling, persist acceptance, or replace the reference Android run.

## AD-011 · Adaptive Android audio budget and idle-work reduction

Status: implemented with automated acceptance on 2026-08-27; physical Android C10 validation remains open.

- The master derives pre-limiter headroom from the squared levels of audible, monitored modules that contain events. Neutral character bypasses the waveshaper completely, while non-zero character uses a dry/wet input crossfade. A fixed −2 dB output trim keeps the generated 5- and 14-module browser bounces below −1 dBTP without making either mix quieter than −24 LUFS-I.
- Live coarse-pointer surfaces at or below 64rem use five Chords slots, three Arp slots, four Piano slots, and a 32-voice rack budget. Other live surfaces use the released 8/4/8 pools and a 64-voice rack budget. Offline bounce retains the full pools. Voice stealing remains deterministic inside each family; the diagnostics panel exposes the active/budget count and dropped internal-note total.
- Muted, unmonitored, non-solo, empty-pattern, and control modules own no live internal DSP. Their voice graph is recreated when they become audible. Delay and convolution are constructed only after a non-zero return is requested, and per-module analysers exist only while a Mixer or Workspace meter surface is open.
- Acid precomputes stable smoothing coefficients, iterates a fixed parameter-key list, and bypasses sample-by-sample DSP for fully silent quanta with no pending event. Drum source accounting is capped at sixteen active entries.
- The clock posts every four render quanta while transport runs and every thirty-two quanta while idle. Scheduler-message jitter is the standard deviation of consecutive main-thread delivery interval errors, avoiding long-window browser clock drift while preserving the latency-corrected `getOutputTimestamp()` bridge used for Web MIDI timestamps.
- Hidden diagnostics poll every 500 ms and open meters every 100 ms. Closed Mixer/Workspace popovers do not render their heavy content, ordinary module plates do not receive changing meter objects, and step-grid active lookup is set-based.
- The automated regression renders real one-bar WAVs from 5- and 14-module racks, asserts audible output and true peak ≤ −1 dBTP, and runs alongside the existing per-family loudness gates. This is regression evidence only; it does not satisfy the required 16-module/140-BPM `renderCapacity`, xrun, frame-time, latency, listening, or hardware-MIDI measurements on the reference Android phone.

## AD-012 · Piano Roll authored-data and helper contract

Status: implemented with automated acceptance on 2026-08-28.

- A Piano slot may retain events whose `startStep` lies beyond its current loop length. The editor reads the complete stored pattern, while live scheduling and SMF export receive only events inside `[0, lengthSteps)`. Shortening is therefore reversible, project serialization needs no new field or schema version, and expanding the slot restores the exact authored events.
- Velocity and accent remain event data. Accent is an editor convenience that applies a velocity floor of 112 and stores the existing optional `accent` flag; lowering velocity below that floor clears the flag. Internal Piano level/brightness and outgoing MIDI continue to consume the same bounded velocity.
- Scale-degree and octave transforms rewrite only active authored events and enter rack history as one pattern edit. Chord highlighting and stamping consume an explicitly selected Chords module by stable module ID; deleting it falls back visibly to the first available source and never creates a hidden persisted dependency.
- Routed audition uses the existing `AudioEngine`, voice factory, module strip, MIDI manager, mute/solo/monitor truth table, and voice budgets. It creates no second preview voice or transport. Direct pitch-key audition is explicit; automatic audition during edits is opt-in editor state.
- The built-in melody library contains 20 original scale-degree phrases ordered from simple to advanced. Loading produces ordinary Piano events in the current project key, atomically replaces the active phrase, and synchronizes the slot's normal Length parameter to 16, 32, or 64 steps. The selection itself is not persisted and the loaded result remains project-only like every Piano pattern.
- Fit/50/75/100/150/200% zoom and harmony-source selection are presentation state. They do not enter projects, patches, engine snapshots, MIDI, or SMF output.

## AD-013 · Synth generative-lead module and additive schema boundary

Status: implemented with automated acceptance on 2026-08-31; human preset listening and physical Android C10 remain open.

- Synth owns the missing seed-driven lead role. It does not replace Bass, Acid, Arp, Chords, or the manually authored Piano roll.
- Its pure generator consumes only seed, quantized numeric parameters, and project key. Six phrase contours produce bounded monophonic events with a stable final tonic cadence; sound state cannot alter pattern, MIDI, or SMF output.
- One persistent monophonic Web Audio graph owns three selectable main oscillators, a blended/detuned secondary oscillator, one resonant low-pass filter, velocity-sensitive filter and amplitude envelopes, bounded saturation, and DC blocking. Continuous edits ramp existing nodes and scheduler callbacks allocate no reusable nodes.
- The same explicit `procedural-synth-v1` factory identity is used for live monitoring, mix bounce, and stems. Eight append-only procedural presets remain subject to listening acceptance.
- Project schema 6 accepts schemas 0–5. Patch schema 5 appends Synth after Mod and appends Synth presets after the Phase 7 catalog, preserving every earlier compact index. Patch schema 4 remains readable because this change is strictly additive; patch schemas 1–3 remain rejected.
- Compact links retain the existing safety boundary and omit hardware MIDI port/channel routes. Projects preserve full routing.
- The native schema-driven module plate provides keyboard/touch controls and contextual help on desktop and mobile. No custom editor, dependency, runtime network request, second transport, or CSS framework is introduced.

## AD-014 · Plan A mobile information hierarchy

Status: implemented with automated and visual-browser acceptance on 2026-08-31; the existing physical Android gate remains open.

- The shared header keeps one DOM/focus order but groups actions by intent. Playback leads, transport follows, and utilities come last. On narrow surfaces, scrolling beyond 160 CSS px applies a presentation-only compact state that retains Play/Stop, Tempo/Key, Workspace, Add, and Share.
- Mobile density is reduced through progressive disclosure rather than feature removal. Piano Melody and Transform tools use native `details`; desktop reuses the same snippets in its expanded toolbar.
- Below 30rem the module library is a safe-area-aware `100vw × 100dvh` dialog with a sticky internal header. Workspace project actions expose visible labels on mobile.
- Step grids retain deterministic data and local scrolling while increasing mobile cell width to 32 CSS px and exposing a Swipe cue. None of these choices change rack state, project or patch schemas, engine snapshots, MIDI, audio, or SMF output.

## AD-015 · Plan B mobile app shell

Status: implemented with automated and visual-browser acceptance on 2026-09-01; the existing physical Android gate remains open.

- Below the desktop breakpoint, the app uses a compact project/Tempo/Key context bar and a fixed safe-area-aware dock for Play/Pause, Stop, Add Module, and Mixer. Session utilities move into Workspace so the primary rack remains focused.
- Module plates retain one shared implementation and add a mobile summary row for activity, type, slot, monitor, solo, mute, and collapse/expand. Collapse remains part of the existing rack state, preserving drag-and-drop geometry and project restoration.
- Workspace, Mixer, and the module library become full-viewport mobile surfaces. Workspace provides sticky section navigation without creating a second routing or state model.
- Mobile steps are 40 CSS px wide and scroll locally. Portrait/landscape transitions must not introduce document-level horizontal overflow.
- Full-screen editing is intentionally not generalized. Piano retains its established dialog; all non-Piano editors remain inline per the user's 2026-09-01 amendment.

## AD-016 · Continuous Drone module and additive schema boundary

Status: implemented with automated acceptance on 2026-09-02; human preset listening and physical Android C10 remain open.

- Drone owns the continuous ambient-field role. Chords continues to own articulated harmonic progressions; Drone guarantees complete lane coverage and an uninterrupted tonic anchor across every loop.
- Its pure generator consumes only seed, quantized numeric parameters, and project key. Ordinary sustained `NoteEvent` records remain the single truth for internal monitoring, Web MIDI, SMF, project patterns, and compact sharing.
- Lane identity is stored in the existing optional event lane field. Adjacent events on one lane meet exactly at bar or loop boundaries; the internal voice cancels the outgoing release and glides persistent oscillators, while external MIDI retains explicit note gates.
- One bounded four-lane native Web Audio graph owns triangle fundamentals, sine partials, four filters/envelopes/panners, shared filter and panorama LFOs, one deterministic band-limited air source, and DC blocking. It uses the existing rack delay/reverb sends and creates no private reverb, sample asset, dependency, worklet, or transport.
- The specialized sustained-field UI visualizes long lane segments instead of rendering a large disabled sixteenth-note button grid. It remains semantically grouped, screen-reader summarized, and shared across mobile and desktop.
- Project schema 7 accepts schemas 0–6. Patch schema 6 appends Drone after Synth and appends all Drone presets after the existing catalog, preserving every earlier module and preset index. Patch schemas 4 and 5 remain readable; schemas 1–3 remain rejected.
- The same `procedural-drone-v1` factory identity is used for live monitoring, mix bounce, and stems. Eight presets are objectively gated at −18 LUFS-I ±1 LU, ≤ −1 dBTP, and DC ≤ −60 dBFS; these measurements do not replace human listening approval.

## AD-017 · Studio visual refresh

Status: implemented on 2026-09-04 with automated acceptance. All ten steps of the handoff's implementation order are in place and the full suite is green: 61 Playwright specs, 137 unit tests, `svelte-check` clean, production build within the 200 KiB budget. Human visual acceptance of the mixer, piano roll, workspace panels, and mobile dock remains open — the suite asserts structure, selectors, contrast, and touch targets, not whether the surface reads correctly.

- The refresh is a surface-language change only. The information architecture does not move: every panel, control, and affordance keeps its place and its behaviour, and the stores, generators, audio graph, scheduler, MIDI, export, and project serialization are out of scope. A visual change that appears to require a logic change is escalated rather than implemented.
- `.agents/docs/studio-refresh-handoff/` is the specification. `Studio Refresh.dc.html` is authoritative over the PNG captures, because the palette is authored in `oklch` and the captures are flattened to sRGB. The bundle's inline styles are references, not source: every value is translated into `tokens.css` custom properties, `base.css` shared classes, or a component-scoped `<style>` block.
- Five moves define it: module containers become milled plates rather than nested boxes; module identity moves from a whole-plate background tint to a 4px hue spine plus a type chip; `--signal` is reserved for playing/armed/selected/active and is never decoration and never a border; grids, meters, and segmented tracks sit in recessed wells; labels are condensed silkscreen and every number is tabular mono.
- Markup restructuring is permitted where the DOM exists only to carry a border or a tint. Every `data-testid`, `aria-label`, and accessible name is preserved, because `tests/e2e` queries by them. Style assertions that contradict the new language are amended in place with the reason recorded, not deleted.
- Landed one step per commit against a green suite. Token and font changes were landed alone and verified before any component was rewritten, so a refresh could be distinguished from a regression.
- **Three style assertions contradicted the new language and were amended rather than deleted**, each keeping its original intent: `phase2` asserted the signal colour on `border-top-color` and now asserts it on `background-color`; `phase4` asserted a distinct dark background per module and now asserts a distinct spine via `::before`, keeping the darkness ceiling against the plate itself; `tests/unit/module-color.test.ts` parsed the former hex tints for a per-channel darkness ceiling and now validates eleven distinct in-gamut oklch hues. The third lost real coverage — the darkness ceiling no longer applies to a spine hue — and is the weakest of the three.
- **Module plates do not clip.** `article` uses `overflow: visible` so the per-module actions menu, which is absolutely positioned inside the plate, is not cut off when the module is collapsed and the plate is only one row tall. The spine and progress bar carry their own radii in place of the former clip, and a plate with an open menu is raised to `z-index: 8` because each plate is its own stacking context via `view-transition-name`. Auto-expanding a collapsed module to fit its menu was rejected: `collapsed` is rack state that is persisted in the project document, so opening a menu would silently edit the saved file.
- **Module identity colour.** `module-color.ts` offers eleven user-selectable plate tints while the handoff derives one hue per module *type*. Resolved on 2026-09-04 by keeping the eleven ids and labels and replacing only their `value` strings with the handoff hues, which are then rendered as the plate spine instead of the plate background. Only the id is persisted and validated, so `normalizeModuleColor`, the project schema, and every saved document are untouched, and the user's colour choice survives the refresh. The existing per-type defaults already align with the handoff hues by name — ember/Drums is orange, forest/Bass green, plum/Chords magenta, steel/CC grey — so the palette stays self-describing.

## AD-018 · Studio visual refresh: token contrast floor

Status: accepted on 2026-09-04, during the AD-017 implementation.

- Where a handoff recipe would drop text below WCAG AA, the accessibility gate wins and the deviation is recorded here.
- **Contrast floor.** Any text rendered below 14 CSS px uses `--text-muted` (58%) or lighter. `--text-dim` (52%) is reserved for text at 14px and above. Measured: `--text-dim` on `--n-825` is 3.72:1 and on `--n-680` is 3.29:1, both under the 4.5:1 that small text requires; `--text-muted` on `--n-825` is 4.78:1. This overrides the handoff's use of `--text-dim` for the status strip meta, the disclosure-row state summary, and secondary button labels.
- **Legacy module tints.** `--color-text-muted` and `--color-structure` are held at `--text-1` (72%) while module plates still carry the `--module-background` hex tints from `module-color.ts`. On those tints `--text-2` measures 3.70:1 and failed the `phase5` axe check in practice, not in theory. Both aliases are removed, and small labels move to `--text-2`, when ModulePlate replaces the tint with a hue spine.
- **Icon tones.** `Icon.svelte` keeps emitting `data-tone`, which `phase5` asserts, but the per-tone colours are dropped: icons inherit `currentColor`, and only `danger` retains a hue. The refresh has one accent.
- The `phase5` axe check is the gate for all of the above and is not to be relaxed to accommodate a recipe.
