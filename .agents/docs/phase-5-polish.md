# Phase 5 · Polish and depth evidence

Status: implementation and automated acceptance complete on 2026-08-24. The phase gate remains pending the physical Android measurements listed below.

## Delivered

- Scenes capture each module’s active slot, persist in project schema version 3, can be named or deleted, and launch through one immutable snapshot at the next scheduler bar while playing.
- Media Session metadata, play/pause/stop handlers, four-beat position state, Screen Wake Lock during playback, and visibility-return recovery for suspended audio.
- Progressive Chrome layer: View Transitions for module changes, `content-visibility: auto` and intrinsic sizing for module plates, compositor `transform` playheads with once-per-bar correction, and `scheduler.postTask({ priority: 'background' })` for debounced persistence.
- A four-stage zero-delay-feedback TPT ladder in the Acid AudioWorklet, retaining monophonic slide and accent behavior and the same voice interface. Offline bounce loads the same processor.
- An internal diagnostics panel for audio state, `baseLatency + outputLatency`, scheduler jitter, active voices, `renderCapacity` average/peak load and underrun ratio when exposed, and cross-origin isolation.
- Accessibility pass: proper rack tabs with roving focus and arrow/Home/End navigation, keyboard piano-note creation/move/resize/delete, semantic groups and pressed states, focus recovery after module deletion, keyboard-accessible horizontal grids, visible focus, reduced-motion behavior, a top-right General Help mode for pointer/keyboard contextual guidance across the application, per-module detailed help, and axe coverage.
- No Phase 5 backlog module was added. RF-030 through RF-033 remain gated on demonstrated product usage as required by the SDD.

## Progressive-enhancement evidence

The Phase 5 Chrome integration test injects every new native API and verifies it is exercised. A second Chrome flow removes View Transitions, Scheduler, Media Session, Wake Lock, and Web Animations before application code loads; play, Acid creation, persistence, diagnostics, and stop continue without a page error. `content-visibility` naturally degrades as an ignored CSS declaration, and Render Capacity is feature-detected with an explicit fixed-ceiling state.

Lighthouse 11.7.1 reports `installable-manifest: 1`. The generated manifest, maskable icon, viewport, service worker build, and offline application shell are also asserted by the production build and Playwright. Lighthouse 13.4.1 scores Performance 100, Accessibility 100, and Best Practices 100 on the local production preview; measured FCP was 1.3 s, LCP 1.7 s, TBT 20 ms, CLS 0, and transferred page weight 73 KiB. These desktop synthetic numbers are useful regression evidence, not substitutes for the Android reference-device gate.

## Automated verification

Executed on 2026-08-24:

```text
npm run check
  svelte-check: 0 errors, 0 warnings

npm test
  11 files, 52 tests passed

npm run build
  production PWA build passed; 10 entries / 239.89 KiB precached

npm run check:bundle
  73.82 KiB initial JavaScript gzip / 200.00 KiB budget

npm run test:e2e
  23 Chrome tests passed
  General Help pointer/focus/Escape flow: passed
  axe: no serious or critical violations
  native Phase 5 API path and forced fallbacks: passed
```

## C10 budget status

Two size budgets and the local synthetic TTI proxy have automated evidence. The SDD explicitly requires the final measurements on a mid-range Android device running stable Chrome, so the remaining values are not inferred from desktop headless Chrome.

| Budget | Current evidence | Gate status |
|---|---|---|
| Initial JavaScript ≤ 200 KiB gzip | 73.82 KiB | Pass |
| Total initial load ≤ 400 KiB | 73 KiB Lighthouse transfer; 239.89 KiB full precache | Pass |
| TTI ≤ 2.5 s on simulated 4G | Lighthouse desktop FCP 1.3 s/LCP 1.7 s/TBT 20 ms | Android 4G run required |
| 0 audio xruns, 16 active modules at 140 BPM | Panel records underrun ratio where supported | Physical run required |
| Render Capacity average ≤ 0.5, peak ≤ 0.8 | Panel and feature-detected fallback verified | Physical run required if API exists |
| UI frame ≤ 8 ms during playback | Compositor playhead and offscreen containment verified | Physical trace required |
| MIDI scheduling jitter ≤ 1 ms σ | Existing Android Phase 1 scheduler bridge: 0.584 ms σ; Phase 3 physical MIDI still pending | Physical MIDI run required |
| Audio latency < 40 ms | Panel reports the combined native values | Physical value required |

Although the SDD calls these “seven budgets,” its list separates initial JavaScript from total initial load and therefore contains eight measurable rows. This document preserves every stated constraint rather than silently combining results.

## Manual Android acceptance remaining

On a named mid-range Android device with stable Chrome:

1. Install from the browser and relaunch offline; verify lock-screen play/pause, wake lock, and background return without reload or transport drift.
2. Build a 16-active-module rack at 140 BPM and run for at least 10 minutes. Record xruns/underrun ratio, average/peak Render Capacity if exposed, combined output latency, and any audible fault.
3. Capture a Performance trace while transport and all playheads run. Record the worst and representative UI frame work and verify it remains within 8 ms.
4. Run Lighthouse with simulated 4G and record TTI (or Lighthouse’s current interaction-ready replacement if TTI is unavailable), device, Chrome/Lighthouse versions, and throttling settings.
5. Complete the Phase 3 physical MIDI clock/jitter run and record event-arrival standard deviation for the C10 MIDI budget.

Phase 5 should be marked fully accepted only after those device results pass and are appended here.
