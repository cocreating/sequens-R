# Piano Roll Pro · implementation and evidence

Status: implemented and automatically accepted on 2026-08-28. Physical Android checks remain governed by the open Phase 6/C10 gate.

## Outcome

The Piano Roll is now a full authored-phrase workstation on desktop and mobile while retaining its existing project-only sharing boundary. It adds expressive dynamics, reversible loop editing, harmonic composition helpers, scalable navigation, routed audition, and a curated original melody library without introducing a new module type, transport, audio voice, dependency, or persistence schema.

## Delivered editor contract

- Per-note velocity is editable from the selected-note range and the persistent velocity lane. Pointer movement previews a draft and commits once on release, producing one rack Undo entry.
- Accent is stored on the note and raises velocity to at least 112. Manually lowering the velocity below that threshold clears Accent so the visual state, internal sound, Web MIDI, project JSON, and SMF bytes agree.
- Loop shortening keeps out-of-range events in the active `PatternSlot`. The editor reports how many notes are preserved; engine snapshots and MIDI export filter them until the loop expands again.
- Active notes can move one scale degree or one octave in either direction. The 36–83 editor range remains bounded, and inactive overflow notes are not silently transformed.
- A selectable Chords-module source provides chord-tone row/key highlighting and stamps the chord active at the selected note or edit cursor. The source is editor-local presentation state and falls back visibly when modules change.
- The scrollable keyboard labels pitches and explicitly auditions any key. `Audition edits` optionally previews additions, movement, dynamics, transforms, and loaded melodies through the module's normal engine/MIDI route.
- Zoom options are Fit, 50%, 75%, 100%, 150%, and 200%. Scrolling remains inside the editor, including the full-screen mobile dialog.
- Loading a melody replaces the active phrase as one undoable operation and synchronizes the slot Length parameter to the example's native 16, 32, or 64 steps.

## Original key-aware melody catalog

Every example stores rhythm, scale degrees, register offsets, dynamics, and accents rather than fixed copyrighted pitches. Loading resolves those degrees against the current project key and creates ordinary editable `NoteEvent` records.

| # | Example | Level | Steps |
| ---: | --- | --- | ---: |
| 01 | Steady Beacon | Simple | 16 |
| 02 | Rising Steps | Simple | 16 |
| 03 | Gentle Answer | Simple | 16 |
| 04 | Balanced Arch | Simple | 16 |
| 05 | Skipping Thirds | Developing | 16 |
| 06 | Syncopated Spark | Developing | 16 |
| 07 | Open-Space Drift | Developing | 16 |
| 08 | Turnaround Hook | Developing | 16 |
| 09 | Offbeat Ladder | Developing | 16 |
| 10 | Two-Bar Question | Intermediate | 32 |
| 11 | Sequence Bloom | Intermediate | 32 |
| 12 | Broken-Triad Run | Intermediate | 32 |
| 13 | Color Weave | Intermediate | 32 |
| 14 | Octave Conversation | Intermediate | 32 |
| 15 | Anticipation Line | Intermediate | 32 |
| 16 | Motif Development | Advanced | 32 |
| 17 | Wide-Interval Study | Advanced | 64 |
| 18 | Three-Part Arc | Advanced | 64 |
| 19 | Polyrhythmic Thread | Advanced | 64 |
| 20 | Longform Journey | Advanced | 64 |

## Data, audio, and compatibility boundaries

- `pianoEditorPattern()` exposes the complete stored authored pattern. `modulePattern()` exposes only active notes to playback, bounce, Web MIDI, and SMF consumers.
- No project migration is required: events beyond `lengthSteps` were already valid `Pattern.events` and round-trip through schema 5. Melody loading synchronizes the existing numeric Length parameter in both the active module and slot.
- Sound parameters remain independent from authored notes. Audition calls `AudioEngine.audition()`, which schedules through the existing snapshot and voice/MIDI path rather than allocating a special preview graph.
- Compact links still reject Piano modules. Project save/export remains the complete format for notes, overflow, velocities, accents, and loaded examples.
- The melody catalog adds no asset download, runtime network request, sample provenance issue, or dependency.

## Accessibility and responsive behavior

- Every transform, melody, zoom, selected-note, pitch-key, and velocity action has a native control and accessible name.
- Velocity bars support pointer input plus Arrow Up/Down keyboard adjustment. Notes retain Arrow movement, Shift+Arrow resizing, Delete/Backspace removal, and visible selection.
- Pitch keys expose musical names rather than raw MIDI numbers. Scale and chord highlighting is redundant to labels and operation; it is not the only way to identify or enter notes.
- The mobile editor remains a native full-screen dialog with Escape/Close and opener-focus restoration. Editor scrolling is local and the document does not acquire horizontal overflow.
- Automated axe reports no serious or critical violations with the mobile Piano dialog open.

## Automated evidence

Executed on 2026-08-28 after the complete Piano Pro and melody-library implementation:

```text
npm run check
  svelte-check: 0 errors, 0 warnings
  Svelte 5 autofixer: no issues

npm test
  18 files, 122 tests passed
  Piano Pro: dynamics/accent bounds, degree/octave transforms,
  chord lookup/stamping, all 20 key-aware templates, loop persistence,
  project round trip, and native-length synchronization passed

npm run build
  production PWA build passed; 190 modules transformed

npm run check:bundle
  115.14 KiB initial JavaScript gzip / 200.00 KiB budget

npm run test:e2e
  56 Chrome tests passed
  Piano Pro desktop workflow and existing desktop/mobile Piano flows passed
  mobile Piano axe serious/critical gate passed
```

The browser workflow explicitly checks velocity/accent editing, non-destructive 32→16→32 restoration, chord stamping, degree and octave transforms, 50/75/150% zoom selection, pitch-key/audition controls, a 4-note 16-step simple melody, and the 28-note 64-step advanced melody. Full project regressions also cover persistence, MIDI/export, audio rendering, responsive surfaces, PWA isolation, and bundle limits.

## Bundled showcase follow-up

The key-aware Piano melody library remains available inside the editor, but the shipping demo picker changed on 2026-08-31 to fifteen Synth-led electronic projects. The catalog now groups five Minimal Techno, five Minimal House Techno, and five Ambient Techno & Breakbeats arrangements, with Intro/Groove/Variation/Peak scenes and no persisted Mixer module. This catalog change does not remove, migrate, or alter Piano-authored data; the complete current matrix and open listening gate are tracked in `demo-projects.md`.

## Remaining limitations

- Multi-select, copy/paste, duplicate, quantize, and a user-defined loop range remain backlog items.
- Harmony-source and zoom choices are not persisted.
- The 20 built-in melodies are authored starting points, not seed-driven generators.
- Piano patterns remain too large for compact links and require project export.
- Physical Android touch ergonomics, frame time, and the shared 16-module/140-BPM C10 scenario remain open.
