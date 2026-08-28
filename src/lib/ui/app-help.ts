export interface AppHelpInfo {
  title: string;
  body: string;
}

const APP_HELP: Readonly<Record<string, AppHelpInfo>> = {
  overview: {
    title: 'General Help',
    body: 'Hover a panel or control, or move to it with the keyboard, to learn what it does. Press Escape or the Help button to close this guide.',
  },
  'project-actions': {
    title: 'Project actions',
    body: 'Name, save, import, export, load a bundled demo, undo, or redo the complete local project. A project can contain multiple racks and scenes.',
  },
  'project-name': {
    title: 'Project name',
    body: 'Names the complete project and provides the base name for exported project and music files.',
  },
  undo: {
    title: 'Undo',
    body: 'Restores the previous rack edit. Continuous control movement is grouped into one undo step.',
  },
  redo: {
    title: 'Redo',
    body: 'Reapplies the most recently undone rack edit.',
  },
  save: {
    title: 'Save project',
    body: 'Commits the current project to local browser storage. A shared-link draft becomes a normal local project after saving.',
  },
  'export-project': {
    title: 'Export project',
    body: 'Saves the complete editable project as a sequens-R JSON file, including racks, scenes, piano notes, and recorded CC movement.',
  },
  'import-project': {
    title: 'Import project',
    body: 'Loads a sequens-R project JSON file and saves the validated result locally.',
  },
  'demo-projects': {
    title: 'Demos projects',
    body: 'Lists bundled examples in contemporary genre groups. Selecting one validates it through the normal import path and saves it as the current local project.',
  },
  'rack-switcher': {
    title: 'Studio lanes',
    body: 'Creates and switches between racks inside this project. Only the active rack is published to the shared transport and audio engine.',
  },
  'new-rack': {
    title: 'New rack',
    body: 'Adds a fresh rack with one Drums module and makes it active.',
  },
  'duplicate-rack': {
    title: 'Duplicate rack',
    body: 'Copies the active rack, including its modules, patterns, routing, and automation.',
  },
  'delete-rack': {
    title: 'Delete rack',
    body: 'Removes the active rack and switches to a neighboring rack. At least one rack must remain.',
  },
  'rack-tabs': {
    title: 'Rack tabs',
    body: 'Selects the active rack. Use Left/Right arrows, Home, or End while a tab is focused.',
  },
  'rack-name': {
    title: 'Active rack name',
    body: 'Renames the selected rack without changing the overall project name.',
  },
  transport: {
    title: 'Transport and musical context',
    body: 'Plays, pauses, or stops every active module and defines the shared tempo, root note, and scale used for generation.',
  },
  play: {
    title: 'Play',
    body: 'Starts the audio scheduler, internal monitoring, routed MIDI, and enabled MIDI clock outputs.',
  },
  'tap-tempo': {
    title: 'Tap tempo',
    body: 'Tap at least twice in time to set the shared tempo. Recent taps are averaged and the result is rounded to a whole BPM.',
  },
  workspace: {
    title: 'Workspace',
    body: 'Opens the floating studio panel for project, rack, scene, hardware, export, and diagnostic utilities.',
  },
  mixer: {
    title: 'Mixer',
    body: 'Opens the full-width rack mixer for channel levels, solo, mute, panorama, effects sends, rack returns, and master character.',
  },
  pause: {
    title: 'Pause',
    body: 'Pauses playback at the current beat and clears active internal and external notes. Press Play to continue from the same position.',
  },
  stop: {
    title: 'Stop / panic',
    body: 'Stops playback and clears internal and external notes. Press Stop twice quickly for an explicit panic cleanup.',
  },
  tempo: {
    title: 'Tempo',
    body: 'Opens a floating panel for setting the shared transport speed from 20 to 300 whole beats per minute with a number field or vertical slider.',
  },
  key: {
    title: 'Root and scale',
    body: 'Opens one floating panel for changing both the tonal center and pitch collection used by melodic generation and in-key piano editing.',
  },
  scenes: {
    title: 'Scenes',
    body: 'Snapshots the active pattern slot of every module so coordinated variations can be launched together.',
  },
  'capture-scene': {
    title: 'Capture scene',
    body: 'Stores the active slot assignment of every current module as a new scene.',
  },
  'scene-name': {
    title: 'Scene name',
    body: 'Renames a captured scene for quick identification during performance.',
  },
  'launch-scene': {
    title: 'Launch scene',
    body: 'Recalls the scene’s pattern slots immediately when stopped or together on the next bar while playing.',
  },
  'delete-scene': {
    title: 'Delete scene',
    body: 'Removes this scene without deleting or changing any modules.',
  },
  hardware: {
    title: 'Hardware MIDI',
    body: 'Connects optional Web MIDI devices and controls which outputs receive the shared 24 PPQ MIDI clock.',
  },
  'connect-hardware': {
    title: 'Connect hardware',
    body: 'Requests MIDI access from the browser, then discovers or refreshes available outputs. Internal sound works without permission.',
  },
  'midi-clock': {
    title: 'Send clock',
    body: 'Sends MIDI Start, Stop, and 24-pulse-per-quarter-note clock messages to this output.',
  },
  'desktop-output': {
    title: 'Output and shortcuts',
    body: 'Selects the internal audio destination and lists desktop keyboard commands.',
  },
  'audio-output': {
    title: 'Internal audio output',
    body: 'Routes sequens-R’s internal sound to a selected system audio device when the browser supports output selection.',
  },
  'refresh-outputs': {
    title: 'Refresh audio outputs',
    body: 'Re-enumerates available system audio destinations.',
  },
  shortcuts: {
    title: 'Keyboard shortcuts',
    body: 'Shows desktop commands for transport, randomization, undo/redo, save, and rack navigation.',
  },
  'music-export': {
    title: 'Music export',
    body: 'Renders the active deterministic rack as MIDI, a stereo WAV mix, or separate WAV stems without requiring hardware.',
  },
  'export-length': {
    title: 'Export length',
    body: 'Sets the rendered duration to 1, 2, 4, or 8 bars for all music export actions.',
  },
  'rack-midi': {
    title: 'Rack MIDI',
    body: 'Exports a Standard MIDI File with a conductor track and one track per sound or control module.',
  },
  'mix-wav': {
    title: 'Mix WAV',
    body: 'Renders monitored sound modules through the internal voices into one stereo PCM WAV file.',
  },
  'wav-stems': {
    title: 'WAV stems',
    body: 'Renders each monitored sound module separately and packages the WAV files into one ZIP archive.',
  },
  'rack-actions': {
    title: 'Rack actions',
    body: 'Generates a new rack variation, creates a share link, or adds another module to the active rack.',
  },
  random: {
    title: 'Random',
    body: 'Assigns new deterministic seeds across the rack to create a reproducible variation.',
  },
  share: {
    title: 'Share',
    body: 'Copies a compact patch link when every module is shareable. Hand-edited piano notes and recorded CC movement require project export.',
  },
  'add-module': {
    title: 'Add module',
    body: 'Opens the visual module library. Choose a named generator, editor, mixer, or MIDI control module to append it to the active rack. A rack can contain up to 16 modules.',
  },
  status: {
    title: 'Session status',
    body: 'Reports the result of the latest transport, save, export, routing, scene, or editing action.',
  },
  diagnostics: {
    title: 'Audio diagnostics',
    body: 'Reveals audio state, latency, scheduler jitter, active voices, render load, underruns, and isolation status. The Phase 7 harness prepares and records the fixed Android C10 acceptance scenario without auto-approving it.',
  },
  'module-lanes': {
    title: 'Module lanes',
    body: 'Contains every module in the active rack. Modules can be reordered by their drag handles and edited independently.',
  },
  'module-panel': {
    title: 'Module panel',
    body: 'Generates or controls one musical layer. Use the module’s own Help toggle for detailed guidance about each switch, editor, and parameter.',
  },
};

export function appHelpFor(key: string): AppHelpInfo {
  return APP_HELP[key] ?? APP_HELP.overview!;
}
