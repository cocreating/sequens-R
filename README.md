# sequens-R

sequens-R is a local-first, generative MIDI sequencer for Chromium-based browsers. It is being built from the project SDD in discrete, verified phases.

## Project status

Phases 1 and 2 are complete and pass their Definitions of Done. The Android reference-device critical flow, click-free live reordering, and 0.584 ms scheduler-message jitter are documented. Projects now include eight pattern slots per module, reversible mutation, undo/redo, IndexedDB persistence, and validated JSON import/export.

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

See [Phase 1 evidence](.agents/docs/phase-1-sound.md), [Phase 2 evidence](.agents/docs/phase-2-persistence.md), and [architecture decisions](.agents/docs/architecture-decisions.md) for the current acceptance status and technical rationale.
