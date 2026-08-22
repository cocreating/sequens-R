# sequens-R

sequens-R is a local-first, generative MIDI sequencer for Chromium-based browsers. It is being built from the project SDD in discrete, verified phases.

## Local development

Requirements: Node.js 20.19 or newer and Google Chrome.

```bash
npm install
npm run dev
```

The Vite server sends COOP/COEP headers. Open the printed localhost URL rather than opening `index.html` directly.

## Phase 0 verification

```bash
npm run verify:phase0
```

This runs strict Svelte/TypeScript checks, deterministic unit and property tests, a production PWA build, the 30 KiB gzip budget gate, and the Chrome cross-origin-isolation test.
