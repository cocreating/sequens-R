# Phase 7 · Sound identity and mix

Status: Phase 7.0 is accepted. Phase 7.1 and Phase 7.2 implementation/automated evidence completed on 2026-08-25; the user approved the six Drum kits that day and opened the next phase after hearing the eight Bass presets on 2026-08-26. The user subsequently opened each next phase after the Acid, Chords, and Arp references, closing those listening gates. Phase 7.7 Piano and Phase 7.8 Euclid implementation/objective evidence are complete and await listening approval; Phase 7.9 CC Control and Phase 7.10 Mod are implemented and automatically accepted as silent contracts. Mixer listening and physical Android C10 remain open; Phase 6 physical Android acceptance also remains open. The user's explicit “empezamos phase 7”, subsequent “adelante”, and instructions to continue to the next phase authorize these phase-boundary exceptions without approving or waiving any physical gate.

## 1. Outcome

The internal monitor becomes a credible musical instrument instead of a functional preview. Every sound-generating module has a recognizably different voice, curated presets, useful dynamics, and a deliberate place in the mix. Pattern generation, Web MIDI, SMF export, transport timing, and deterministic seeds remain unchanged.

The phase is successful when a user can identify Drums, Bass, Acid, Chords, Arp, Piano, and Euclid by timbre without seeing the UI; presets compare at matched loudness; a shared patch selects the same sound on another device; live monitoring and WAV bounce use the same voice implementation; and the full engine still satisfies C10 on the reference Android device.

## 2. Current baseline and reason for the phase

- `EngineModuleSnapshot` contains pattern, routing, mute/solo/monitor, and level, but no preset or sound parameters.
- Bass uses the generic `PolyVoice` with a square oscillator. Chords, Arp, Piano, and Euclid use the same triangle implementation and four-slot envelope.
- Four-note voice allocation can steal notes from supported seventh/ninth chords.
- Drums creates eight simple deterministic buffers. Kick, snare, hats, clap, tom, rim, and percussion do not yet have complete instrument-specific synthesis or choke behavior.
- Acid has the only specialized synthesis path: a saw source, accent/slide envelopes, and a four-stage TPT ladder in an AudioWorklet. Most timbral constants are fixed.
- `bass.drive` currently changes generated velocity rather than applying audio saturation. Sound-facing help and actual DSP must agree after this phase.
- A drum hit creates a new per-event `GainNode`; Phase 7 must restore the SDD invariant that reusable gain/filter/pan stages are preallocated outside scheduler callbacks. One-shot `AudioBufferSourceNode` creation remains allowed because that node is single-use by Web Audio design.
- Live and offline paths reuse voice classes but duplicate graph/voice selection. That is not strong enough to prevent future sonic divergence.
- Every audible module feeds its level bus directly into a high-ratio master compressor. There is no deliberate headroom, module panorama, shared space, DC blocking, or loudness calibration.

Phase 1 acceptance remains valid: it proved that the application produces stable audible output. Phase 7 adds a new quality bar and does not retroactively redefine the earlier functional gate.

## 3. Non-negotiable boundaries

1. **Events stay deterministic.** Sound state never changes `Pattern`, `NoteEvent`, Web MIDI output, MIDI clock, or SMF files.
2. **One clock and one context.** Keep the current AudioWorklet clock, 150 ms scheduler, time bridge, and one gesture-created `AudioContext`.
3. **No framework replacement.** Use native Web Audio and the existing AudioWorklet design. Tone.js, a plugin host, and a second transport are outside this phase.
4. **One implementation for live and bounce.** Voice/effect code accepts `BaseAudioContext`; both render paths use the same factory and preset catalog.
5. **No reactive reads in audio.** UI publishes immutable sound messages. Voices never read Svelte state or the DOM.
6. **No runtime network.** Presets and assets are local. Optional samples require documented provenance and may not be fetched from a CDN.
7. **Procedural baseline.** Every DoD passes without optional samples. Missing sample assets cannot block or silently weaken a module.
8. **No louder-is-better acceptance.** All comparisons are loudness matched before listening approval.
9. **No hidden mobile penalty.** Oversampling, convolution, polyphony, and stereo width must be measured on the Android reference device.
10. **Control modules remain controls.** CC Control and Mod stay silent and MIDI-focused; internal modulation routing is a future product decision.

## 4. Domain and migration contract

### 4.1 Persisted state

```ts
interface SoundState {
  engineVersion: 2;
  presetId: string;
  params: Record<string, number>; // integers validated by SoundParamSchema
  pan: number;                    // -100..100
  delaySend: number;              // 0..100
  reverbSend: number;             // 0..100
}

interface RackMixState {
  delayDivision: number;          // index into a fixed musical-time table
  delayFeedback: number;          // 0..90
  delayReturn: number;            // 0..100
  reverbReturn: number;           // 0..100
  masterCharacter: number;        // 0..100; bounded soft-clip amount
}
```

- `RackModule.level` stays at its current top-level location to reduce migration risk. Every module receives `sound`; silent modules use a validated silent preset and zero sends.
- `RackState.mix` owns the single rack-level effects/master configuration. Any Mixer module edits that same state; adding a second Mixer does not create a second master or second set of returns.
- Project schema advances from 3 to 4. Patch schema advances from 2 to 3.
- Project v1–v3 and patch v1–v2 migrate to `legacy-<module-type>-v1`, preserving the pre-Phase-7 monitor topology. Newly created modules use engine version 2 defaults.
- A visible, explicit “Upgrade sound” command may map legacy presets to new defaults. It participates in Undo and never runs automatically.
- Preset IDs and compact share indexes are append-only. A released ID is never renamed or reused.
- Sound parameters are quantized integers and encoded positionally. The randomized 200-rack link test remains ≤ 400 bytes after sound state and rack mix are included.
- Piano/manual CC shareability rules remain unchanged. Sound settings travel in project files even when the module itself cannot travel in a link.

### 4.2 Preset catalog

Every preset record contains:

```ts
interface SoundPreset {
  id: string;
  engineVersion: 2;
  moduleType: ModuleType;
  label: string;
  params: Readonly<Record<string, number>>;
  outputTrimDb: number;
  provenance: 'procedural' | { assetId: string; license: string; source: string };
}
```

- Catalog validation rejects duplicate IDs, wrong module types, unknown/missing parameters, out-of-range values, non-finite trims, and assets without provenance.
- Presets are data, not branches inside Svelte components.
- Default preset selection derives from module type and the explicit stored preset ID. Duplication preserves the preset. Creation may choose deterministically from that type's curated defaults using the stored seed, then persists the choice.

## 5. Engine architecture

### 5.1 Contracts

```ts
interface InternalVoice {
  trigger(event: NoteEvent, time: number, duration: number): void;
  applySound(sound: SoundSnapshot, time: number): void;
  panic(time: number): void;
  dispose(time: number): void;
  readonly activeVoiceCount: number;
}

interface VoiceFactory {
  create(context: BaseAudioContext, module: EngineModuleSnapshot, destination: AudioNode): InternalVoice | null;
}
```

- `VoiceFactory` is the only mapping from module type/preset to a voice class.
- All reusable oscillators, envelopes, filters, gain stages, panners, waveshapers, sends, and worklets are constructed before scheduling callbacks need them.
- A preset topology change builds the replacement graph on the control thread, marks it pending, and swaps at the next note attack with an 8–20 ms equal-power crossfade. Old tails dispose after reaching silence.
- Continuous sound parameters use `cancelAndHoldAtTime()` where supported by the target path, then a 15–30 ms ramp. They are not delayed until the next bar.
- Pattern snapshots retain the existing safe musical boundary. Sound updates travel through a distinct immutable message so moving Tone or Cutoff cannot regenerate a pattern.
- The global voice ceiling remains 64. Each specialized voice documents its local pool and stealing rule; no module assumes unlimited voices.

### 5.2 Rack graph

```text
InternalVoice
  → module trim/insert
  → StereoPanner
  ├→ dry bus ───────────────────────────────┐
  ├→ delay send → shared tempo delay ───────┤
  └→ reverb send → shared stereo reverb ────┤
                                             ↓
                   headroom → DC blocker/EQ → soft clip → limiter → meter → destination
```

- One delay and one reverb return exist per rack engine, not per module.
- Delay time comes from the current BPM and a fixed division table. A tempo change ramps delay time safely or crossfades between two preallocated delay taps.
- The baseline reverb uses one shared deterministic procedural impulse or an equivalent bounded native graph. Any committed impulse asset follows the same provenance rule as samples.
- The master starts with explicit headroom. The limiter catches exceptional peaks; it is not used to make every preset loud.
- Nonlinear oversampling is opt-in per block. Start at `none`, test `2x`, and reject `4x` unless Android render-capacity evidence leaves adequate margin. The Web Audio specification notes that oversampling can reduce aliasing while adding processing latency.
- Master and per-module meters update the UI at a bounded rate and never participate in scheduling.

### 5.3 Offline export parity

- `renderRackAudio` asks the shared factory for the same graph used live.
- The offline sample rate remains explicit and every algorithm reads `context.sampleRate`; no DSP constant assumes 44.1 or 48 kHz.
- Mix WAV includes shared returns. A stem renders the selected module through its inserts, pan, and its isolated contribution to shared returns, then through the common master.
- Export duration remains the requested musical bars plus a documented, deterministic effect tail capped at two seconds. A final short fade prevents truncation clicks.
- Tests compare timing, loudness, true peak, DC, RMS envelope, and coarse spectral bands. Cross-browser PCM is not required to be byte-identical because native Web Audio implementations may differ.

## 6. Sound controls and UI

- Every audible module gets a native `Sound` disclosure below musical parameters and above `Output & advanced`.
- Preset is first. Module-specific macros follow. Pan, Delay send, and Reverb send are consistent final controls.
- Mobile and desktop use the same state and labels. Mobile keeps 44 CSS px targets and the Phase 6 one-dense-body rule.
- Controls retain native range/select/button semantics, formatted `aria-valuetext`, visible focus, keyboard operation, and contextual Help.
- Reset restores the current preset's value, not a global hard-coded default.
- Selecting a preset announces the new label through existing status messaging; continuous macro movement does not create noisy live-region output.

| Module | Sound controls in scope |
|---|---|
| Drums | Kit, Tone, Punch, Decay, Pan, Delay, Reverb |
| Bass | Preset, Wave, Cutoff, Resonance, Envelope, Drive, Glide, Sub, Pan, Delay, Reverb |
| Acid | Preset, Saw/Square, Cutoff, Resonance, Env amount, Decay, Accent, Slide, Drive, Pan, Delay, Reverb |
| Chords | Preset, Tone, Attack, Release, Width, Chorus, Pan, Delay, Reverb |
| Arp | Preset, Tone, Brightness, Decay, Character, Pan, Delay, Reverb |
| Piano | Preset, Tone, Bell, Decay, Tremolo, Pan, Delay, Reverb |
| Euclid | Palette, Tone, Decay, Spread, Pan, Delay, Reverb |
| Mixer | Module Level/Pan/Sends plus rack Delay division/feedback/return, Reverb return, Master character and meters |
| CC Control | Silent preset indicator only; no audio macros or sends |
| Mod | Silent preset indicator only; no audio macros or sends |

## 7. Measurement and listening protocol

### 7.1 Reference material

- Commit one deterministic eight-bar reference rack per audible module family plus one 16-module stress rack at 140 BPM.
- Reference phrases exercise low/high registers, minimum/maximum velocity, short/long gates, overlaps, rests, accents, slides, chord extensions, choke groups, and effect tails as applicable.
- Store expected analysis features as small JSON fixtures. Generate WAV audition files into ignored test output; do not add large binary test renders to the initial application bundle.

### 7.2 Objective gates

Per released preset on its family reference phrase:

- integrated loudness: −18 LUFS-I ±1 LU using ITU-R BS.1770-5;
- true peak: ≤ −1 dBTP using 4× reconstruction measurement;
- finite samples only; no NaN/Infinity;
- absolute DC mean below −60 dBFS after the tail settles;
- no discontinuity greater than the agreed family threshold at note/preset/mute/delete boundaries;
- expected audible duration and non-silent RMS envelope;
- no unexplained coarse-band spectral regression against its approved fixture.

The full rack must not be automatically normalized to −18 LUFS. Preset trims establish comparable source levels; user mix decisions remain intact.

### 7.3 Listening gate

Each audible module subphase follows the same sequence:

1. Render the legacy voice and three new candidate directions through the same phrase.
2. Loudness-match all files within 0.2 LU for comparison.
3. Listen on headphones, laptop speakers, and the Android reference device.
4. Record the selected direction and rejected issues in that subphase's evidence section.
5. Author the full preset count only after that direction is accepted.

Automated metrics catch defects; they cannot mark a timbre musically convincing. User listening approval is mandatory.

### 7.4 Primary technical references

- [Web Audio API 1.1](https://webaudio.github.io/web-audio-api/) for audio graphs, AudioParam automation, filters, convolution, waveshaping/oversampling, AudioWorklet, and offline rendering.
- [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en) for programme loudness and true-peak measurement.
- [EBU Tech 3343](https://tech.ebu.ch/publications/tech3343) for practical loudness-normalisation guidance.

## 8. Subphase plan

Every subphase gets its own evidence section appended to this file. Stop after its DoD and present audition files/results before proceeding.

### 7.0 · Sound contract and test bench

Deliver:

- `SoundState`, `RackMixState`, schemas, validation, preset registry, and immutable sound snapshots;
- project v4 and patch v3 migrations, including append-only legacy presets and an explicit reversible upgrade path;
- one shared `VoiceFactory` used by engine and bounce;
- reference-rack fixtures, offline analysis, loudness matching, and report generation;
- an intentionally unchanged legacy voice path proving migration behavior;
- UI shell for preset/macros/pan/sends driven from sound schemas.

DoD:

- v1–v3 projects and v1–v2 links open without data loss and select legacy voices;
- v4/v3 round trips are deeply equal and 200 randomized links stay ≤ 400 bytes;
- changing only sound state leaves generated events, MIDI mocks, and SMF bytes identical;
- live and offline factories instantiate the same voice/preset IDs;
- analysis is covered by known calibration fixtures and rejects NaN, excessive DC, peak, and loudness failures;
- existing full verification remains green.

### 7.1 · Mixer and master

Deliver:

- per-module pan and shared delay/reverb sends;
- one tempo-synced stereo delay and one shared stereo reverb;
- explicit master headroom, DC blocker, gentle corrective EQ, bounded soft clip, final limiter, peak/RMS meters;
- `RackMixState` controls in every Mixer module without duplicating DSP;
- identical live/bounce graph and documented two-second maximum export tail.

DoD:

- unity dry path nulls within tolerance when pan/sends/character are neutral;
- two Mixer modules display/control one rack graph and create no voices;
- mute/solo/delete/preset switching has no click or orphaned effect tail;
- 16 hot modules produce no digital clipping, NaN, or persistent DC;
- delay remains musical across supported BPM changes;
- A/B confirms more depth without loudness advantage or audible pumping;
- Android C10 remains green before module voices become more expensive.

### 7.2 · Drums

Deliver:

- kick with phase-accumulated pitch envelope, transient, body, and optional saturation;
- snare with tonal modes, filtered noise, transient, and controllable decay;
- metallic closed/open hats with high-pass shaping and mutual choke;
- multi-burst clap, tuned tom, rim transient, and distinct percussion voice;
- preallocated lane gain/filter buses, velocity response, deterministic micro-variation, and panic cleanup;
- six original procedural kits aligned with Four, Broken, Latin, Electro, Half-time, and Odd.

DoD:

- every lane is identifiable in isolation and in the full kit;
- open hat is choked sample-accurately by closed hat without clicks;
- identical seed/kit produces identical trigger choices and analysis features;
- no reusable gain/filter node is allocated inside a scheduled hit;
- six kits meet loudness/peak gates and receive listening approval;
- optional samples, if any, have provenance records and removing them still leaves a passing procedural kit.

### 7.3 · Bass

Deliver:

- dedicated monophonic voice with oscillator/custom wave, sub oscillator, resonant low-pass, amplitude/filter envelopes, legato glide, and real waveshaping drive;
- velocity mapped to amplitude and bounded timbral response;
- eight presets spanning clean, round, plucked, sub, driven, and animated roles without naming/copying existing products;
- sound help that describes actual DSP rather than generator velocity.

DoD:

- `drive` measurably changes harmonic content without changing MIDI velocity;
- legato/glide and retrigger rules pass overlap tests;
- low notes retain headroom and no preset creates persistent DC;
- eight presets pass objective and listening gates;
- one Bass module uses one active monophonic slot and remains inside C10.

### 7.4 · Acid

Deliver:

- antialiased saw and square sources in the existing AudioWorklet;
- live cutoff, resonance, envelope amount, decay, accent, slide time, and pre/post drive;
- corrected envelope/retrigger/overlap behavior and output DC blocking;
- 12 original presets built on the same TPT voice contract;
- benchmarked `none` versus `2x` nonlinear oversampling, with the lower-cost passing mode as default.

DoD:

- accent audibly and measurably changes amplitude/filter movement; slide is continuous across overlapping notes;
- extreme cutoff/resonance/drive combinations stay finite and bounded at every supported sample rate;
- preset/macros update without zipper noise or queue loss;
- 12 presets pass objective/listening gates;
- oversampling is rejected if the 16-module Android peak budget exceeds 0.8.

### 7.5 · Chords

Deliver:

- eight preallocated polyphonic slots with documented oldest/quietest stealing;
- custom periodic waves or a bounded dual-oscillator design, per-voice amplitude/filter envelopes, velocity response, deterministic stereo placement, and one shared chorus contribution;
- ten presets covering pad, keys, organ-like, glass, muted, and wide roles;
- generator voice-leading/inversion changes only if separately approved, because they would change MIDI and golden patterns.

DoD:

- every currently supported triad/seventh/ninth voicing renders all notes unless the explicit global ceiling is reached;
- voice stealing and panic leave no hanging oscillator gain;
- mono compatibility retains the musical material without destructive cancellation;
- ten presets pass objective/listening gates;
- generator/MIDI goldens remain byte-identical.

### 7.6 · Arp

Deliver:

- dedicated preallocated pluck voice with fast excitation, decay/filter articulation, velocity/gate response, and optional tempo-delay send;
- four local voice slots for intentional overlap;
- eight presets from soft/plucked to bright/percussive roles.

DoD:

- fast rates at 300 BPM do not drop attacks or exceed the voice ceiling;
- gate changes audible duration without changing exported pitch/velocity;
- delay uses shared return and does not create a per-Arp effect graph;
- eight presets pass objective/listening gates and are clearly distinct from Piano/Chords.

### 7.7 · Piano

Deliver:

- lightweight velocity-sensitive electric-piano voice using bounded FM/partials, amplitude decay, tone control, and tremolo;
- eight preallocated voices with deterministic stealing;
- eight presets spanning soft, bell, tine, muted, dark, and bright directions;
- optional multisample prototype only after procedural/FM acceptance and a documented asset/size benchmark.

DoD:

- velocity changes both level and brightness within bounded ranges;
- eight-note passages render without unintended loss;
- sustain tails end and panic clears every voice;
- eight presets pass objective/listening gates on phone speakers and headphones;
- optional assets cannot cause the initial-load or offline gates to fail.

### 7.8 · Euclid

Deliver:

- three independent tuned-percussion voices, one per ring;
- ring-specific pitch, decay, tone, and deterministic stereo spread applied only to internal monitoring;
- six palettes suited to the six established style families.

DoD:

- all rings remain independently audible under polymetric overlap;
- per-ring timbre/pan does not change MIDI channel offsets, note values, timing, or SMF;
- dense maximum-hit patterns remain click-free and inside C10;
- six palettes pass objective/listening gates and do not sound like a copy of the Drum kit.

### 7.9 · CC Control

Deliver:

- a formal `silent-cc-v2` preset and null voice-factory result. The `v2` suffix is retained because this release already has schema-4 projects and shared links using that append-only engine-version-2 preset ID;
- UI text explaining that it controls external sound and therefore has no internal voice;
- validation that automation, mute, solo, routing, bounce, and stems do not allocate or leak audio nodes.

DoD:

- live and offline voice counts remain unchanged when CC modules are added;
- no CC event reaches an internal voice or effect control path;
- MIDI/SMF automation behavior and Phase 6 mobile editing remain unchanged;
- no meaningless pan/send controls are exposed.

### 7.10 · Mod

Deliver:

- a formal `silent-mod-v2` preset and null voice-factory result. The `v2` suffix is retained because this release already has schema-4 projects and shared links using that append-only engine-version-2 preset ID;
- UI text explaining that its LFOs target external MIDI CC in this phase;
- validation that three maximum-rate LFOs do not allocate internal voices or modulate sound state.

DoD:

- Mod remains silent in live monitoring, bounce, and stems;
- MIDI CC timing/value fixtures remain unchanged;
- no internal sound target is added implicitly;
- no meaningless pan/send controls are exposed.

### 7.11 · Library, regression, and physical acceptance

Deliver:

- final catalog: 12 Acid presets; 40 non-Acid presets allocated as Bass 8, Chords 10, Arp 8, Piano 8, Euclid 6; six Drum kits;
- normalized trims and provenance report;
- starter rack and bundled demo updated only after explicit listening approval, using new engine-version-2 presets;
- complete migration, sharing, export, accessibility, desktop/mobile, and C10 evidence;
- documentation of selected/rejected listening directions and known limitations.

DoD:

- all RF-040–RF-049 requirements pass;
- every catalog entry is valid, versioned, level-matched to −18 LUFS-I ±1 LU, and ≤ −1 dBTP on its reference phrase;
- old projects/links select legacy voices; new project/link round trips preserve exact sound state; 200 randomized links remain ≤ 400 bytes;
- live, mix WAV, and stems share the same voice/effect factory and pass analysis tolerances;
- initial JS ≤ 200 KiB gzip and initial total load ≤ 400 KiB; installed PWA starts and renders the starter rack offline;
- at 16 active modules/140 BPM on reference Android: 0 xruns, average render capacity ≤ 0.5, peak ≤ 0.8, UI frame ≤ 8 ms, reported audio latency < 40 ms, and MIDI jitter remains ≤ 1 ms σ;
- keyboard, touch, visible focus, reduced motion, contextual Help, and axe serious/critical gates pass for every new control;
- the user explicitly accepts every audible family and the final mixed starter rack.

## 9. Out of scope

- Tone.js transport/scheduler or a wholesale audio-engine rewrite.
- Cloud sample hosting, marketplace packs, remote preset delivery, or telemetry.
- Third-party commercial samples without redistribution rights.
- User sample import and the Sampler backlog module.
- Internal destinations for CC Control or Mod.
- New generators, altered patterns, MIDI humanization, chord voice-leading, or changed SMF content.
- Physical-modelled acoustic piano, exact circuit emulation, unbounded polyphony, per-module convolution, or mandatory 4× oversampling.

## 10. Handoff checklist for a new implementation chat

1. Read the SDD, AD-010, this complete document, current Phase 6 evidence, and the current worktree status.
2. Preserve unrelated local UI changes; Phase 7 starts from a clean dedicated commit or branch boundary.
3. Begin only with Phase 7.0. Do not implement a module voice before migrations, schemas, shared factory, reference renders, and analysis gates exist.
4. Stop after every subphase DoD and provide metrics plus loudness-matched audition artifacts.
5. Do not author the full preset count until the user accepts one of the three prototype sound directions for that family.
6. Do not mark Phase 7 complete without physical Android C10 measurements and explicit listening approval.

## 11. Phase 7.0 evidence · sound contract and test bench

Implemented on 2026-08-25:

- Project schema v4 and patch schema v3 persist an engine-version-2 `SoundState` per module and one `RackMixState` per rack. Generator state remains separate.
- The append-only preset registry contains an explicit legacy and current bootstrap record for every module type. Catalog validation rejects duplicate IDs, wrong module/parameter contracts, bad quantization, non-finite trims, and incomplete asset provenance.
- Project schemas v1–v3 and patch schemas v1–v2 select `legacy-<type>-v1`; they do not silently select a new timbre. Newly created modules select current v2 bootstrap presets. The visible per-module “Upgrade sound” action records one normal rack-history entry and is reversible with Undo.
- The compact v3 tuple stores preset indexes, positional sound parameters, pan/sends, and rack mix values. The 200-rack randomized full-sound property test round-trips deeply and remains within the 400-byte compressed-patch gate.
- `RackSoundSnapshot` is deeply copied and frozen separately from `EngineSnapshot`. Sound-only UI edits publish through the sound path and leave generated patterns, scheduled/MIDI event snapshots, and SMF bytes deeply/byte identical.
- One `VoiceFactory` is now the only module/preset-to-voice mapping used by live monitoring and offline bounce. Preset topology changes replace the graph on the control thread with a 12 ms crossfade. The intentionally unchanged legacy Drum, Acid, square Bass, and triangle poly paths prove migration behavior; CC, Mod, and Mixer return no voice.
- Every module exposes a native Sound disclosure driven by sound schemas. Audible modules show preset/macros/pan/delay/reverb; CC, Mod, and Mixer show a validated silent indicator without meaningless pan or sends. Mobile migration, selection, upgrade, and Undo behavior have Playwright coverage.
- Deterministic eight-bar reference descriptors exist for Drums, Bass, Acid, Chords, Arp, Piano, and Euclid, plus the 16-module/140-BPM stress rack. Generated audition WAVs remain uncommitted test output.
- The offline analysis bench validates finite PCM, ITU-R BS.1770-5 integrated loudness with absolute/relative gating, 4× reconstructed true peak, sample peak, RMS/envelope, DC, and coarse spectral bands. It can loudness-match audition copies and emit stable JSON reports. A committed 48 kHz/1 kHz calibration fixture measures within 0.2 LU and failure fixtures reject NaN, excessive loudness, true peak, and DC.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 71 passed across 15 files;
- production PWA build and offline precache: passed;
- initial JavaScript: 85.38 KiB gzip / 200 KiB budget;
- Playwright: 40 passed, including the two Phase 7.0 mobile flows and all prior phase regressions.

Phase 7.0 is accepted automatically. It does not claim improved timbre: the current v2 bootstrap presets deliberately use the unchanged legacy DSP until their module subphases. Phase 7 overall remains open. Before specialized voices, Phase 7.1 must implement the shared mixer/master and retain C10 on the physical Android reference device; that physical evidence is not supplied by browser automation.

## 12. Phase 7.1 evidence · mixer and master

Implemented on 2026-08-25:

- `RackAudioGraph` is the single rack-level topology used by `AudioEngine` and `renderRackAudio`. Each audible module owns one strip with preset trim, smoothed level, stereo pan, squared delay/reverb sends, and a peak/RMS tap. Mixer, CC, and Mod modules allocate neither a voice nor a strip.
- One shared cross-feedback stereo delay follows the six supported beat divisions and ramps BPM/division/feedback changes over 20–30 ms. One deterministic 1.35-second procedural stereo convolution impulse is shared by the rack. Returns are linear and remain part of mix and isolated-stem bounces.
- The common master provides −6 dB input headroom, an 18 Hz DC blocker, a gentle 280 Hz corrective bell, a compensated bounded soft-character curve, a final limiter, and a fixed −1.5 dB output ceiling. Live channel/master meters update through existing bounded diagnostics polling.
- Every Mixer module displays the same per-channel level/pan/sends and the same five `RackMixState` controls; adding Mixer modules does not create another delay, reverb, master, or internal voice.
- Continuous sound macros, panorama, sends, feedback, returns, and master character use the shared accessible rotary knob. Channel level remains a fader, while wave and delay-division choices retain discrete segmented/select controls.
- Preset replacement still uses a 12 ms crossfade. Mute, solo, panic, deletion, and continuous mixer changes ramp `AudioParam` values; shared effect energy decays in the common return after a source strip is removed.
- Offline renders schedule only the requested musical bars, retain a deterministic maximum two-second effect tail, and fade the final 20 ms. The one-bar 118 BPM evidence files are 4.0339 seconds long.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 73 passed across 15 files, including musical delay mapping and neutral/bounded/finite soft-clip curves;
- production PWA build and offline precache: passed;
- initial JavaScript: 88.29 KiB gzip / 200 KiB budget;
- Playwright: 41 passed, including accessible mixer channel/master controls, live playback changes, mix WAV/stem export, and all prior regressions;
- Svelte autofixer: no issues in the three edited Svelte components; only pre-existing `bind:this` modernization suggestions remain.

Audition/analysis evidence is generated locally and intentionally ignored by Git under `test-results/phase7.1/`:

| File | Configuration | LUFS-I | True peak | DC / invalid PCM |
| --- | --- | ---: | ---: | --- |
| `01-neutral.wav` | Neutral sends/returns/character | −24.7 | −8.1 dBTP | 0.000000 / none |
| `02-space.wav` | Per-channel sends, delay return 38%, reverb return 32% | −24.7 | −8.1 dBTP | 0.000000 / none |
| `03-character.wav` | Space setup plus character 55% | −21.5 | −7.2 dBTP | 0.000001 / none |
| `03-character-matched.wav` | Character render gain-matched to neutral | −24.7 | −10.4 dBTP | 0.000001 / none |

The files have distinct SHA-256 hashes. Neutral, space, and loudness-matched character are ready for the required human A/B. Phase 7.1 is not marked accepted until that listening result and the physical 16-module/140 BPM Android C10 run are recorded. Specialized voice work and the legacy purge therefore remain gated.

User amendment recorded on 2026-08-25: once Drums, Bass, Acid, Chords, Arp, Piano, and Euclid all have approved replacements, Phase 7.11 will remove the temporary legacy DSP/preset paths and perform a one-time local project and PWA cache invalidation so startup uses only the new instruments and parameters. This supersedes the earlier permanent-legacy compatibility requirement, but deliberately does not execute the purge while current bootstrap presets still depend on legacy DSP.

## 13. Phase 7.2 evidence · procedural Drums

Implemented on 2026-08-25:

- New engine-version-2 Drum presets use `ProceduralDrumVoice`; `legacy-drums-v1` alone retains the temporary old adapter. The original first 20 preset indexes remain unchanged and the five additional kits are appended, preserving compact-link compatibility during the replacement period.
- The six original kits align with the established Four, Broken, Latin, Electro, Half-time, and Odd pattern families: Foundation, Fracture, Solar, Voltage, Weight, and Tilt.
- Eight deterministic procedural lane renderers provide kick, snare, closed hat, open hat, clap, tom, rim, and a distinct FM-like percussion voice. Kick uses a phase-accumulated pitch envelope, transient/body blend, and bounded saturation; snare combines two tuned modes with high-passed noise; hats use six inharmonic metallic oscillators and high-pass shaping; clap uses three bursts plus a tail.
- Every voice preallocates eight gain/filter/velocity/pan lane chains. A scheduled hit creates only the required one-shot `AudioBufferSourceNode`. Velocity maps monotonically through the preallocated lane gain; tone, punch, and decay affect the actual monitor DSP and use bounded parameter ramps.
- Closed hat ramps the shared open-hat lane to silence over 3 ms, stops every active open-hat source at 4 ms, then restores the lane for its next attack. Panic and disposal stop tracked sources and disconnect all reusable buses.
- Live monitoring and offline bounce select the same `procedural-drums-v2` factory implementation. Muted/non-solo modules are now also excluded correctly from offline mix and stem voices.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 78 passed across 15 files;
- all 96 generated lane buffers (six kits × eight lanes × two deterministic variants) are finite, bounded to 0.981, repeat exactly, have negligible DC, and produce distinct lane/kit signatures;
- every appended kit round-trips through patch v3 within 400 bytes without moving earlier preset indexes;
- production PWA build/offline precache and bundle gate: passed at 90.64 KiB initial JavaScript gzip / 200 KiB;
- Playwright: 42 passed. The Phase 7.2 browser test renders all six real offline WAV paths, decodes PCM16, and applies the project BS.1770/true-peak/DC analyzer.

Generated audition files are local and ignored by Git under `test-results/phase7.2/`:

| Kit / pattern family | LUFS-I | True peak |
| --- | ---: | ---: |
| Foundation / Four | −18.0 | −4.3 dBTP |
| Fracture / Broken | −18.2 | −3.5 dBTP |
| Solar / Latin | −17.9 | −2.2 dBTP |
| Voltage / Electro | −17.7 | −4.6 dBTP |
| Weight / Half-time | −17.9 | −3.3 dBTP |
| Tilt / Odd | −18.4 | −1.3 dBTP |

Every file has a distinct SHA-256 digest; all pass −18 LUFS-I ±1, ≤ −1 dBTP, finite PCM, and ≤ −60 dBFS DC gates. On 2026-08-25 the user confirmed that the six kits are audible and instructed the Phase 7 sequence to continue, closing the required Drum listening gate. Physical Android C10 remains open, as does the final legacy/cache purge.

## 14. Phase 7.3 evidence · monophonic Bass

Implemented on 2026-08-25:

- New engine-version-2 Bass presets use a dedicated `BassVoice`; `legacy-bass-v1` alone retains the temporary square-poly adapter. The first 20 preset indexes and the previously appended Drum indexes remain unchanged; seven additional Bass records are appended after them.
- One persistent monophonic slot preallocates selectable sine, square, and saw oscillators plus an octave-below sine sub oscillator. A resonant low-pass, amplitude and filter envelopes, velocity-to-level/timbre response, an 18 Hz DC blocker, and bounded parameter smoothing complete the voice.
- Gate overlap, rather than release tail, controls legato. Overlapping notes glide without retrigger; separated notes retrigger immediately. Glide ranges from 2 to 182 ms and no reusable audio node is allocated in `trigger()`.
- Sound Drive crossfades into an asymmetric fixed waveshaper and measurably adds upper harmonics. It remains separate from generator Drive, which deliberately changes note/MIDI velocity; contextual help now states that distinction.
- The eight original roles are Roundhouse, Clearline, Shortwood, Undertow, Ember, Orbit, Block, and Nightfloor, spanning round, clean, plucked, sub-heavy, driven, animated, square, and deep directions.
- Live monitoring and offline bounce select the same `procedural-bass-v2` factory implementation. Compact patch round trips remain at or below 400 bytes.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings; Svelte autofixer reports no issues in the edited control components;
- unit/property tests: 83 passed across 15 files, including harmonic-content, unchanged pattern/SMF, overlap/retrigger, bounded mapping, append-only catalog, compact-link, factory identity, and single-slot architecture checks;
- production PWA build/offline precache and bundle gate: passed at 92.86 KiB initial JavaScript gzip / 200 KiB;
- Playwright: 43 passed. The Phase 7.3 browser test renders all eight real offline WAV paths, decodes PCM16, and applies the project BS.1770/true-peak/DC analyzer.

Generated audition files are local and ignored by Git under `test-results/phase7.3/`:

| Preset | Role | LUFS-I | True peak |
| --- | --- | ---: | ---: |
| Roundhouse | Round | −17.9 | −6.9 dBTP |
| Clearline | Clean | −18.0 | −10.0 dBTP |
| Shortwood | Plucked | −18.0 | −4.7 dBTP |
| Undertow | Sub | −18.0 | −7.3 dBTP |
| Ember | Driven | −18.0 | −6.8 dBTP |
| Orbit | Animated/glide | −18.0 | −5.4 dBTP |
| Block | Square | −18.0 | −7.3 dBTP |
| Nightfloor | Deep | −18.0 | −8.8 dBTP |

Every file has a distinct SHA-256 digest; all pass −18 LUFS-I ±1, ≤ −1 dBTP, finite PCM, and ≤ −60 dBFS DC gates. On 2026-08-26 the user instructed work to continue to the next phase after receiving the local Bass references, closing the Bass listening gate. Physical Android C10 and the final legacy/cache purge remain open.

## 15. Phase 7.4 evidence · AudioWorklet Acid

Implemented on 2026-08-26:

- New engine-version-2 Acid presets select `procedural-acid-v2`; `legacy-acid-v1` retains the original fixed-saw/fixed-envelope worklet path until the final approved legacy purge. The released first 20 indexes plus appended Drum and Bass records remain fixed, with eleven additional Acid records appended after them.
- The monophonic processor uses antialiased PolyBLEP saw and square sources with a 12 ms continuous morph, bounded saturation before and after the existing four-stage trapezoidal-integrator/TPT ladder, a smoothed base cutoff/resonance/envelope/decay contract, and an 18 Hz DC blocker derived from the active sample rate.
- Accent depth measurably raises amplitude and filter-envelope movement. A note slides only when the preceding event requests slide and its gate overlaps the new attack; separate notes retrigger. Slide time spans 4–220 ms.
- Worklet sound changes are time-ordered and smoothed over 12 ms. Panic cancels notes without discarding later queued sound changes. A processor-ready handshake is part of the optional voice contract, so offline bounce waits for the `MessagePort` before scheduling events; a second synchronization barrier confirms that the processor has consumed every queued note before `startRendering()`. Processor failure rejects readiness/synchronization, and bounce always disposes voices and the shared graph in `finally`. This fixes nondeterministic silent Acid exports under parallel load and failure-path leaks without changing live scheduling.
- The 12 original presets are Pulsewire, Clearcut, Hollow, Razorleaf, Rubberline, Neoncoil, Nighttrace, Scorch, Liquidstep, Pinpoint, Lowcurrent, and Glasswire.
- A direct nonlinear benchmark compares `1x` and `2x`; `1x` is faster and remains the default. `2x` is not enabled before physical Android C10 can prove the ≤0.8 peak-load budget.
- Contextual help now distinguishes generator Decay, which changes generated/MIDI note length, from internal Sound Decay and explains the actual waveform, filter, envelope, accent, slide, and drive DSP.
- During full regression, the mobile move announcement was found to precede its View Transition. Status now publishes only after the transition completes, restoring deterministic DOM/order and assistive feedback.
- A post-implementation review on 2026-08-26 corrected five edge cases before listening approval: sample-rate-dependent DC cutoff, an abrupt Saw/Square switch, panic queue loss, unreleased offline graphs when processor readiness failed, and an offline message race exposed by the six-worker regression. The Acid DSP also resets to a finite state if an unexpected non-finite sample reaches its output.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings; Svelte autofixer reports no issue in the edited `App.svelte` logic (one unrelated pre-existing `bind:this` modernization suggestion remains);
- unit/property tests: 89 passed across 15 files, including PolyBLEP correction, five supported sample rates from 8–192 kHz, finite/bounded/DC behavior at extreme macros, accent/slide/retrigger rules, `1x`/`2x` cost, queue smoothing/readiness, append-only catalog, compact links, and factory identity;
- production PWA build/offline precache and bundle gate: passed at 95.73 KiB initial JavaScript gzip / 200 KiB;
- Playwright: 44 passed. The Acid browser test uses one fixed generator seed, renders all 12 real offline WAV paths in isolated contexts, decodes PCM16, and applies the project BS.1770/true-peak/DC analyzer.

Generated audition files are local and ignored by Git under `test-results/phase7.4/`:

| Preset | LUFS-I | True peak |
| --- | ---: | ---: |
| Pulsewire | −18.0 | −3.7 dBTP |
| Clearcut | −18.0 | −5.2 dBTP |
| Hollow | −18.0 | −5.8 dBTP |
| Razorleaf | −18.0 | −8.0 dBTP |
| Rubberline | −18.0 | −6.5 dBTP |
| Neoncoil | −18.0 | −7.4 dBTP |
| Nighttrace | −18.0 | −6.8 dBTP |
| Scorch | −18.0 | −5.8 dBTP |
| Liquidstep | −18.0 | −8.0 dBTP |
| Pinpoint | −18.0 | −5.7 dBTP |
| Lowcurrent | −17.9 | −4.2 dBTP |
| Glasswire | −18.0 | −7.7 dBTP |

All files have distinct SHA-256 digests and pass −18 LUFS-I ±1, ≤ −1 dBTP, finite PCM, and ≤ −60 dBFS DC gates. On 2026-08-26 the user requested the next phase after reviewing these references, closing the Acid listening gate. Physical Android C10 and the final legacy/cache purge remain open.

## 16. Phase 7.5 evidence · eight-slot Chords

Implemented on 2026-08-26:

- New engine-version-2 Chords presets select `procedural-chords-v2`; `legacy-chords-v1` remains isolated on the original four-slot triangle voice until the final approved legacy purge. The existing `chords-core-v2` compact index remains fixed and nine presets are appended after the Acid bank.
- One Chords module preallocates eight persistent slots. Every slot has a bounded triangle/saw dual oscillator, velocity-sensitive amplitude and low-pass filter envelopes, and a deterministic stereo position. Trigger scheduling creates no audio nodes.
- Allocation first uses an available slot; at the global ceiling it steals the quietest voice and resolves ties by oldest attack. Newly assigned attacks are protected from appearing artificially quiet, so current triads, sevenths, and ninths retain all their notes while older release tails yield first.
- Tone controls oscillator blend and filter range; Attack and Release affect only the internal envelope; Width scales deterministic slot panorama; Chorus feeds all voices into one shared dual-delay/LFO contribution. The dry path remains present at every setting for mono compatibility.
- The ten original presets are Velvetframe, Slowbloom, Softpress, Drawline, Prismveil, Feltcut, Horizon, Undercanopy, Daybreak, and Cloudcurrent, covering core/pad, keys, organ-like, glass, muted, wide, dark, bright, and drifting roles.
- Generator algorithms, pattern goldens, outgoing MIDI note timing/velocity, and SMF bytes remain unchanged. Live monitoring and offline bounce select the same factory implementation.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 93 passed across 15 files, including append-only catalog/share round trips, bounded parameter mappings, velocity response, eight-slot allocation, five-note overlap protection, zero trigger-time node construction, contextual help, and byte-identical generator/MIDI behavior;
- production PWA build/offline precache and bundle gate: passed at 97.77 KiB initial JavaScript gzip / 200 KiB;
- Playwright: 45 passed. The Chords browser test renders all ten real WAV paths, cycles through triad/seventh/ninth/suspended voicings, verifies distinct SHA-256 digests, and applies loudness, true-peak, DC, and mono-retention gates.

Generated audition files are local and ignored by Git under `test-results/phase7.5/`:

| Preset | LUFS-I | True peak |
| --- | ---: | ---: |
| Velvetframe | −18.0 | −9.9 dBTP |
| Slowbloom | −18.0 | −9.7 dBTP |
| Softpress | −18.0 | −8.3 dBTP |
| Drawline | −18.0 | −9.8 dBTP |
| Prismveil | −18.0 | −9.6 dBTP |
| Feltcut | −18.0 | −9.9 dBTP |
| Horizon | −18.0 | −10.2 dBTP |
| Undercanopy | −18.0 | −9.2 dBTP |
| Daybreak | −18.0 | −9.6 dBTP |
| Cloudcurrent | −18.0 | −9.4 dBTP |

All files have distinct SHA-256 digests and pass −18 LUFS-I ±1, ≤ −1 dBTP, finite PCM, ≤ −60 dBFS DC, and mono-retention gates. On 2026-08-26 the user requested the next phase after reviewing these references, closing the Chords listening gate. Physical Android C10 and the final legacy/cache purge remain open.

## 17. Phase 7.6 evidence · four-slot Arp

Implemented on 2026-08-26:

- New engine-version-2 Arp presets select `procedural-arp-v2`; `legacy-arp-v1` remains isolated on the original four-slot triangle voice until the final approved legacy purge. The existing `arp-core-v2` compact index remains fixed and seven presets are appended after the Chords bank.
- One Arp module preallocates four persistent triangle/square oscillator, filter, envelope, and panorama slots. Attacks are 2.2 ms; velocity controls level and filter snap; generator Gate controls audible duration while Sound Decay shapes the internal pluck tail. Trigger scheduling creates no audio nodes.
- Slot allocation uses available voices first and then the earliest-ending/oldest slot. A simulated 1/32 pattern at 300 BPM schedules every attack while active voice count remains capped at four; panic ramps every slot to zero and clears its allocation state.
- Tone controls the base low-pass range, Brightness controls the velocity-sensitive filter excursion/resonance, Decay controls the internal pluck envelope, and Character blends the persistent triangle/square sources. The voice creates no `DelayNode`; its optional Delay send uses the rack's single tempo-synchronised return.
- The eight original presets are Threadlight, Dewpluck, Crystalstep, Softpixel, Needledrop, Copperkey, Nightbead, and Quickglass, spanning soft, glassy, compact, percussive, metallic, dark, and rapid roles.
- Generator direction/rate/span/gate/follow behavior, pitch, velocity, pattern goldens, and SMF output remain unchanged by sound macros and shared sends. Short/long Gate tests preserve attack/pitch/velocity sequences while changing only note duration.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 97 passed across 15 files, including append-only catalog/share round trips, bounded mappings, velocity/gate response, four-slot 300 BPM allocation, zero trigger-time node construction, shared-delay topology, contextual help, and unchanged sound-param generator/MIDI behavior;
- production PWA build/offline precache and bundle gate: passed at 99.03 KiB initial JavaScript gzip / 200 KiB;
- Playwright: the Phase 7.6 Arp test passed and the full run completed 45 of 46 tests. The remaining existing mobile critical-path timing assertion measured 37–71 ms scheduler-message jitter under concurrent desktop load on this host, above its 20 ms gate; its earlier local baseline was 9–12 ms. This does not affect the eight Arp renders, but the gate remains explicitly open pending a quiet-host rerun and the required physical Android C10 pass.

Generated audition files are local and ignored by Git under `test-results/phase7.6/`:

| Preset | LUFS-I | True peak |
| --- | ---: | ---: |
| Threadlight | −18.0 | −4.2 dBTP |
| Dewpluck | −18.0 | −5.0 dBTP |
| Crystalstep | −18.0 | −4.4 dBTP |
| Softpixel | −18.0 | −3.5 dBTP |
| Needledrop | −18.1 | −1.1 dBTP |
| Copperkey | −18.0 | −3.1 dBTP |
| Nightbead | −18.0 | −5.0 dBTP |
| Quickglass | −18.0 | −1.9 dBTP |

All files have distinct SHA-256 digests and pass −18 LUFS-I ±1, ≤ −1 dBTP, finite PCM, and ≤ −60 dBFS DC gates. On 2026-08-26 the user requested the next phase after reviewing these references, closing the Arp listening gate. Physical Android C10 and the final legacy/cache purge remain open.

## 18. Phase 7.7 evidence · electric Piano

Implemented on 2026-08-26:

- New engine-version-2 Piano presets select `procedural-piano-v2`; `legacy-piano-v1` remains isolated on the original triangle voice until the final approved legacy purge. The published `piano-core-v2` compact index remains fixed and seven presets are appended after the Arp bank.
- One Piano module preallocates eight persistent carrier/modulator/partial, filter, envelope, and panorama slots. The bounded 3.01-ratio FM strike and second partial decay into a sine body; trigger scheduling creates no audio nodes.
- Velocity raises both amplitude and FM/filter brightness within bounded mappings. Tone controls the low-pass range, Bell controls FM depth and upper-partial level, Decay controls the finite struck-key tail, and Tremolo controls one shared amplitude LFO for all eight voices.
- Slot allocation uses available voices first and then the earliest-ending/oldest slot. Eight simultaneous strikes occupy all eight slots before deterministic stealing; panic ramps every envelope and modulation depth to zero and clears all allocation state.
- The eight original presets are Amberkey, Velvet tine, Silver bell, Tinewire, Mufflekey, Night felt, Sun tine, and Reed shimmer, spanning soft, bell, tine, muted, dark, bright, and tremolo roles. No multisample assets were added, so initial-load and offline behavior remain procedural.
- Hand-authored Piano-roll pitches, timing, velocities, local-only project semantics, and SMF bytes remain unchanged by sound macros. Every preset and the eight-note reference phrase round-trip through schema-4 project JSON.

Automated verification:

- strict Svelte/TypeScript: 0 errors and 0 warnings;
- unit/property tests: 101 passed across 15 files, including append-only catalog/project round trips, eight-note allocation, bounded velocity level/brightness, finite decay mappings, zero trigger-time node construction, shared tremolo topology, panic state, contextual help, and unchanged pattern/MIDI behavior;
- production PWA build/offline precache and bundle gate: passed at 100.41 KiB initial JavaScript gzip / 200 KiB;
- Playwright: the Phase 7.7 Piano test passed and the full run completed 46 of 47 tests. The sole remaining existing mobile critical-path timing assertion measured 50.136 ms scheduler-message jitter under concurrent desktop load on this host, above its unchanged 20 ms gate. The Piano render and all other browser tests passed; the timing gate remains open pending a quiet-host rerun and physical Android C10.

Generated audition files are local and ignored by Git under `test-results/phase7.7/`:

| Preset | LUFS-I | True peak | DC |
| --- | ---: | ---: | ---: |
| Amberkey | −18.0 | −10.0 dBTP | −127.9 dBFS |
| Velvet tine | −18.0 | −10.0 dBTP | −127.4 dBFS |
| Silver bell | −18.0 | −9.9 dBTP | −126.8 dBFS |
| Tinewire | −18.0 | −10.0 dBTP | −127.9 dBFS |
| Mufflekey | −18.0 | −8.7 dBTP | −129.9 dBFS |
| Night felt | −18.0 | −9.0 dBTP | −126.8 dBFS |
| Sun tine | −18.0 | −9.7 dBTP | −127.3 dBFS |
| Reed shimmer | −18.0 | −8.1 dBTP | −127.0 dBFS |

All files have distinct SHA-256 digests and pass −18 LUFS-I ±1, ≤ −1 dBTP, finite PCM, and ≤ −60 dBFS DC gates. Phase 7.7 awaits user listening approval and physical Android C10. Phase 7.8 was subsequently implemented and reviewed without treating that work as Piano listening approval; the final legacy/cache purge remains deferred until every audible family has an approved replacement.

## 19. Phase 7.8 evidence · three-ring Euclid percussion

Implemented on 2026-08-26:

- New engine-version-2 Euclid presets select `procedural-euclid-v2`; `legacy-euclid-v1` remains on the original triangle voice until the final approved legacy purge. The published `euclid-core-v2` index stays fixed, and five palettes are appended after the existing banks.
- One Euclid module preallocates three independent tuned-percussion chains, mapped exclusively from the existing event lanes. Each chain has persistent carrier, overtone, FM modulator, filter, envelope, and panorama nodes; triggering schedules parameters only and creates no audio nodes.
- Review on 2026-08-26 added a 2.5 ms retrigger crossfade whenever a ring is still sounding. Dense same-ring hits now reach silence before the next excitation instead of discontinuously resetting the active envelope, while every event remains scheduled and the persistent three-chain ceiling is unchanged.
- Existing ring note values select monitored pitch, while each ring owns a distinct decay contour, harmonic relationship, tone response, and deterministic spread position. These details are internal-monitor-only: the Bjorklund pattern, event timing, MIDI channel offsets, outgoing MIDI notes, and SMF bytes remain unchanged.
- The six palettes are Orbit, Shards, Cairn, Circuit, Tide, and Skein. They cover neutral, bright, earthy, electronic, low/long, and wide polymetric roles without sharing Drum-kit synthesis.

Automated verification:

- strict Svelte/TypeScript diagnostics: 0 errors and 0 warnings;
- Svelte 5 autofixer review of `SoundPanel.svelte`: no issues or suggestions;
- unit/property tests: 111 passed across 16 files, including fixed catalog indexes, six palette project/link round trips, legacy isolation, bounded three-ring pitch/decay/tone/spread mappings, zero trigger-time node construction, contextual help, silent-control contracts, and unchanged generator/MIDI/SMF output;
- production PWA build/offline precache and bundle gate: passed at 102.14 KiB initial JavaScript gzip / 200 KiB;
- targeted Playwright: all three Phase 7.8–7.10 tests passed. The full run completed 50 of 51 tests; the sole existing mobile critical-path timing assertion measured 68.389 ms scheduler-message jitter under concurrent desktop load on this host, above its unchanged 20 ms gate. All sound renders, CC/Mod flows, accessibility, persistence, and MIDI tests passed.

The mobile Playwright render test exports every palette from a dense three-ring phrase. All files are distinct:

| Palette | LUFS-I | True peak | DC |
| --- | ---: | ---: | ---: |
| Orbit | −18.0 | −1.5 dBTP | −97.1 dBFS |
| Shards | −18.0 | −1.5 dBTP | −89.6 dBFS |
| Cairn | −18.0 | −1.7 dBTP | −111.4 dBFS |
| Circuit | −18.0 | −1.6 dBTP | −97.4 dBFS |
| Tide | −18.0 | −1.7 dBTP | −110.6 dBFS |
| Skein | −18.0 | −1.7 dBTP | −110.5 dBFS |

Generated audition files are local and ignored by Git under `test-results/phase7.8/`. Phase 7.8 awaits listening approval and the shared physical Android C10 acceptance; the final legacy/cache purge remains deferred until every audible family has an approved replacement.

## 20. Phase 7.9 evidence · silent CC Control

Implemented and automatically accepted on 2026-08-26:

- `silent-cc-v2` is the explicit factory identity for CC Control. It remains the existing append-only project/share preset ID; no migration or replacement is needed. The factory returns `null` before touching an audio context or destination.
- The Sound panel now says that CC Control sends MIDI control data to external hardware and has no internal voice, panorama, or effect sends. It exposes no sound macros, panning, or sends.
- The engine creates neither a module strip nor a voice for CC Control. Offline mix and stem rendering filter all control modules before graph/voice creation, so CC events are delivered only through the MIDI scheduler path.

Automated verification:

- strict Svelte/TypeScript diagnostics: 0 errors and 0 warnings;
- unit coverage asserts the canonical default/identity, direct null factory result, excluded engine/bounce path, invalid audio-parameter rejection, and unchanged CC pattern/SMF output;
- a 375 × 812 Chrome flow verifies the external-only UI text, absence of pan/sends, recordable CC movement, and regular transport behavior.

## 21. Phase 7.10 evidence · silent Mod

Implemented and automatically accepted on 2026-08-26:

- `silent-mod-v2` is the explicit factory identity for Mod. It retains the existing append-only project/share ID and returns `null` before touching an audio context or destination.
- Mod continues to generate tempo-synchronised external MIDI CC LFO events only. The Sound panel explicitly says that it has no internal voice, panorama, or effect sends, and exposes none of those controls.
- The engine and offline bounce/stem paths remove all control modules before audio-strip or voice creation. This prevents the three LFOs from acquiring an implicit internal modulation target or allocating audio nodes.

Automated verification:

- strict Svelte/TypeScript diagnostics: 0 errors and 0 warnings;
- unit coverage asserts the canonical default/identity, direct null factory result, engine/bounce exclusion, three enabled maximum-rate LFO lanes with 768 bounded CC events, and non-empty SMF output without audio sound parameters;
- a 375 × 812 Chrome flow enables all three LFOs at their fastest rate and maximum depth, verifies the external-only UI/no sends, and completes normal Play/Stop transport.
