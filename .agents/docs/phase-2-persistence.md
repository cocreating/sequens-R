# Phase 2 · Determinism and persistence

Status: complete. Definition of Done accepted on 2026-08-24.

## Implemented

- Exactly eight deterministic pattern slots per sound-generating module, with the active seed visible, editable, and copyable.
- Manual `Mutate`, intensity levels 1–4, optional mutation every 1/2/4/8/16 loops, and `Revert` to the exact pre-mutation slot.
- Bar-boundary scheduled mutation routed through the same immutable audio-engine snapshot mechanism as other live changes.
- Global undo/redo with a 100-state bound. Continuous range/tempo input coalesces into one history step; module reordering is also one step.
- A versioned project document shaped for multiple racks while the current UI remains single-rack.
- IndexedDB autosave and explicit Save, with `navigator.storage.persist()` requested only from the Save gesture.
- Schema migration from the legacy single-rack project shape.
- JSON project export/import with validation and exact cross-browser restoration.
- URL patches load as unsaved drafts and never overwrite the local IndexedDB project without an explicit Save.
- Link sharing detects modules containing local-only data, names the blocked modules, and directs the user to project export.
- Module duplication while the transport is running.

## Verification evidence

- `svelte-check`: 0 errors and 0 warnings.
- Vitest: 25 tests pass across seven files.
- Phase 2 unit evidence covers eight-slot isolation, editable seeds, generator-contract mutation, deep-equality Revert, coalesced undo/redo, 60 independent undo steps, exact project JSON round-trip, legacy migration, and non-shareable-module detection.
- Real Chrome Playwright: 9 tests pass. The five Phase 2 flows cover slots/seeds, manual and scheduled mutation, Revert, coalesced undo/redo, IndexedDB reload restoration, fragment-draft isolation, export/import in a separate browser context, and the local-data share warning.
- Production build initial JavaScript: 48.18 KiB gzip against the 200 KiB limit.
- The 375 × 812 mobile visual pass has no horizontal overflow or runtime errors.

Run all gates with `npm run verify`.

## Definition of Done

- Closing and reopening restores the project exactly: verified in real Chrome through IndexedDB.
- A JSON project exported in one browser context imports identically in another: verified in real Chrome.
- `Revert` restores the pre-mutation pattern by deep equality: verified by unit test and browser flow.
