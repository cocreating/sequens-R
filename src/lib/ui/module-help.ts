import type { ModuleType, ParamDefinition } from '../core/pattern';

export interface ModuleHelpInfo {
  title: string;
  body: string;
}

const CONTROL_HELP: Readonly<Record<string, ModuleHelpInfo>> = {
  module: {
    title: 'Module panel',
    body: 'This panel generates or controls one musical layer. Hover a control to learn what it changes; the controls remain usable while Help is on.',
  },
  'help-toggle': {
    title: 'Contextual help',
    body: 'Keeps help active for this module. Hover a control or move to it with the keyboard to see its explanation here.',
  },
  reorder: {
    title: 'Reorder module',
    body: 'Drag this handle to move the module earlier or later in the rack. Reordering changes the studio layout, not the generated notes.',
  },
  'module-name': {
    title: 'Module name',
    body: 'Rename this module for easier routing, scene recall, mixer control, and exported file identification.',
  },
  'module-width': {
    title: 'Full-width module',
    body: 'Makes this module span every desktop studio lane in its own row. Toggle it again to restore the regular multi-column layout.',
  },
  monitor: {
    title: 'Monitor',
    body: 'Turns this module’s internal sound on or off. MIDI can still be routed to external hardware independently.',
  },
  solo: {
    title: 'Solo',
    body: 'Auditions this module by silencing other non-soloed sound modules. More than one module can be soloed.',
  },
  mute: {
    title: 'Mute',
    body: 'Stops this module from producing scheduled notes or control events until it is unmuted.',
  },
  duplicate: {
    title: 'Duplicate',
    body: 'Creates a copy directly after this module, including its generator settings, routing, pattern slots, and automation.',
  },
  collapse: {
    title: 'Collapse / expand',
    body: 'Hides or reveals the module editor without changing playback, routing, or saved settings.',
  },
  delete: {
    title: 'Delete module',
    body: 'Removes this module from the current rack. At least one module must remain, and the action can be undone.',
  },
  'midi-output': {
    title: 'MIDI output',
    body: 'Routes this module to a connected MIDI destination. Choose None to keep it local; selecting hardware turns internal monitoring off to avoid doubling.',
  },
  'midi-channel': {
    title: 'MIDI channel',
    body: 'Sets the base MIDI channel used by this module. Multi-channel generators may add channel offsets to this value.',
  },
  'export-midi': {
    title: 'Export module MIDI',
    body: 'Saves only this module’s deterministic note and control events as a Standard MIDI File for the selected export length.',
  },
  'pattern-slots': {
    title: 'Pattern slots',
    body: 'Stores eight deterministic variations inside the module. Selecting a slot recalls its seed and pattern state.',
  },
  seed: {
    title: 'Seed',
    body: 'The number that makes generation repeatable. The same seed and settings always reproduce the same pattern.',
  },
  'copy-seed': {
    title: 'Copy seed',
    body: 'Copies the current seed to the clipboard so this exact variation can be recorded or shared.',
  },
  'mutation-intensity': {
    title: 'Mutation level',
    body: 'Controls how far Mutate moves from the current pattern. Level 1 is subtle; Level 4 makes the broadest change.',
  },
  mutate: {
    title: 'Mutate',
    body: 'Creates a deterministic variation of the current pattern using the selected mutation level.',
  },
  revert: {
    title: 'Revert mutation',
    body: 'Restores the pattern from immediately before the most recent mutation.',
  },
  'auto-mutate': {
    title: 'Automatic mutation',
    body: 'Applies a new deterministic mutation at the chosen loop interval while the transport runs.',
  },
  'mutation-frequency': {
    title: 'Mutation interval',
    body: 'Sets how many completed loops pass before automatic mutation is applied.',
  },
  'step-grid': {
    title: 'Pattern steps',
    body: 'Shows generated events across time. In a Drums module, click a step to toggle it; other generators display their resulting pattern here.',
  },
  'piano-roll': {
    title: 'Piano roll',
    body: 'Click empty space to add a note. Drag a note to move it, drag its right edge to resize it, or use arrow keys and Delete while focused.',
  },
  'add-note': {
    title: 'Add note',
    body: 'Adds a note at the first available step, using the current pitch mode and project key.',
  },
  'record-movement': {
    title: 'Record movement',
    body: 'Captures changes to the four CC value controls into the module loop while recording is active.',
  },
  'clear-automation': {
    title: 'Clear automation',
    body: 'Removes every recorded CC movement point from this module. The static control values remain unchanged.',
  },
  'automation-count': {
    title: 'Recorded automation',
    body: 'Shows how many CC movement points are stored in this module’s loop.',
  },
  mixer: {
    title: 'Module mixer',
    body: 'Controls the internal sound level, solo state, and mute state of every sound module in this rack.',
  },
  'mixer-solo': {
    title: 'Mixer solo',
    body: 'Auditions this channel while silencing other non-soloed sound modules.',
  },
  'mixer-mute': {
    title: 'Mixer mute',
    body: 'Silences this channel without changing its generator or saved level.',
  },
  'mixer-level': {
    title: 'Mixer level',
    body: 'Sets this module’s internal audio level. It does not scale outgoing MIDI velocity or CC values.',
  },
};

const PARAMETER_HELP: Readonly<Record<string, string>> = {
  'drums.steps': 'Sets the pattern length to 16 or 32 sixteenth-note steps.',
  'drums.groove': 'Chooses the rhythmic style used to distribute hits across the drum lanes.',
  'drums.swing': 'Delays alternating sixteenth notes to add shuffle while preserving the loop length.',
  'drums.humanize': 'Adds deterministic timing and velocity variation so repeated hits feel less rigid.',
  'bass.style': 'Chooses the melodic and rhythmic strategy used to generate the bass line.',
  'bass.steps': 'Sets the bass pattern length in sixteenth-note steps.',
  'bass.range': 'Sets how many octaves the generated bass line may travel.',
  'bass.density': 'Controls how many available steps receive bass notes.',
  'bass.drive': 'Raises generated Bass note velocity for a more forceful sequence. This changes outgoing MIDI velocity; use Sound Drive for audio saturation.',
  'bass.octave': 'Sets the register around which bass pitches are generated.',
  'bass.gate': 'Sets note length as a percentage of each occupied step.',
  'acid.fill': 'Controls how densely the acid line fills the available steps.',
  'acid.steps': 'Sets the acid pattern length in sixteenth-note steps.',
  'acid.range': 'Sets the available pitch span in octaves.',
  'acid.decay': 'Sets the decay time of the internal acid voice; outgoing MIDI notes are unchanged.',
  'chords.length': 'Sets how many chord events are generated in the progression.',
  'chords.quality': 'Chooses the chord voicing family: triad, seventh, ninth, suspended second, or suspended fourth.',
  'chords.duration': 'Sets the duration of each generated chord in sixteenth-note steps.',
  'chords.strum': 'Offsets notes inside each chord for a deterministic strummed attack.',
  'arp.direction': 'Chooses how chord tones are traversed: upward, downward, alternating, or random.',
  'arp.rate': 'Sets the note division used by the arpeggiator.',
  'arp.span': 'Sets how many octaves the arpeggio can cover.',
  'arp.gate': 'Sets each arpeggiated note’s length as a percentage of its step.',
  'arp.followChords': 'When on, the arpeggiator follows the first Chords module in this rack; when off, it uses the project key.',
  'arp.octave': 'Sets the base register for arpeggiated notes.',
  'euclid.separateChannels': 'Together uses the module channel for all rings. Separate sends rings 2 and 3 on the next two MIDI channels.',
  'piano.length': 'Sets the editable piano-roll loop to 16, 32, or 64 steps.',
  'piano.inKey': 'Chromatic allows all semitones. In key snaps added and moved notes to the current project scale.',
  'cc.bars': 'Sets the length of the recorded CC automation loop in bars.',
  'mod.bars': 'Sets the length before all three tempo-synchronised LFOs repeat.',
};

const SOUND_HELP: Readonly<Record<string, ModuleHelpInfo>> = {
  'bass.wave': {
    title: 'Sound waveform',
    body: 'Selects the preallocated sine, square, or saw oscillator without changing the notes generated by the Bass module.',
  },
  'bass.cutoff': {
    title: 'Filter cutoff',
    body: 'Sets the base frequency of the internal resonant low-pass filter. Note velocity and the filter envelope can open it further.',
  },
  'bass.resonance': {
    title: 'Filter resonance',
    body: 'Raises the low-pass filter emphasis around its cutoff frequency. The value is smoothed during playback.',
  },
  'bass.envelope': {
    title: 'Filter envelope',
    body: 'Sets how far and how long each note opens the internal low-pass filter. Higher MIDI velocity also produces a brighter attack.',
  },
  'bass.drive': {
    title: 'Audio drive',
    body: 'Crossfades the internal Bass voice into a real waveshaper, adding harmonics while leaving generated notes and outgoing MIDI velocity unchanged.',
  },
  'bass.glide': {
    title: 'Legato glide',
    body: 'Sets pitch transition time only when a new Bass note begins before the previous gate closes. Separate notes retrigger immediately.',
  },
  'bass.sub': {
    title: 'Sub oscillator',
    body: 'Sets the level of the internal sine oscillator one octave below the main Bass waveform.',
  },
  'output.pan': {
    title: 'Sound panorama',
    body: 'Places this internal voice between the left and right channels. Outgoing MIDI notes are unchanged.',
  },
  'output.delaySend': {
    title: 'Delay send',
    body: 'Sets how much of this internal voice feeds the shared tempo-synchronised delay.',
  },
  'output.reverbSend': {
    title: 'Reverb send',
    body: 'Sets how much of this internal voice feeds the shared reverb.',
  },
};

function generatedParameterHelp(type: ModuleType, key: string): string | undefined {
  if (type === 'euclid') {
    if (/^steps[1-3]$/u.test(key)) return 'Sets the number of steps in this Euclidean ring’s independent cycle.';
    if (/^hits[1-3]$/u.test(key)) return 'Sets how many hits are distributed as evenly as possible around this Euclidean ring.';
    if (/^rotation[1-3]$/u.test(key)) return 'Rotates this Euclidean rhythm around its ring without changing the hit count.';
    if (/^note[1-3]$/u.test(key)) return 'Sets the MIDI note number emitted by this Euclidean ring.';
  }
  if (type === 'cc') {
    if (/^cc[1-4]$/u.test(key)) return 'Sets the MIDI Control Change number for this control.';
    if (/^channel[1-4]$/u.test(key)) return 'Sets the absolute MIDI channel used by this control.';
    if (/^value[1-4]$/u.test(key)) return 'Sets and immediately sends this control’s MIDI value. Changes are captured when movement recording is active.';
  }
  if (type === 'mod') {
    if (/^enabled[1-3]$/u.test(key)) return 'Turns this tempo-synchronised LFO on or off.';
    if (/^cc[1-3]$/u.test(key)) return 'Sets the MIDI Control Change number modulated by this LFO.';
    if (/^channel[1-3]$/u.test(key)) return 'Sets the MIDI channel used by this LFO.';
    if (/^shape[1-3]$/u.test(key)) return 'Chooses the LFO waveform used to produce modulation values.';
    if (/^rate[1-3]$/u.test(key)) return 'Sets the LFO cycle length in tempo-synchronised beats.';
    if (/^depth[1-3]$/u.test(key)) return 'Sets how far the LFO moves away from its center value.';
    if (/^fade[1-3]$/u.test(key)) return 'Gradually raises modulation depth over this many beats after playback begins.';
    if (/^center[1-3]$/u.test(key)) return 'Sets the MIDI value around which bipolar modulation moves, or the top of a unipolar range.';
    if (/^bipolar[1-3]$/u.test(key)) return 'Bipolar moves above and below center. Unipolar moves in one direction from its baseline.';
  }
  return undefined;
}

export function moduleHelpFor(key: string, type: ModuleType, moduleName: string, definition?: ParamDefinition): ModuleHelpInfo {
  if (key === 'module') return { title: moduleName, body: CONTROL_HELP.module!.body };
  if (key.startsWith('sound:')) {
    const soundKey = key.slice('sound:'.length).replace(':', '.');
    return SOUND_HELP[soundKey] ?? {
      title: 'Sound parameter',
      body: 'Changes the internal voice without changing the deterministic pattern or outgoing MIDI events.',
    };
  }
  if (key.startsWith('param:')) {
    const parameterKey = key.slice('param:'.length);
    return {
      title: definition?.label ?? 'Module parameter',
      body: PARAMETER_HELP[`${type}.${parameterKey}`]
        ?? generatedParameterHelp(type, parameterKey)
        ?? 'Changes this generator parameter. The value is saved with the rack and immediately updates the deterministic pattern.',
    };
  }
  return CONTROL_HELP[key] ?? CONTROL_HELP.module!;
}
