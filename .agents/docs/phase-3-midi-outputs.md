# Phase 3 · MIDI and outputs

Status: implementation complete on 2026-08-24. Automated acceptance is green. The phase gate still requires the two explicitly physical checks listed under **Manual acceptance remaining**.

## Implemented

- A typed, injectable Web MIDI facade with browser and test environments.
- Capability detection requires both AudioWorklet and Web MIDI, matching the documented Chromium support policy.
- Permission state is inspected through the Permissions API without requesting MIDI access. `requestMIDIAccess({ sysex: false, software: false })` runs only from **Connect hardware**.
- Permission denial shows a site-settings recovery path while internal playback and file exports remain usable.
- MIDI outputs are enumerated, opened, and refreshed on `statechange`; newly attached outputs appear without a page reload.
- Every module persists its own output port ID and MIDI channel. Drums default to channel 10; other modules default to channel 1.
- Assigning external hardware disables the module monitor by default. The existing monitor button remains the explicit override in both directions.
- Scheduler events no longer depend on monitor state: monitor controls internal audio only, while mute and solo govern both audio and MIDI.
- The audio-to-performance clock bridge uses `AudioContext.getOutputTimestamp()` and resynchronizes once per second.
- Note-on and note-off messages carry absolute Web MIDI timestamps. Stop sends MIDI Stop plus All Notes Off and All Sound Off on all 16 channels.
- Muting, deleting, rerouting, or solo-isolating a live module sends channel-specific All Notes Off and All Sound Off immediately and again beyond the 150 ms look-ahead window, preventing already-queued note-ons from hanging.
- The live snapshot also gates every scheduled hardware event, so pre-boundary look-ahead events cannot retrigger a module after it is muted or excluded by solo.
- MIDI Clock is scheduled in the same 150 ms look-ahead window at 24 PPQ. Start, Stop, and clock can be enabled independently for each output.
- Play is idempotent while the transport is already running and cannot emit a duplicate MIDI Start message.
- Dependency-free SMF Type 1 export for the whole rack and individual modules. Files include tempo, 4/4 time signature, track names, PPQ 480, and the selected 1/2/4/8-bar length.
- Offline WAV mix bounce uses the production drum, poly, and acid voices behind a master limiter.
- Separate WAV stems render concurrently and download as one uncompressed ZIP, avoiding large-array spread and third-party archive code.

MIDI output port IDs are intentionally absent from shared-link patches because those identifiers are local to a device. They remain in local/project JSON persistence.

## Automated verification evidence

Run all gates with `npm run verify`.

- `svelte-check`: 0 errors and 0 warnings.
- Vitest: 47 tests pass across ten files.
- MIDI unit evidence covers permission inspection without access solicitation, timestamped channel routing, note-off duration, clock/start/stop bytes, and `getOutputTimestamp()` conversion.
- Binary export unit evidence covers SMF Type 1 headers and track counts, per-module MIDI, accepted duration values, interleaved PCM16 RIFF/WAVE output, and ZIP local/central directory records.
- Real Chrome Playwright: 16 tests pass. Phase 3 browser evidence covers opt-in access, `sysex: false`, denied-permission recovery, internal playback without MIDI permission, per-module routing, automatic monitor disable, idempotent MIDI Start, post-mute event suppression, timestamped note/clock/transport messages, panic CCs, hot-plug enumeration, rack/module MIDI downloads, mix WAV, and zipped stems.
- The original no-permission critical flow remains green in real Chrome.
- Cross-origin isolation remains active in the production preview.
- Production initial JavaScript: 61.82 KiB gzip against the 200 KiB limit.
- Chrome scheduler-message jitter during the final full run: 0.612 ms σ.
- One-bar rack MIDI, mix WAV, and three-stem ZIP browser exports complete inside the Phase 3 Playwright flow.

## Manual acceptance remaining

These checks cannot be represented honestly by a mocked browser port. Ableton Live 12 Suite is installed on the development Mac, but no physical MIDI device was visible during this implementation run.

1. **Physical clock stability and MIDI jitter**
   - Connect a hardware slave to Chrome through Web MIDI.
   - Enable **Send clock** for that output and run at 140 BPM for 10 minutes.
   - Measure start-to-end clock drift; RF-053 requires less than 5 ms.
   - Capture physical or loopback MIDI event arrival times; C10 requires scheduling jitter at or below 1 ms standard deviation.
   - Record the device, Chrome version, connection type, sample count, drift, and standard deviation here.

2. **DAW import compatibility**
   - Export both the rack and one module at 4 bars.
   - Open the files in Ableton Live, Logic Pro, and Reaper.
   - Confirm the current tempo, named tracks, channels, pitches, velocities, note lengths, and four-bar placement.
   - Record application versions and results here.

The Phase 3 Definition of Done should be marked accepted only after both checks pass. BLE MIDI remains separate optional Phase 3b work and was not started.
