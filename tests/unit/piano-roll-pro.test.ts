import { describe, expect, it } from 'vitest';
import type { Pattern } from '../../src/lib/core/pattern';
import { createProject, migrateProject, projectToJson } from '../../src/lib/project/model';
import { createModule, createRackState, modulePattern, pianoEditorPattern, setManualPattern, setModuleParams } from '../../src/lib/state/rack';
import { STARTER_RACK } from '../../src/lib/share/starter';
import {
  chordAtStep,
  hiddenPianoEventCount,
  setPianoEventAccent,
  setPianoEventVelocity,
  stampChord,
  transposePatternByOctave,
  transposePatternByScaleDegree,
} from '../../src/lib/ui/piano-roll-model';
import { PIANO_MELODY_EXAMPLES, pianoMelodyPattern } from '../../src/lib/ui/piano-melodies';

const pattern: Pattern = {
  lengthSteps: 32,
  stepsPerBeat: 4,
  events: [{ startStep: 20, durationSteps: 2, pitch: 60, velocity: 72 }],
};

describe('Piano Roll pro editing', () => {
  it('normalizes velocity and gives accents an audible velocity floor', () => {
    const note = pattern.events[0]!;
    expect(setPianoEventVelocity(note, 200).velocity).toBe(127);
    expect(setPianoEventVelocity(note, -20).velocity).toBe(1);
    expect(setPianoEventAccent(note, true)).toMatchObject({ accent: true, velocity: 112 });
    expect(setPianoEventVelocity(setPianoEventAccent(note, true), 80)).toMatchObject({ accent: false, velocity: 80 });
  });

  it('transposes active notes diatonically and stamps the chord active at the edit step', () => {
    const key = { root: 0, scale: 'major' as const };
    const transposed = transposePatternByScaleDegree(pattern, 1, key);
    expect(transposed.events[0]!.pitch).toBe(62);
    expect(transposePatternByOctave(pattern, 1).events[0]!.pitch).toBe(72);
    expect(transposePatternByOctave(pattern, -1).events[0]!.pitch).toBe(48);

    const chords = [
      { startStep: 0, durationSteps: 16, pitches: [48, 52, 55] },
      { startStep: 16, durationSteps: 16, pitches: [53, 57, 60] },
    ];
    const chord = chordAtStep(chords, 20)!;
    expect(chord.pitches).toEqual([53, 57, 60]);
    expect(stampChord({ ...pattern, events: [] }, chord, 20).events.map(({ pitch }) => pitch)).toEqual([53, 57, 60]);
  });

  it('offers 20 ordered, distinct, key-aware melody examples with valid Piano events', () => {
    expect(PIANO_MELODY_EXAMPLES).toHaveLength(20);
    expect(new Set(PIANO_MELODY_EXAMPLES.map(({ id }) => id)).size).toBe(20);
    const noteCounts = PIANO_MELODY_EXAMPLES.map(({ id }) => pianoMelodyPattern(id, { root: 11, scale: 'harmonicMinor' }).events.length);
    expect(noteCounts).toEqual([...noteCounts].sort((left, right) => left - right));
    expect(pianoMelodyPattern('steady-beacon', { root: 0, scale: 'major' }).events.map(({ pitch }) => pitch))
      .not.toEqual(pianoMelodyPattern('steady-beacon', { root: 5, scale: 'dorian' }).events.map(({ pitch }) => pitch));
    for (const example of PIANO_MELODY_EXAMPLES) {
      const generated = pianoMelodyPattern(example.id, { root: 11, scale: 'harmonicMinor' });
      expect(generated.lengthSteps).toBe(example.lengthSteps);
      expect(generated.events.every((event) => event.startStep >= 0
        && event.startStep < generated.lengthSteps
        && event.durationSteps > 0
        && event.startStep + event.durationSteps <= generated.lengthSteps
        && event.pitch >= 36
        && event.pitch <= 83
        && event.velocity >= 1
        && event.velocity <= 127)).toBe(true);
    }
  });

  it('preserves shortened-loop notes in the project while excluding them from playback and export patterns', () => {
    const source = setManualPattern(createModule('piano', 42, { length: 1 }), pattern);
    expect(source.params.length).toBe(1);
    const shortened = setModuleParams(source, { ...source.params, length: 0 });
    expect(modulePattern(shortened, { root: 0, scale: 'major' }).events).toEqual([]);
    expect(hiddenPianoEventCount(pianoEditorPattern(shortened))).toBe(1);

    const baseRack = createRackState(STARTER_RACK);
    const project = createProject({ ...baseRack, modules: [shortened] });
    const restored = migrateProject(JSON.parse(projectToJson(project)) as unknown);
    const restoredPiano = restored.racks[0]!.state.modules[0]!;
    expect(pianoEditorPattern(restoredPiano).events).toEqual(pattern.events);

    const expanded = setModuleParams(restoredPiano, { ...restoredPiano.params, length: 1 });
    expect(modulePattern(expanded, { root: 0, scale: 'major' }).events).toEqual(pattern.events);
  });

  it('synchronizes the Piano loop control when loading a melody with a different native length', () => {
    const piano = createModule('piano', 42);
    const loaded = setManualPattern(piano, pianoMelodyPattern('longform-journey', { root: 0, scale: 'major' }));
    expect(loaded.params.length).toBe(2);
    expect(loaded.slots[0]!.params.length).toBe(2);
    expect(pianoEditorPattern(loaded).lengthSteps).toBe(64);
    expect(pianoEditorPattern(loaded).events).toHaveLength(28);
  });
});
