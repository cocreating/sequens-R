# sequens-R

sequens-R is a local-first, generative MIDI sequencer for Chromium-based browsers. It is being built from the project SDD in discrete, verified phases.

## Project status

Phases 1, 2, and 4 are complete and pass their automated Definitions of Done. Phase 3 implementation and automated acceptance are also complete: Web MIDI is opt-in, routing is per module, notes and 24 PPQ clock use absolute timestamps, and the app exports SMF Type 1, offline WAV mixes, and zipped WAV stems. Physical 10-minute clock/jitter measurement and three-DAW import checks remain before the Phase 3 gate can be marked accepted.

At 1024 CSS px and wider, Phase 4 adds the parallel-lane desktop studio, Arp, Euclid, Piano roll, CC Control, Mod, multiple racks, keyboard shortcuts, selectable audio output, and File System Access saves. Every desktop module panel also has an opt-in contextual Help mode: hovering a control or reaching it with the keyboard updates a stable in-panel explanation while leaving the instrument usable. Phase 6 supersedes the original mobile playback-only plates with adaptive editors. Manual Piano roll data and recorded CC motion still use project export instead of compact link sharing.

Phase 5 implementation and automated acceptance are complete. It adds quantized scenes, Media Session and Wake Lock integration, background recovery, compositor playheads, progressive View Transitions and background task scheduling, the Acid TPT ladder worklet, live audio diagnostics, a top-right General Help mode for contextual panel and control guidance, and the full accessibility pass. Playheads remain visible as discrete step indicators when Android Chrome reports reduced motion, while the default presentation stays smooth. The four optional backlog modules remain deliberately deferred because the SDD requires demonstrated usage first. Physical mid-range Android measurements for all seven C10 budgets remain before the Phase 5 gate can be marked fully accepted.

The studio UI has been consolidated around the performance path. The global header now keeps Tap BPM before icon-only Play/Pause, Stop, Share, and General Help controls; repeated taps set a smoothed whole-number BPM, while minus/plus controls to the left of the tempo field make one-BPM changes. Pause preserves the exact transport beat and freezes every playhead, Play continues from it, and Stop resets to zero. Tempo, key, icon-only Random, and module creation form the compact command deck below. Mobile reaches the rack immediately and shortens the brand to `s-R`, while desktop keeps the full title and `Local generative MIDI` subtext and places project, rack, scene, hardware, export, and diagnostics tools in a persistent workspace rail. Closing that rail reduces it to an accessible 44 px toolbox trigger, and any desktop module can temporarily span the full lane row. New projects use the clear `New Project` default; saved documents using the former `Untitled Project` default migrate automatically. Module plates expose pattern and musical parameters first, move routing and deterministic scheduling into an `Output & advanced` disclosure, and use schema-selected knobs, steppers, segmented controls, switches, selects, and mixer faders instead of a single slider language. Recognizable frequent actions use compact emoticons with explicit accessible names; ambiguous, destructive, recording, mutation, launch, routing, and module-menu commands retain visible text. See the [UI reorganization evidence](.agents/docs/ui-reorganization.md) and [design QA report](design-qa.md).

Phase 6 implementation and automated acceptance are complete. Arp, Euclid, Piano roll, CC Control, and Mod are addable and editable on mobile through adaptive editors rather than a compressed desktop layout. The rack stays vertical and progressively disclosed, with at most one dense editor body expanded; CC and Mod use grouped disclosures, and Piano roll uses a dedicated full-screen editor with touch and keyboard note operations plus focus restoration. The audio engine, deterministic generators, scheduler, MIDI timing, project schema, and share formats remain common across both surfaces. Automated Chrome coverage passes for all ten module types at 375 × 667 and 375 × 812, including cross-device link/project round trips and axe. The Phase 6 gate remains open until the physical Android performance pass with 16 active modules at 140 BPM and the remaining device checks are recorded. See the [Phase 6 specification and evidence](.agents/docs/phase-6-mobile-studio.md).

The application deliberately uses Svelte 5 with Vite rather than SvelteKit. sequens-R is currently a single-screen, client-only, offline-first instrument, so SvelteKit's routing and server-rendering facilities would add browser/SSR boundaries without improving AudioWorklet scheduling or synthesis performance. This decision should be revisited if the product gains multiple routes, server endpoints, authentication, cloud storage, or a separately prerendered public site.

## Local development

Requirements: Node.js 20.19 or newer and Google Chrome.

```bash
npm install
npm run dev
```

The Vite server sends COOP/COEP headers. Open the printed localhost URL rather than opening `index.html` directly.

## Example project

[Basic Electro](public/projects/basic-electro.sequens-r.json) is a schema-version-3 project at 110 BPM in C minor with Drums and Arp modules. Import it through Workspace → Import to exercise the same validated project path used by exported user projects.

## Verification

```bash
npm run verify
```

This runs strict Svelte/TypeScript checks, deterministic unit and property tests, a production PWA build, the 200 KiB initial-JavaScript gate, and the Chrome browser flows.

See [Phase 1 evidence](.agents/docs/phase-1-sound.md), [Phase 2 evidence](.agents/docs/phase-2-persistence.md), [Phase 3 evidence](.agents/docs/phase-3-midi-outputs.md), [Phase 4 evidence](.agents/docs/phase-4-desktop.md), [Phase 5 evidence](.agents/docs/phase-5-polish.md), the [Phase 6 specification](.agents/docs/phase-6-mobile-studio.md), [UI reorganization evidence](.agents/docs/ui-reorganization.md), and [architecture decisions](.agents/docs/architecture-decisions.md) for the current acceptance status and technical rationale.
