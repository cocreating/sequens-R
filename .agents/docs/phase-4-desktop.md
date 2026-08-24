# Phase 4 · Desktop studio evidence

Status: automated Definition of Done accepted on 2026-08-24.

## Delivered

- A distinct desktop studio disposition at 1024 CSS px and wider, with two parallel lanes and three lanes at 1440 px. It reuses the mobile module primitives rather than creating a second application.
- Five desktop modules:
  - Arp with direction, rate, octave span, gate, and live following of the first Chords module.
  - Euclid with three independent Bjorklund rings, per-ring length/hits/rotation/note, and combined or channel-offset MIDI output.
  - Piano roll with 16/32/64 steps, chromatic/in-key entry, click-to-add, pointer move/resize, and keyboard note editing/removal.
  - CC Control with four schema-generated controls, CC/channel per control, immediate MIDI output, and quantized 1–8 bar motion recording.
  - Mod with three deterministic tempo-synchronous LFOs, five shapes, rate, depth, fade-in, center, bipolar/unipolar mode, CC, and channel.
- MIDI control events and per-event channels are scheduled, muted, exported to SMF, and excluded from internal WAV voices where appropriate. Euclidean rings retain independent cycle lengths in live scheduling and SMF export.
- Per-module MIDI routing remains available, with desktop `AudioContext.setSinkId()` output selection and File System Access saves. Both browser APIs are feature-detected and keep their existing system-output/download fallbacks.
- Multiple rack creation, duplication, naming, switching, deletion, persistence, and active-rack publishing.
- Collision-resistant UUID-backed module identities across restored, imported, duplicated, and newly created racks.
- Desktop keyboard commands for transport, Random, undo/redo, Save, and previous/next rack.
- Shareable desktop generators survive link round trips and reproduce on mobile. Mobile replaces their editor with a playback-only plate explaining the 1024 px requirement. Piano roll and recorded CC motion are blocked from link sharing with an exact project-export alternative.

## Determinism and migration

- Golden hashes at seed `0x504834`:
  - Arp: `acfe8b56`
  - Euclid: `3df4f16e`
  - Piano roll: `b5479a42`
  - CC Control: `9479df54`
  - Mod: `8437a0df`
- Project schema version 2 migrates Phase 2/3 version 1 documents.
- Patch schema version 2 reads version 1 links and appends the desktop generator indexes without changing the original five.
- Recorded CC points are re-clamped to the active loop when its bar count shrinks and are normalized again at the project import boundary.
- Audio teardown releases the MIDI time-bridge interval and `AudioContext` while issuing transport stop and panic cleanup first.

## Verification

Executed on 2026-08-24:

```text
npm run check
  svelte-check: 0 errors, 0 warnings

npm test
  10 files, 47 tests passed

npm run build
  production build passed

npm run check:bundle
  61.82 KiB gzip / 200.00 KiB budget

npm run test:e2e
  16 Chrome tests passed
  Phase 4 desktop tests: 4 passed
  Existing mobile, persistence, MIDI/export, drag, and isolation flows: all passed
  Observed automated scheduler message jitter: 0.612 ms sigma
```

The Phase 4 Chrome flows cover parallel lanes, all five module editors, piano note entry, CC recording/non-shareability, multiple-rack persistence, shortcuts, mocked `setSinkId`, mocked File System Access writes, link sharing, and mobile playback-only rendering. A 1440 × 1100 production build was also visually inspected with all five desktop modules added.

Physical MIDI clock/jitter and DAW-import checks remain part of the Phase 3 gate and were deliberately not reclassified by this phase.
