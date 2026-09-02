# Drone module plan and evidence

Status: implemented with automated acceptance, 2026-09-02. Human preset listening and physical Android C10 evidence remain open.

## Product role

Drone is sequens-R's continuous, key-aware ambient field. It is deliberately separate from Chords: Chords articulates progressions, while Drone keeps every lane covered for the complete loop and sustains one tonic anchor without a rhythmic gap.

The module follows the shared rack contract: eight slots, deterministic seeds, four mutation depths, scheduled mutation and Revert, scenes, internal monitoring, external MIDI routing, SMF, mix/stem bounce, compact sharing, mute/solo/monitor, level, pan, sends, naming, color, collapse, duplicate, reorder, and project persistence.

## Generator contract

Generator controls are Field, Cycle, Voices, Register, Spread, Changes, and Tension.

- Field selects Rooted, Open fifths, Suspended, Cluster, Undertones, or Wandering layouts.
- Cycle selects 1, 2, 4, or 8 bars.
- Voices bounds the field to two, three, or four sustained lanes.
- Register and Spread place upper lanes across at most two additional octaves.
- Changes decides at deterministic bar boundaries whether an upper lane moves.
- Tension selects neighboring scale degrees during those moves; it does not introduce chromatic notes outside the project scale.

Lane zero is one tonic event covering the complete loop. Every upper lane begins at step zero, and adjacent events meet exactly without gaps until the loop end. Mutation levels 1–3 preserve lane zero exactly; level 4 regenerates the complete field. Sound parameters never alter generated notes, outgoing MIDI, or SMF bytes.

## Sound contract

`DroneVoice` preallocates four persistent oscillator/filter/envelope/panner lanes. Each lane combines a triangle fundamental with one sine partial. Body selects pure, warm, reed, or glass harmonic relationships; Tone sets the low-pass range; Motion controls pitch glide plus shared filter and panorama LFOs; Air blends one deterministic band-limited noise source; Shimmer raises the upper partial and filter emphasis; Width controls static and moving panorama; Attack and Release map to bounded long envelopes.

When adjacent events reach the same lane, scheduled releases are cancelled. Persistent oscillator frequencies glide to the new pitch while the envelope stays above silence. Stop, pause, panic, voice retirement, and disposal use bounded fades. The module uses the rack's shared delay and convolution reverb; it owns no private reverb or runtime asset.

The eight append-only presets are Warm Halo, Deep Current, Quiet Choir, Silver Air, Tidal Glass, Night Bloom, Frozen Light, and Open Sky.

## Data and compatibility

- `drone` is appended after Synth in `MODULE_TYPES`.
- Project schema 7 accepts schemas 0–6 and writes normalized schema-7 documents.
- Patch schema 6 appends Drone and its presets without changing prior codes; schemas 4 and 5 remain readable.
- Compact links omit device-specific MIDI routes under the existing contract.
- The dedicated field preview is presentation-only and stores no extra data.

## Automated evidence

- Generator tests cover all six fields, key membership, deterministic equality, complete per-lane coverage, the full-cycle tonic anchor, mutation identity, and a seed-42 golden.
- Sound tests cover all eight presets, factory identity, bounded pitch/filter/envelope/motion mappings, persistent-node allocation, contextual help, and sound-versus-MIDI independence.
- Browser coverage adds, edits, mutates, plays, routes, shares, restores, and axe-checks Drone at 375 × 667 with no document overflow.
- Eight four-bar browser bounces are distinct and meet −18 LUFS-I ±1 LU, ≤ −1 dBTP, and DC ≤ −60 dBFS.
- The C10 16-module/140-BPM rack now includes Drone. The physical Android run remains required before performance acceptance.
- Final repository verification: Svelte/TypeScript reports zero errors and warnings; 137 unit/property tests pass; the production PWA build passes at 124.24 KiB initial JavaScript gzip against the 200 KiB budget; all 61 Chrome tests pass.
- Fixed-reference preset renders measure −18.03 to −17.96 LUFS-I, no higher than −8.19 dBTP, and no higher than −115.81 dBFS DC.

## Out of scope

Samples, granular synthesis, private convolution, cloud presets, a second transport, arbitrary internal modulation routing, unlimited voices, and Freeze/capture semantics are intentionally excluded from v1.
