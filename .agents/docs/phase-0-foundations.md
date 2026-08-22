# Phase 0 · Foundations

Status: complete on 2026-08-22.

## Product decisions

- Product name: sequens-R.
- v1 is free and has no account or monetization layer.
- UI and project copy are English.
- Initial content is one original groove for each of six styles; content authoring is deferred until the relevant product phase.
- Development is local. Production headers remain pending until a hosting target is selected.

## Implemented

- Svelte 5, Vite 6, strict TypeScript, Vitest, Playwright with the Chrome channel, and a generated offline PWA service worker.
- COOP/COEP headers on the local development and preview servers.
- One handwritten CSS token source and ordered cascade layers.
- Shared musical domain types, seeded `sfc32`, scale mapping, diatonic chords, and tonal transposition.
- Dependency-free CBOR subset, native `deflate-raw`, base64url fragments, positional parameter schemas, schema version rejection, and the versioned starter rack.

## Verification evidence

- `svelte-check`: 0 errors and 0 warnings.
- Vitest: 8 tests passed, including the fixed `sfc32(42)` golden sequence.
- Serialization property suite: 200 random five-module racks round-trip canonically; the largest compressed payload is 82 bytes against the 400-byte limit.
- Production application JavaScript: 18.05 KiB gzip including the PWA registration chunk, against the 30 KiB Phase 0 limit.
- Playwright in real Chrome: `crossOriginIsolated === true` on the production preview.
- PWA build: manifest and fully local Workbox service worker generated.

Run all gates with `npm run verify:phase0`.

## Deferred by decision or phase boundary

- Production COOP/COEP configuration: requires the future hosting target.
- Audio, generators, module UI, starter-rack playback, and sharing controls: Phase 1.
- The six original test grooves: authored with the module content in the relevant later phase.
