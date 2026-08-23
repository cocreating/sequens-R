# Architecture decisions

This file records project-level choices that refine the SDD. Product behavior and phase gates remain governed by the SDD unless a decision is explicitly amended here.

## AD-001 · Product baseline

Status: accepted on 2026-08-22.

- Product name: **sequens-R**.
- Scope: v1 as defined by the SDD.
- Development and verification are local until a hosting approach is selected.
- Product and engineering language: English.
- The intended seed corpus is 40 original grooves distributed across six styles. During development, use one representative groove per style so the behavior can be tested before expanding the corpus at the end.

## AD-002 · SvelteKit evaluation

Status: accepted on 2026-08-23.

Decision: continue with **Svelte 5 + Vite** and do not migrate the application to SvelteKit at this stage.

Rationale:

- sequens-R is a single-screen, browser-only, offline-first instrument with no server data flow.
- SvelteKit would not improve AudioWorklet execution, event scheduling, synthesis, MIDI timestamping, or polyphony.
- The current initial JavaScript bundle is 43.16 KiB gzip, comfortably below the SDD's 200 KiB limit.
- SvelteKit's routing, layouts, server endpoints, and prerendering do not currently offset the additional SSR guards, adapter configuration, and migration surface required by the browser-only audio engine.
- The existing Vite PWA integration already supplies the required offline application shell.

Reconsider this decision if the application gains multiple URL-based sections, authentication, cloud persistence, server endpoints, or a public content site that materially benefits from prerendering or server rendering. Any migration must be benchmarked against the SDD performance budgets before acceptance.
