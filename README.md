# sequens-R

sequens-R is a local-first, generative MIDI sequencer for Chromium-based browsers. It is being built from the project SDD in discrete, verified phases.

## Project status

Phase 1 implementation is complete and passes the automated verification suite. Its final Definition of Done remains pending validation on a real mid-range Android device running stable Chrome. Phase 2 will not begin until that device check passes or the SDD is explicitly amended.

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

See [Phase 1 evidence](.agents/docs/phase-1-sound.md) and [architecture decisions](.agents/docs/architecture-decisions.md) for the current acceptance status and technical rationale.
