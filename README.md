# sequens-R

sequens-R is a local-first, generative MIDI sequencer for Chromium-based browsers. It is being built from the project SDD in discrete, verified phases.

## Project status

Phases 1, 2, and 4 are complete and pass their automated Definitions of Done. Phase 3 implementation and automated acceptance are also complete: Web MIDI is opt-in, routing is per module, notes and 24 PPQ clock use absolute timestamps, and the app exports SMF Type 1, offline WAV mixes, and zipped WAV stems. Physical 10-minute clock/jitter measurement and three-DAW import checks remain before the Phase 3 gate can be marked accepted.

At 1024 CSS px and wider, Phase 4 adds the parallel-lane desktop studio, Arp, Euclid, Piano roll, CC Control, Mod, multiple racks, keyboard shortcuts, selectable audio output, and File System Access saves. Every desktop module panel also has an opt-in contextual Help mode: hovering a control or reaching it with the keyboard updates a stable in-panel explanation while leaving the instrument usable. Phase 6 supersedes the original mobile playback-only plates with adaptive editors. Manual Piano roll data and recorded CC motion still use project export instead of compact link sharing.

The Piano roll now includes a persistent velocity lane, accents, non-destructive loop shortening, scale-degree and octave transforms, selectable Chords context with chord stamping, routed note audition, a labelled pitch keyboard, and Fit/50/75/100/150/200% zoom. Its `Load melody` selector provides 20 original key-aware phrases ordered from simple to advanced; loading a phrase is one undoable edit and synchronizes the active slot to its native 16-, 32-, or 64-step length. See the [Piano Roll Pro implementation and evidence](.agents/docs/piano-roll-pro.md).

Phase 5 implementation and automated acceptance are complete. It adds quantized scenes, Media Session and Wake Lock integration, background recovery, compositor playheads, progressive View Transitions and background task scheduling, the Acid TPT ladder worklet, live audio diagnostics, a top-right General Help mode for contextual panel and control guidance, and the full accessibility pass. Playheads remain visible as discrete step indicators when Android Chrome reports reduced motion, while the default presentation stays smooth. The four optional backlog modules remain deliberately deferred because the SDD requires demonstrated usage first. Physical mid-range Android measurements for all seven C10 budgets remain before the Phase 5 gate can be marked fully accepted.

The studio UI has been consolidated around the performance path. The global header now keeps Tap BPM followed by an icon-only Workspace toolbox, Play/Pause, Stop, Share, and General Help; repeated taps set a smoothed whole-number BPM, while minus/plus controls to the left of the tempo field make one-BPM changes. Pause preserves the exact transport beat and freezes every playhead, Play continues from it, and Stop resets to zero. Tempo, key, icon-only Random, and module creation form the compact command deck below. On mobile, transport and rack actions remain a single contained-scroll row; the module picker retains its `New module` accessible name and the adjacent `Add Module` action stays visibly labelled. Mobile reaches the rack immediately and shortens the brand to `s-R`, while desktop keeps the full title, `Local generative MIDI` subtext, and a build-derived current-version badge. Project, rack, scene, hardware, export, and diagnostics tools open in a responsive top-layer Workspace panel, leaving the module rack at full width on every surface; the panel supports its close button, light dismiss, Escape with focus restoration, and viewport-contained scrolling. Any desktop module can temporarily span the full lane row. New projects use the clear `New Project` default; saved documents using the former `Untitled Project` default migrate automatically. Module plates expose pattern and musical parameters first, move routing and deterministic scheduling into an `Output & advanced` disclosure, and use schema-selected knobs, steppers, segmented controls, switches, selects, and mixer faders instead of a single slider language. Recognizable frequent actions use a shared dependency-free outline-SVG icon component with explicit accessible names; ambiguous, destructive, recording, mutation, launch, routing, and module-menu commands retain visible text. See the [UI reorganization evidence](.agents/docs/ui-reorganization.md) and [design QA report](design-qa.md).

Phase 6 implementation and automated acceptance are complete. Arp, Euclid, Piano roll, CC Control, and Mod are addable and editable on mobile through adaptive editors rather than a compressed desktop layout. The rack stays vertical and progressively disclosed, with at most one dense editor body expanded; CC and Mod use grouped disclosures, and Piano roll uses a dedicated full-screen editor with touch and keyboard note operations plus focus restoration. The audio engine, deterministic generators, scheduler, MIDI timing, project schema, and share formats remain common across both surfaces. Automated Chrome coverage passes for all ten module types at 375 × 667 and 375 × 812, including cross-device link/project round trips and axe. The Phase 6 gate remains open until the physical Android performance pass with 16 active modules at 140 BPM and the remaining device checks are recorded. See the [Phase 6 specification and evidence](.agents/docs/phase-6-mobile-studio.md).

**Phase 7 implementation complete; acceptance open.** The released catalog now contains only the specialized v2 Drum, Bass, Acid, Chords, Arp, Piano, and Euclid voices plus explicit silent Mixer/CC/Mod records. Temporary compatibility DSP/presets and the Upgrade sound UI are gone. Project schema 5 migrates older documents directly to current family defaults, patch schema 4 establishes a clean compact-link boundary, and the first start clears the former local project/PWA caches once before using the new library. Automated sound, persistence, export, accessibility, desktop/mobile, PWA-build, and compact-link regressions pass. Workspace → Diagnostics includes a Phase 7 acceptance harness that prepares the fixed 16-module/140-BPM rack, records ten minutes of worst observed diagnostics, collects the physical measurements and listening decisions that browser automation cannot infer, and copies a Markdown evidence report. Phase 7 remains unaccepted until Mixer/Piano/Euclid and the final mixed starter are approved by listening and the reference Android C10 report passes. See the [complete Phase 7 specification and evidence](.agents/docs/phase-7-sound-quality.md).

The application deliberately uses Svelte 5 with Vite rather than SvelteKit. sequens-R is currently a single-screen, client-only, offline-first instrument, so SvelteKit's routing and server-rendering facilities would add browser/SSR boundaries without improving AudioWorklet scheduling or synthesis performance. This decision should be revisited if the product gains multiple routes, server endpoints, authentication, cloud storage, or a separately prerendered public site.

## Local development

Requirements: Node.js 20.19 or newer and Google Chrome.

```bash
npm install
npm run dev
```

The Vite server sends COOP/COEP headers. Open the printed localhost URL rather than opening `index.html` directly.

## Bundled demo projects

The Workspace demo picker ships fifteen minimal schema-version-5 projects built around the upgraded Piano roll. The list is classified into three contemporary genres with five projects each: Neoclassical Ambient, Post-Classical Minimalism, and Melodic Electronica. Tempos range from 56 to 126 BPM, every project contains an expressive Piano theme with varied velocity and accents, and the arrangements range from one to three modules. Their four scenes are Prelude, Theme, Variation, and Finale.

The demos store their channel levels, pan, sends, delay/reverb returns, and master character in the rack's normal mix state. They do not add Mixer modules; use the permanent Mixer button beside Workspace to edit the shared rack mix. The original musical material uses key-aware scale-degree phrases inspired by classical forms and techniques rather than copied master melodies. The former Basic Electro files remain unlisted compatibility fixtures and are not part of the fifteen-project shipping catalog.

The catalog and its JSON files live under [`public/projects/`](public/projects/). Regenerate all fifteen projects deterministically with `npm run demos:generate`. See the [demo-project library reference](.agents/docs/demo-projects.md) for the complete matrix and verification contract.

## Verification

```bash
npm run verify
```

This runs strict Svelte/TypeScript checks, deterministic unit and property tests, a production PWA build, the 200 KiB initial-JavaScript gate, and the Chrome browser flows.

See [Phase 1 evidence](.agents/docs/phase-1-sound.md), [Phase 2 evidence](.agents/docs/phase-2-persistence.md), [Phase 3 evidence](.agents/docs/phase-3-midi-outputs.md), [Phase 4 evidence](.agents/docs/phase-4-desktop.md), [Phase 5 evidence](.agents/docs/phase-5-polish.md), the [Phase 6 specification](.agents/docs/phase-6-mobile-studio.md), the [Phase 7 sound specification](.agents/docs/phase-7-sound-quality.md), [Piano Roll Pro evidence](.agents/docs/piano-roll-pro.md), the [demo-project library](.agents/docs/demo-projects.md), the [complete module improvement roadmap](.agents/docs/module-improvement-roadmap.md), [UI reorganization evidence](.agents/docs/ui-reorganization.md), and [architecture decisions](.agents/docs/architecture-decisions.md) for the current acceptance status, future module work, and technical rationale.
