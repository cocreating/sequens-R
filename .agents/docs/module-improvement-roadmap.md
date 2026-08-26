# Module improvement roadmap

Status: living technical and product roadmap created after the Phase 7 v2-only library cut on 2026-08-26.

This is the single forward-looking reference for every sequens-R module. It records the shipped contract, known limitations, safe extension points, candidate improvements, and the evidence required before any change is accepted. The SDD and phase documents remain authoritative for released requirements and historical evidence; when this roadmap conflicts with an accepted phase contract, the accepted contract wins until an explicit architecture decision changes it.

## 1. Shared module contract

Every rack module owns:

- a stable ID, editable name, module color, collapse/full-width UI state, mute, solo, monitor, internal level, MIDI route, and eight pattern slots;
- a deterministic uint32 seed and quantized generator parameters;
- mutation state with four intensities, scheduled mutation, and one-step revert;
- a generated or manually authored `Pattern` expressed in sixteenth-note steps;
- a versioned `SoundState` containing a released preset ID, quantized sound macros, panorama, and shared delay/reverb sends;
- project persistence through schema 5. Compact links use patch schema 4 and deliberately exclude Piano and recorded CC automation.

The following invariants apply to every future module improvement:

1. The same seed, generator parameters, musical key, and required context must reproduce the same pattern exactly.
2. Sound parameters must not change pattern events, outgoing Web MIDI, MIDI clock, or SMF bytes.
3. Generator parameters may change musical events but must not silently rewrite sound state.
4. Live monitoring, mix bounce, and stem bounce must use the same `VoiceFactory` and rack effect topology.
5. Reusable oscillators, filters, gains, panners, and modulation stages are allocated outside scheduler callbacks. Single-use `AudioBufferSourceNode` creation is allowed.
6. Continuous sound changes use bounded ramps. Retriggers, stealing, panic, disposal, and offline synchronization must not click, hang, produce NaN/Infinity, or retain DC above the project gate.
7. CC Control, Mod, and Mixer remain control-only unless a later phase explicitly introduces an internal routing matrix. They must not acquire an implicit voice.
8. MIDI remains opt-in. Selecting an external output disables internal monitoring to avoid doubling but does not alter the saved generator.
9. All visible controls need keyboard and touch operation, visible focus, contextual help, reduced-motion safety, and axe serious/critical coverage.
10. Any added initial asset or dependency must preserve the 200 KiB gzip JavaScript budget, 400 KiB initial/offline-shell budget, no runtime CDN dependency, and physical Android C10 budgets.

## 2. Shared improvement priorities

Priority meanings:

- **P0 — acceptance:** required to close an existing release gate or prevent data/audio loss.
- **P1 — next value:** meaningful musical or workflow improvement with a bounded implementation path.
- **P2 — exploration:** useful direction that needs discovery, profiling, or product validation first.
- **Deferred:** intentionally outside the current product contract.

Cross-module work should generally happen in this order:

1. Close Phase 7 listening, scheduler-jitter, and physical Android C10 gates.
2. Add automated parameter-boundary, panic/disposal, live-versus-bounce, and migration tests before extending DSP.
3. Improve musical editing and module-to-module context without creating a second transport or breaking deterministic generation.
4. Consider new synthesis/sample techniques only after measuring bundle, memory, polyphony, and offline-render cost.

## 3. Drums

### Released contract

- Generator: six deterministic styles — Four, Broken, Latin, Electro, Half-time, and Odd — over 16 or 32 steps.
- Generator controls: Steps, Style, Swing, and Humanize. Eight hidden uint32 lane masks plus an override bitset persist step edits.
- Event model: eight lanes mapped from MIDI notes 36–43, with deterministic velocity/timing variation and direct step toggling.
- Sound engine: `ProceduralDrumVoice`; eight preallocated lane buses and two deterministic rendered buffer variants per lane. Triggering creates only the required one-shot buffer source.
- Sound controls: Tone, Punch, Decay, Pan, Delay send, and Reverb send.
- Released kits: Foundation, Fracture, Solar, Voltage, Weight, and Tilt.
- Default routing: MIDI channel 10. Separate lanes currently share that channel.

### Known limitations

- Lane identity is fixed to eight internal roles and MIDI notes; users cannot remap note numbers per lane.
- Tone/Punch/Decay are global macros rather than per-lane sound controls.
- Step editing stores binary on/off masks; per-step velocity, probability, ratchets, flam, and microtiming are unavailable.
- Kit synthesis is rendered when the voice is built; it is not a continuous per-hit synthesis graph.

### Improvement backlog

- **P1:** per-step velocity/accent and probability while preserving a compact deterministic representation and editable 32-step masks.
- **P1:** lane mute/solo and optional GM-style note mapping, with explicit project/link schema treatment.
- **P1:** per-lane macro offsets for tune, decay, and level, exposed progressively so mobile remains compact.
- **P2:** deterministic ratchets, flam, rolls, and conditional fills that remain stable across loop boundaries and mutation.
- **P2:** user-authored kit variants built from procedural recipes, not arbitrary runtime downloads.
- **Deferred:** user sample import until the sampling/storage/provenance backlog is explicitly approved.

### Required evidence for changes

- Golden patterns for all six styles and edited lane masks; deterministic 16/32-step mutation fixtures.
- Every lane/kit/variant finite, distinct, DC-safe, and level-matched; no trigger-time reusable-node allocation.
- MIDI note/channel mapping and exported SMF verified independently from internal sound macros.

## 4. Bass

### Released contract

- Generator: monophonic key-aware bass lines with Anchor, Walk, Pulse, Round, Dub, and Jump strategies.
- Generator controls: Style, Steps, Range, Density, Drive (MIDI velocity), Octave, and Gate.
- Sound engine: one persistent monophonic voice with preallocated sine/square/saw sources, one-octave sub oscillator, resonant low-pass filter, dry/drive crossfade, amplitude envelope, and legato glide.
- Legato rule: glide happens only when a note begins before the previous gate ends; separate notes retrigger.
- Sound controls: Wave, Cutoff, Resonance, Envelope, Drive (audio saturation), Glide, Sub, Pan, and sends.
- Released presets: Roundhouse, Clearline, Shortwood, Undertow, Ember, Orbit, Block, and Nightfloor.

### Known limitations

- Strictly monophonic; no controlled duophony or chord mode.
- Generator Drive and Sound Drive share a label but affect different domains; contextual help is required to distinguish them.
- Filter topology is a `BiquadFilterNode`, not the Acid worklet's four-stage nonlinear model.
- Glide behavior is gate-overlap based and has no explicit always/legato/off mode.

### Improvement backlog

- **P1:** clearer domain labeling in dense/mobile views for MIDI Drive versus Sound Drive.
- **P1:** generator rhythm controls for rests, syncopation, tie probability, and phrase cadence without changing the six released styles.
- **P1:** selectable glide policy (off, legato, always) with deterministic tests and no stuck pitch automation.
- **P2:** optional filter models behind the same macro contract, benchmarked against the current persistent graph.
- **P2:** scale-degree constraints, approach notes, and chord-following context shared with Chords rather than duplicated harmonic logic.
- **Deferred:** polyphonic Bass unless a real workflow demonstrates the need.

### Required evidence for changes

- Monophonic allocation and overlap fixtures at 20–300 BPM; pitch and cutoff ramps remain finite and bounded.
- Generator/MIDI goldens for all styles and any harmonic-context mode.
- Saturation harmonic analysis, loudness matching, panic/disposal, and physical Android CPU evidence.

## 5. Acid

### Released contract

- Generator: key-aware monophonic acid phrases with Fill, Steps, Range, and generator Decay controls. Events can carry Accent and Slide flags.
- Sound engine: dedicated `sequens-acid` AudioWorklet with PolyBLEP saw/square oscillator, four-stage TPT low-pass processing, bounded resonance, filter/amplitude envelopes, accent, slide, saturation, DC blocking, readiness, and offline sync barrier.
- Slide rule: a new note glides only when it overlaps an outgoing event marked Slide; otherwise the envelope retriggers.
- Sound controls: Wave, Cutoff, Resonance, Env amount, Decay, Accent, Slide, Drive, Pan, and sends.
- Released presets: Pulsewire, Clearcut, Hollow, Razorleaf, Rubberline, Neoncoil, Nighttrace, Scorch, Liquidstep, Pinpoint, Lowcurrent, and Glasswire.

### Known limitations

- One voice and one filter model; no oscillator tuning, pulse width, or alternative envelope curves.
- Generator Decay controls note/MIDI duration while Sound Decay controls internal envelopes.
- Worklet failure is surfaced, but there is no user-facing recovery action beyond restarting audio/app state.
- No pattern-level editor dedicated to accents, slides, ties, or octave transposition.

### Improvement backlog

- **P0:** keep profiling scheduler/worklet interaction while the browser jitter gate remains open; do not hide host jitter by relaxing the metric.
- **P1:** explicit Acid step editor for note, rest, accent, slide, and octave while preserving deterministic generator fallback and Undo.
- **P1:** user-facing worklet recovery/status diagnostics with safe graph reconstruction outside scheduler callbacks.
- **P1:** clearer labels for generator Decay versus Sound Decay on narrow screens.
- **P2:** additional bounded filter/envelope character modes implemented inside the existing worklet message contract.
- **P2:** deterministic phrase transforms such as rotate, transpose, invert accents, and density-preserving mutate.

### Required evidence for changes

- Extreme-parameter renders at supported sample rates; finite PCM, DC, true-peak, and loudness gates.
- Worklet readiness/failure/sync tests for live and offline paths.
- Accent/slide transition fixtures, click tests, and unchanged MIDI/SMF output for sound-only edits.

## 6. Chords

### Released contract

- Generator: key-aware progressions of 1–8 chord events with Triad, 7th, 9th, Sus 2, or Sus 4 voicings.
- Generator controls: Chords, Quality, Duration, and Strum.
- Sound engine: eight persistent dual-oscillator slots with per-slot filters, envelopes, and stereo placement plus one shared chorus contribution.
- Allocation: an available slot first; otherwise the quietest and then oldest slot, protecting supported multi-note voicings.
- Sound controls: Tone, Attack, Release, Width, Chorus, Pan, and sends.
- Released presets: Velvetframe, Slowbloom, Softpress, Drawline, Prismveil, Feltcut, Horizon, Undercanopy, Daybreak, and Cloudcurrent.

### Known limitations

- One global Quality applies to the whole progression; there is no per-step chord editing or inversion control.
- Harmony follows the project key but cannot yet express borrowed chords, secondary dominants, or explicit degree sequences.
- Eight slots can steal voices with long releases or dense ninth chords.
- Shared chorus has one character and no exposed rate/depth split.

### Improvement backlog

- **P1:** editable scale-degree progression with inversion and octave per chord, stored deterministically and consumable by Arp/Bass.
- **P1:** voicing controls for close/open/drop styles with voice-leading cost tests and MIDI export parity.
- **P1:** visualize slot pressure/stealing when long Release meets dense voicings.
- **P2:** controlled harmonic tension options (borrowed/sus/add tones) that never imply a copyrighted progression library.
- **P2:** chorus character modes behind the existing shared topology and mono-compatibility gate.
- **Deferred:** unlimited polyphony; retain a bounded voice ceiling for mobile performance.

### Required evidence for changes

- Golden pitch sets and deterministic voice-leading fixtures in every key/scale.
- Eight-slot allocation, stealing, release, panic, and mono-retention tests.
- Arp follow-context and SMF regressions whenever the chord data contract changes.

## 7. Mixer

### Released contract

- Control-only module with `silent-mixer-v2`; it generates no pattern events and creates no voice.
- Provides one UI surface over the rack's shared audio graph, regardless of how many Mixer modules appear.
- Channel controls: internal level, solo, mute, panorama, delay send, reverb send, and meters for audible modules.
- Rack controls: Delay division, Delay feedback, Delay return, Reverb return, Master character, and master meter.
- Shared graph: cross-feedback stereo delay, one procedural convolution reverb, headroom stage, soft clipper, and live meter taps.

### Known limitations

- Mixer modules are duplicate views of one rack mix, not independent submixes.
- No channel EQ, insert effects, groups, sends beyond delay/reverb, automation, or scene morphing.
- Metering is diagnostic rather than a calibrated mastering display.
- Delay and reverb character choices are fixed; bundled demos are fetched on demand and are not part of the offline shell.

### Improvement backlog

- **P0:** obtain explicit listening approval for neutral/space/character directions and the final mixed starter rack.
- **P0:** validate the shared graph and 16-module/140 BPM load on the physical Android reference device.
- **P1:** gain staging guidance, peak-hold/clip indication, and clearer pre/post-send semantics.
- **P1:** compact channel EQ or tone trim only if profiling shows the shared graph remains inside C10.
- **P1:** scene-safe mixer snapshots and deterministic interpolation, with no hidden changes to generator state.
- **P2:** additional shared effect characters or effect bypass, keeping a single bounded graph.
- **Deferred:** arbitrary plugin/insert routing, per-module convolution, or DAW-style unlimited buses.

### Required evidence for changes

- Live/mix/stem parity, channel isolation, solo/mute truth table, and tail-completion tests.
- Loudness, true peak, DC, mono, meter accuracy, and no-feedback-runaway analysis.
- Explicit A/B listening notes and physical Android render-capacity/UI-frame measurements.

## 8. Arp

### Released contract

- Generator: Up, Down, Up/down, or seeded Random traversal at 1/4–1/32 rates, spanning 1–4 octaves.
- Generator controls: Direction, Rate, Span, Gate, Follow chords, and Octave.
- Harmonic context: when enabled, follows the first Chords module; otherwise derives tones from the project key.
- Sound engine: four persistent dual-source pluck slots with deterministic available/earliest-ending/oldest allocation.
- Sound controls: Tone, Brightness, Decay, Character, Pan, and sends.
- Released presets: Threadlight, Dewpluck, Crystalstep, Softpixel, Needledrop, Copperkey, Nightbead, and Quickglass.

### Known limitations

- Follows only the first Chords module and offers no explicit context-source selector.
- Pattern has no hold, repeat, skip, ratchet, latch, or per-step octave lane.
- Four voices can steal long-decay notes at dense rates.
- Random direction is seed-stable but has no user-visible phrase-shape constraints.

### Improvement backlog

- **P1:** explicit Chords source selection by stable module ID, with graceful fallback when the source is deleted.
- **P1:** deterministic pattern modes for order, octave sequence, skip/repeat, and rhythm masks.
- **P1:** visual indication of source chord and current traversal position without coupling visibility to playback.
- **P2:** latch/hold workflow and chord capture, designed for keyboard and touch.
- **P2:** adaptive voice ceiling only after Android profiling; preserve deterministic stealing.

### Required evidence for changes

- Goldens for every direction/rate/span/source combination and source deletion/reorder cases.
- Four-slot maximum-rate allocation, gate/decay separation, panic, and shared-delay topology tests.
- Cross-device link round trips and unchanged MIDI/SMF for sound-only edits.

## 9. Euclid

### Released contract

- Generator: three independent Bjorklund rings. Each ring owns Steps (2–16), Hits (0–16, clamped to its step count), Rotation, and MIDI Note.
- MIDI channels: Together uses the module channel; Separate adds channel offsets 0–2.
- Event lanes preserve ring identity and independent lane lengths.
- Sound engine: exactly three persistent tuned-percussion chains with carrier, overtone, FM modulator, filter, envelope, and panner. Active-ring retriggers use a 2.5 ms crossfade.
- Sound controls: Tone, Decay, Spread, Pan, and sends.
- Released palettes: Orbit, Shards, Cairn, Circuit, Tide, and Skein.

### Known limitations

- Sound macros are global; ring contours are distinct but not independently editable.
- Rings emit fixed velocities and lack probability, accent, mute, or per-ring length scaling beyond Steps/Hits.
- Separate-channel mode assumes the next two MIDI channels are available.
- Rotation and note editing use steppers only; there is no circular visualization.

### Improvement backlog

- **P1:** per-ring mute, velocity/accent, and optional probability with deterministic loop behavior.
- **P1:** circular ring visualization/editor that remains keyboard accessible and readable on 375 px screens.
- **P1:** validate/warn when channel offsets would exceed MIDI channel 16.
- **P2:** per-ring sound offsets for tune/decay/tone/pan while retaining exactly three chains.
- **P2:** polymetric reset/phase options and deterministic ring-to-ring mutation.

### Required evidence for changes

- Bjorklund goldens for boundary hits/steps/rotations and independent lane lengths.
- Three-chain allocation and dense same-ring click tests; palette loudness and DC gates.
- Together/Separate MIDI channel fixtures, including channel-16 boundary behavior.

## 10. Piano roll

### Released contract

- Manual editor rather than a generative phrase source. Each of eight slots stores its own authored pattern.
- Generator/editor controls: 16/32/64-step Length and Chromatic/In key pitch mode.
- Note operations: add, move, resize, keyboard edit, delete, and project-key snapping.
- Sharing: Piano data is project-only and intentionally rejected by compact links.
- Sound engine: eight persistent electric-piano slots with carrier, 3.01-ratio FM strike, 2.005 partial, filter, envelope, panner, and one shared tremolo LFO.
- Sound controls: Tone, Bell, Decay, Tremolo, Pan, and sends.
- Released presets: Amberkey, Velvet tine, Silver bell, Tinewire, Mufflekey, Night felt, Sun tine, and Reed shimmer.

### Known limitations

- No velocity editor, quantize, copy/paste, multi-select, zoom, loop-range selection, or note preview.
- Length changes discard notes beyond the shortened boundary.
- Project-only sharing makes quick cross-device links impossible for authored phrases.
- Eight voices can steal notes in dense chords with long Decay.

### Improvement backlog

- **P0:** explicit listening approval for all Piano directions before altering the default/demo musical content.
- **P1:** velocity editing, multi-select, copy/paste, duplicate, quantize, and transpose with full Undo boundaries.
- **P1:** non-destructive length changes or an explicit confirmation when notes would be truncated.
- **P1:** accessible zoom/scroll and optional note audition that respects monitor/routing state.
- **P2:** a new compact-link representation only after a size/security design proves bounded payloads and compatibility.
- **P2:** sustain-pedal or articulation lanes, with MIDI and internal-envelope semantics specified separately.

### Required evidence for changes

- Pointer, touch, and keyboard editing tests at both mobile reference heights; focus restoration from the full-screen dialog.
- Exact project round trips for all eight slots, velocity, selection-independent state, and Undo/Redo.
- Eight-slot stealing, dense chord, tremolo sharing, panic, and sound-versus-MIDI independence tests.

## 11. CC Control

### Released contract

- External-MIDI-only module with `silent-cc-v2`; no internal voice, strip, panorama, or sends.
- Four controls, each with CC number, absolute MIDI channel, and current value.
- Loop length: 1–8 bars. Movement recording captures quantized automation points for the four value knobs.
- Recorded automation makes the module project-only; static CC modules remain compact-link shareable.
- Static values and recorded points export through the MIDI/SMF control-event path.

### Known limitations

- Only four controls and one flat automation lane per control.
- Recording captures UI movement rather than incoming hardware MIDI learn.
- No thinning/smoothing, curve shapes, point editor, overdub modes, or named CC dictionary.
- Channels are absolute per control and separate from the module's base route semantics.

### Improvement backlog

- **P1:** MIDI learn for CC number/channel with explicit permission and conflict feedback.
- **P1:** accessible automation lane editor, point deletion, thinning, and deterministic interpolation rules.
- **P1:** overdub/replace/touch/latch recording modes with clear loop-boundary behavior.
- **P2:** user labels and a standard CC-name dictionary without changing encoded numeric values.
- **P2:** bounded compact sharing for small automation sets, gated by payload-size tests.
- **Deferred:** implicit internal synth destinations; these require a separately designed modulation matrix.

### Required evidence for changes

- Exact timestamp/value/channel fixtures, loop shrink/clamp cases, MIDI denial/recovery, and SMF inspection.
- Project migration and local-only classification tests for recorded data.
- Proof that live/bounce/stems still allocate no internal audio nodes.

## 12. Mod

### Released contract

- External-MIDI-only module with `silent-mod-v2`; no internal voice, strip, panorama, sends, or internal target.
- Three independent tempo-synchronised LFOs.
- Per LFO: Enabled, CC, Channel, Shape, Rate, Depth, Fade, Center, and Unipolar/Bipolar mode.
- Shapes: sine, triangle, square, saw up, and saw down. Rates span 1/4 beat through 8 beats; loop length is 1–8 bars.
- Seeded generation produces bounded MIDI CC events and exports them through SMF.

### Known limitations

- Fixed control-rate event density and no user control over smoothing/resolution.
- No phase offset, retrigger mode, one-shot envelope, sample-and-hold, or cross-LFO relationships.
- No MIDI learn or destination naming.
- Internal modulation is deliberately absent.

### Improvement backlog

- **P1:** phase offset, transport-retrigger/free-run policy, and one-shot/fade-out modes with deterministic timelines.
- **P1:** configurable but bounded output resolution, with MIDI bandwidth warnings and event-count budgets.
- **P1:** MIDI learn and destination labels shared with CC Control.
- **P2:** sample-and-hold and seeded random shapes, explicitly stable across export and loop boundaries.
- **P2:** simple LFO relationships such as shared phase or integer ratios, without creating feedback graphs.
- **Deferred:** internal destinations until a modulation-routing phase specifies target discovery, smoothing, cycles, persistence, UI, and C10 cost.

### Required evidence for changes

- Boundary tests for every shape/rate/mode, 0–127 clamping, fade, phase, loop reset, and maximum event counts.
- Web MIDI timestamp and SMF equality across repeated seeds.
- Proof that live/bounce/stems remain audio-node-free.

## 13. Module interaction roadmap

Potential interactions must use stable IDs and explicit source selection. Deleting or duplicating a source must have a deterministic fallback and must never leave a hidden dependency.

- **Chords → Arp:** replace “first Chords module” with explicit source selection while preserving automatic fallback for migrated projects.
- **Chords → Bass:** optional scale-degree/chord-tone guidance; generator output changes, sound does not.
- **Scenes → Mixer:** capture rack mix and channel state only after interpolation and launch-boundary semantics are specified.
- **CC/Mod → internal targets:** deferred to a dedicated routing design. It must prevent cycles, bound update rates, smooth targets, distinguish project/link support, and preserve external-only defaults.
- **Piano/Drums manual data → compact links:** requires a new bounded encoding rather than silently inserting large payloads into patch schema 4.

## 14. Data and migration rules for future modules

- Never repurpose an existing parameter key, preset ID, or compact index for a different meaning.
- Adding a parameter requires a default that reproduces the previous behavior and migration tests from every supported project schema.
- Adding/reordering presets requires a patch-schema decision before release.
- Removed runtime behavior must not survive as hidden DSP. If compatibility is intentionally dropped, use an explicit schema/cache boundary and document the data loss/mapping.
- Manual/editor data belongs in project documents until a separate compact representation is proven safe and ≤400 bytes in randomized coverage.
- Bundled demo JSON is on-demand content, not part of the initial PWA shell. Demo changes require listening approval when they change audible defaults or mix balance.

## 15. Definition of done for any module improvement

An improvement is not complete until all applicable items are recorded:

- product intent and priority, with out-of-scope behavior stated;
- generator golden changes reviewed intentionally;
- project and compact-link migrations/round trips;
- Web MIDI and SMF parity or explicitly accepted output changes;
- live, mix WAV, and stem parity through the shared factory;
- finite PCM, DC, loudness, true peak, clicks, panic, disposal, and voice-ceiling evidence;
- Svelte/TypeScript, unit/property, Playwright desktop/mobile, and accessibility results;
- bundle/offline-shell budgets and no new runtime network dependency;
- quiet-host scheduler result and physical Android C10 evidence when audio/UI load changes;
- loudness-matched human listening approval for any audible DSP, preset, default, starter, or demo change;
- documentation updates here, in the relevant architecture decision, and in the active phase evidence.

## 16. Suggested next sequence

1. Close current Phase 7 acceptance: Mixer, Piano, Euclid, final mixed starter, scheduler jitter, and Android C10.
2. Run a short product-use observation period before choosing module expansion work.
3. Prefer workflow depth first: Piano editing, explicit Chords context sources, CC automation editing, and Drum per-step expression.
4. Add synthesis breadth only when listening feedback identifies a concrete missing role.
5. Design internal modulation, sample import, or additional modules as separate phases rather than incremental hidden scope.
