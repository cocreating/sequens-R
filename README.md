# sequens-R

sequens-R is a local-first, generative MIDI sequencer for Chromium-based browsers. It is being built from the project SDD in discrete, verified phases.

## Project status

Phases 1, 2, and 4 are complete and pass their automated Definitions of Done. Phase 3 implementation and automated acceptance are also complete: Web MIDI is opt-in, routing is per module, notes and 24 PPQ clock use absolute timestamps, and the app exports SMF Type 1, offline WAV mixes, and zipped WAV stems. Physical 10-minute clock/jitter measurement and three-DAW import checks remain before the Phase 3 gate can be marked accepted.

At 1024 CSS px and wider, Phase 4 adds the parallel-lane desktop studio, Arp, Euclid, Piano roll, CC Control, Mod, multiple racks, keyboard shortcuts, selectable audio output, and File System Access saves. Shareable desktop modules still reproduce from links on mobile through playback-only plates; manual Piano roll data and recorded CC motion use project export instead.

The application deliberately uses Svelte 5 with Vite rather than SvelteKit. sequens-R is currently a single-screen, client-only, offline-first instrument, so SvelteKit's routing and server-rendering facilities would add browser/SSR boundaries without improving AudioWorklet scheduling or synthesis performance. This decision should be revisited if the product gains multiple routes, server endpoints, authentication, cloud storage, or a separately prerendered public site.

## Local development

Requirements: Node.js 20.19 or newer and Google Chrome.

```bash
npm install
npm run dev
```

The Vite server sends COOP/COEP headers. Open the printed localhost URL rather than opening `index.html` directly.

## Verification

```bash
npm run verify
```

This runs strict Svelte/TypeScript checks, deterministic unit and property tests, a production PWA build, the 200 KiB initial-JavaScript gate, and the Chrome browser flows.

See [Phase 1 evidence](.agents/docs/phase-1-sound.md), [Phase 2 evidence](.agents/docs/phase-2-persistence.md), [Phase 3 evidence](.agents/docs/phase-3-midi-outputs.md), [Phase 4 evidence](.agents/docs/phase-4-desktop.md), and [architecture decisions](.agents/docs/architecture-decisions.md) for the current acceptance status and technical rationale.
