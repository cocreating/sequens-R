# Synth module plan

Status: implemented with automated acceptance, 2026-08-31. Human preset listening and physical Android C10 evidence remain open.

## 1. Product role

Add **Synth** as the rack's generative lead and melodic-phrase module.

This fills the clearest gap in the current instrument set:

- Bass owns low, mostly monophonic foundations.
- Acid owns 303-style accented and sliding sequences.
- Chords owns harmonic beds.
- Arp traverses chord tones at a fixed rate.
- Piano roll owns manually authored notes.
- Synth creates seed-driven, key-aware lead phrases with rests, contour, repetition, and cadence.

Synth is not a general modular synthesizer, a replacement for Piano roll, or a second Acid module. Its first version should be immediately musical from one seed and a small set of macro controls, consistent with sequens-R's mobile-first rack workflow.

## 2. Release contract

Synth follows the shared module contract without exceptions:

- eight pattern slots, stable uint32 seed, Random, four mutation intensities, scheduled mutation, and one-step Revert;
- deterministic generation from `seed + params + project key` with no time, I/O, or global-state dependency;
- internal monitoring plus independent per-module Web MIDI port/channel routing;
- mute, solo, monitor, level, pan, delay send, reverb send, color, name, collapse, duplicate, reorder, and scenes;
- one shared pattern for live scheduling, MIDI output, SMF export, WAV mix, and WAV stems;
- sound changes never alter generated notes, MIDI events, or SMF bytes;
- full project persistence and compact-link sharing under the existing safety contract; compact links omit device-specific MIDI port/channel routes;
- the same `VoiceFactory` implementation for live and offline rendering.

Recommended catalog position: after Acid and before Chords. Recommended default name: `Synth`. Recommended default color: `navy` so it reads as melodic while remaining distinct from Acid's olive and Arp's current navy; Arp should move to `steel` only if visual review shows the two modules are too similar. Do not change existing saved module colors during migration.

## 3. MVP musical design

### Generator controls

Keep the first release to seven controls:

| Key | Label | Values | Default | Purpose |
| --- | --- | --- | --- | --- |
| `style` | Phrase | Motif, Climb, Fall, Answer, Orbit, Drift | Motif | Selects an original melodic strategy, not stored note content. |
| `steps` | Steps | 8–64, step 8 | 16 | Sets loop length in sixteenth notes. |
| `density` | Density | 0–100% | 55% | Controls occupied rhythmic positions while retaining cadence anchors. |
| `range` | Range | 1–3 octaves | 2 | Bounds melodic travel. |
| `octave` | Octave | 2–6 | 4 | Sets the base register. |
| `gate` | Gate | 10–100% | 70% | Sets generated and outgoing MIDI note duration. |
| `repeat` | Repeat | 0–100% | 35% | Controls reuse of the current motif versus introduction of a new scale degree. |

All styles must remain in the project scale, emit MIDI pitches 0–127, and avoid overlapping notes in v1. The phrase should have a stable four-step motif cell, deterministic rests, bounded leaps, and a cadence near the end of the loop. `density = 0` may retain only a final tonic anchor; document that musical exception instead of pretending the control produces literal zero events.

Mutation should preserve recognizable identity at levels 1–2 and allow structural change at levels 3–4:

- Level 1: velocity, gate, or one non-anchor pitch changes.
- Level 2: rhythm or two motif tones change while the cadence remains.
- Level 3: motif contour and rests may change.
- Level 4: a new deterministic phrase is produced with the same parameters.

The initial generator uses project key only. Explicit `Chords -> Synth` following is a later extension because source selection needs stable module IDs, deletion fallback, duplication semantics, project persistence, and a UI that cannot be represented safely as another numeric generator parameter.

### Sound controls

Use a bounded monophonic dual-oscillator subtractive voice with reusable nodes allocated outside scheduler callbacks.

| Key | Label | Values | Default | Audio-only behavior |
| --- | --- | --- | --- | --- |
| `wave` | Wave | Triangle, Saw, Square | Saw | Selects the main preallocated oscillator. |
| `shape` | Shape | 0–100% | 35% | Blends a detuned secondary oscillator and changes its octave mix. |
| `cutoff` | Cutoff | 0–100% | 62% | Sets base low-pass cutoff. |
| `resonance` | Resonance | 0–100% | 24% | Sets bounded filter emphasis. |
| `envelope` | Filter env | 0–100% | 52% | Sets velocity-sensitive filter movement. |
| `attack` | Attack | 0–100% | 8% | Maps to a bounded 2–250 ms amplitude attack. |
| `release` | Release | 0–100% | 38% | Maps to a bounded 20 ms–1.5 s release. |
| `glide` | Glide | 0–100% | 12% | Glides only between overlapping/legato generated notes; otherwise retriggers. |

The voice uses one persistent main oscillator, one persistent secondary oscillator, one resonant low-pass filter, one amplitude envelope, a DC-safe saturation stage, and the existing module strip/panner/sends. Oscillator selection must use gains or bounded crossfades rather than graph reconstruction during playback.

Ship six to eight original procedural presets covering neutral lead, soft triangle, bright saw, hollow square, short pluck, wide detuned, dark glide, and glassy high-register roles. Preset names and default trim values are chosen only after loudness matching and listening review.

### UI behavior

- The standard module plate is sufficient for v1; do not add a custom piano-roll-style editor.
- Show generator controls before the Sound and Output & advanced disclosures.
- Use a segmented control for Phrase only if all six labels remain readable; otherwise use the existing accessible select.
- Use steppers for Steps, Range, and Octave; knobs for Density, Gate, and Repeat.
- The step grid remains a result preview, not a manual editor.
- Add concise contextual help for every generator and sound control, especially the difference between generator Gate and sound Release.
- Add Synth to the Add Module library with the description `Seeded lead melodies with contour and cadence`.
- On 375 × 667 and 375 × 812 surfaces, the full editor must fit the existing progressive-disclosure model with no horizontal overflow.

## 4. Explicitly out of scope for v1

- manual note editing or recording;
- polyphony, chord mode, unison voice stacks, or unlimited oscillators;
- wavetable import, samples, user assets, runtime downloads, or cloud presets;
- an arbitrary modulation matrix or internal CC/Mod destinations;
- per-step probability, ratchets, automation, MPE, aftertouch, or microtonal tuning;
- a second transport, Tone.js, or any dependency for synthesis;
- Chords following until explicit source-selection semantics are designed;
- changes to existing Bass, Acid, Arp, Chords, or Piano behavior.

## 5. Architecture and data changes

Treat Synth as a new audible `ModuleType`, not a special case layered onto Bass.

Expected implementation surface:

- `src/lib/core/pattern.ts`: append `synth` to the audible module type union.
- `src/lib/generators/synth.ts` and `src/lib/generators/index.ts`: pure generator, schemas, mutation, registry entry.
- `src/lib/audio/voices/synth.ts`: persistent monophonic voice and exported testable mapping helpers.
- `src/lib/audio/sound.ts`: sound schema, append-only preset rows, default preset, validation.
- `src/lib/audio/voice-factory.ts`: explicit `procedural-synth-v1` identity and construction branch.
- `src/lib/share/schema.ts`: append Synth to `MODULE_TYPES`; never insert it in the middle of an existing compact index table.
- `src/lib/state/rack.ts` and `src/lib/state/module-color.ts`: default name, level, color, slots, and standard rack behavior.
- `src/App.svelte`: Add Module catalog entry.
- `src/lib/ui/module-help.ts`: generator and sound help.
- persistence, export, diagnostics, demo/reference fixtures, and all exhaustive `Record<ModuleType, ...>` maps.

### Implemented schema decision

The implementation uses an explicit additive release boundary:

- project schema moves from 5 to 6 while continuing to migrate schemas 0–5;
- patch schema moves from 4 to 5;
- append Synth after Mod in `MODULE_TYPES` so all prior compact module indexes remain stable;
- append all Synth presets after the current preset catalog so all prior preset indexes remain stable;
- patch schema 4 remains readable through the same decoder because Synth and its presets are strictly append-only; schemas 1–3 remain rejected.

Old projects require no invented Synth data and should migrate byte-for-byte in musical behavior. Older app builds will not understand schema 6 projects or schema 5 links; surface that compatibility boundary in release notes.

## 6. Delivery phases

### S0 — contract and fixtures

- Approve the role, v1 controls, default values, monophonic policy, and schema compatibility choice.
- Add Synth reference racks and golden seeds before DSP tuning.
- Define acceptance pitches for all supported keys/scales and parameter boundaries.

Exit: product contract is stable enough that generator and sound work can proceed independently.

### S1 — deterministic generator and MIDI

- Add the type, generator, parameter schema, six phrase strategies, and mutation behavior.
- Wire normal rack creation, slots, Random, mutate/revert, scenes, duplication, MIDI scheduling, and SMF export.
- Verify no overlaps, finite/bounded values, stable sorting, and seed equality.

Exit: Synth works silently as a deterministic MIDI module and all generator/export tests pass.

### S2 — project and compact sharing

- Implement the selected schema boundary and migrations.
- Add randomized project/link round trips and preserve the 400-byte compact-link gate.
- Verify older project musical output is unchanged after migration.

Exit: Synth survives save/load/share and previous modules remain compatible under the documented policy.

### S3 — internal voice and presets

- Build the reusable monophonic graph and factory identity.
- Add sound macros, safe ramps, legato planning, panic, disposal, and offline synchronization.
- Tune and loudness-match the preset set using deterministic eight-bar phrases.

Exit: live, mix bounce, and stem bounce use the same voice and pass finite PCM, DC, true-peak, click, and loudness gates.

### S4 — desktop/mobile product surface

- Add the library card, default visual identity, controls, Sound panel, contextual help, and responsive behavior.
- Verify touch, keyboard, focus, reduced motion, and screen-reader labels.

Exit: Synth is fully usable at desktop and both reference mobile heights with no serious/critical axe failures.

### S5 — performance and release acceptance

- Add Synth to mixed-rack and worst-case 16-module/140-BPM diagnostics.
- Re-run bundle and offline-shell budgets; add no runtime network dependency.
- Profile scheduler jitter, active voice accounting, UI frame time, and Android render capacity.
- Complete loudness-matched human listening approval for every Synth preset and any changed starter/demo mix.

Exit: `npm run verify` passes, the physical Android C10 evidence is recorded, and the Synth listening direction is approved.

## 7. Verification matrix

Minimum automated evidence:

- fixed seed goldens for every Phrase strategy in representative major, minor, modal, pentatonic, and blues scales;
- repeated generation and mutation equality across seeds and boundary params;
- pitch, velocity, duration, ordering, cadence, density, and non-overlap properties;
- eight-slot recall, scheduled mutation, Revert, Undo/Redo, duplicate, reorder, scene launch, and project round trip;
- Web MIDI timestamps/channels and SMF bytes independent of every sound parameter;
- compact-link randomized round trips and payload size;
- frequency, oscillator blend, cutoff, resonance, envelope, attack, release, glide, voice count, panic, and disposal unit tests;
- live/offline identity, mix/stem isolation, no NaN/Infinity, DC below the project gate, true peak at or below -1 dBTP, and target loudness of -18 LUFS-I ±1 LU;
- Playwright coverage for add/edit/play/mute/solo/monitor/route/export/share on desktop and mobile;
- accessibility, bundle, offline, scheduler, and physical Android performance gates.

## 8. Recommended follow-up after v1

Observe how Synth is actually used before expanding it. The strongest candidate is explicit Chords-source following with stable module-ID selection and visible fallback. After that, consider phrase transforms such as rotate, invert contour, transpose by scale degree, and density-preserving mutate. Manual editing should continue to belong to Piano roll unless usage proves a distinct Synth workflow.

## 9. Implementation evidence

- Svelte/TypeScript check: zero errors and warnings.
- Unit/property suite: 130 tests pass, including Synth phrase goldens, six-style distinction, boundary density/range/length, mutation cadence, eight presets, DSP mappings, factory identity, schema migration, and randomized compact-link coverage.
- Production build: passes with 119.46 KiB initial JavaScript gzip against the 200 KiB budget.
- Targeted Chrome coverage: Synth add/edit/mutate/sound/route/share/restore and axe serious/critical checks pass at 375 × 667; all eleven module types also add and play at 375 × 667 and 375 × 812.
- All eight Synth presets render as distinct references at -18 LUFS-I within 0.04 LU, below -9 dBTP, and below -120 dBFS DC in the deterministic one-bar browser bench.
- Offline browser bounce: the five-module rack containing Synth and the 14-module regression both render audibly below the -1 dBTP ceiling.
- The 16-module/140-BPM acceptance rack now contains Synth and remains preparable through Workspace → Diagnostics.

These automated results do not approve the eight preset balances individually and do not replace the ten-minute physical Android C10 run.
