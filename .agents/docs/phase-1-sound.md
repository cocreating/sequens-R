# Phase 1 · Sound

Status: implementation complete; the real-Android Definition of Done remains pending.

## Implemented

- A single `AudioContext` created only by the Play gesture with `latencyHint: 'interactive'` and no forced sample rate.
- A dedicated AudioWorklet clock, 150 ms look-ahead scheduler, absolute AudioContext timestamps, and bar-boundary immutable snapshot swaps.
- A master dynamics limiter and preallocated polyphonic and acid voices. The drum kit uses eight deterministic buffers generated once at engine initialization and scheduled through `AudioBufferSourceNode` instances.
- Internal drum, square-bass, simple saw/biquad acid, and polyphonic chord voices. Acid events carry slide and accent data and the monitor voice applies real frequency portamento.
- Pure deterministic Drums, Bass, Acid, Chords, and Mixer generators with versioned golden hashes.
- Six original drum styles, one starter groove per style: Four, Broken, Latin, Electro, Half-time, and Odd.
- Mobile-first transport, editable drum grid, schema-generated parameters, module headers, mute/solo/monitor, collapse, add/delete, and touch/keyboard reordering from a dedicated handle.
- Mixer channels for per-module mute, solo, and level.
- A three-module audited starter rack, Random, live parameter changes, and link sharing through the URL fragment and clipboard.
- Eight-millisecond module-bus fade-out before deletion to avoid abrupt discontinuities.

## Automated evidence

- `svelte-check`: 0 errors and 0 warnings.
- Vitest: 18 tests pass, including five generator goldens, the versioned starter rack, six distinct drum styles, scheduler windows, theory foundations, and the Vercel production-isolation configuration.
- For 200 random five-module racks, link serialization restores both canonical state and deeply identical generated patterns. The largest payload is 125 bytes against the 400-byte limit.
- Real Chrome Playwright: 3 tests pass at 375 × 667, covering first Play, Random, a parameter change, sharing, reopening the identical fragment, live add/delete, drum editing, mixer control, and cross-origin isolation.
- Local Chrome scheduler message-delivery jitter: 0.869 ms standard deviation in the 2026-08-24 verification run. This measures the AudioWorklet-to-main scheduling bridge, not the Phase 3 MIDI-output timestamp path.
- Initial JavaScript: 43.16 KiB gzip against the 200 KiB product limit.
- No `Math.random`, `Date.now`, runtime network calls, or production `any` occur in `src/`.

## Production deployment evidence

Verified against `https://sequens-r.vercel.app/` on 2026-08-24 after commit `4131945`:

- Vercel returns `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on the deployed app.
- Real headless Chrome reports `crossOriginIsolated === true` at a 375 × 667 viewport.
- The deployed starter rack loads with three modules, Play starts the transport, Random and parameter changes work, and live add/delete returns from four modules to three without a page error.
- A shared `#p=` link restores on a second page and starts its transport with no page error.
- Deployed Chrome scheduler message-delivery jitter measured 0.613 ms standard deviation. This is desktop Chrome at a mobile viewport, not the required Android reference-device measurement.

Run automated gates with `npm run verify`.

## Remaining Phase 1 acceptance evidence

The SDD requires the final critical-flow evidence on a real mid-range Android device running stable Chrome. That physical pass still needs:

1. Confirm audible starter-rack output from one Play gesture.
2. Open a shared link on a second device and compare the audible result; deterministic pattern equality is already automated.
3. Listen while adding, deleting, and reordering modules to confirm there are no clicks or interruptions.
4. Record scheduler jitter on the reference device.

Phase 2 must not begin until this checklist passes or the SDD is explicitly amended.
