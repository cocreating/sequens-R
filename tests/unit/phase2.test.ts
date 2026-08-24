import { describe, expect, it } from 'vitest';
import { createProject, migrateProject, nonShareableModuleNames, projectFromJson, projectToJson } from '../../src/lib/project/model';
import { GENERATORS } from '../../src/lib/generators';
import { STARTER_RACK } from '../../src/lib/share/starter';
import { RackHistory } from '../../src/lib/state/history';
import {
  createModule,
  createRackState,
  modulePattern,
  mutateModule,
  revertModule,
  setModuleSeed,
  setModuleSlot,
} from '../../src/lib/state/rack';

const key = Object.freeze({ root: 0, scale: 'minor' as const });

describe('pattern slots and mutation', () => {
  it('keeps eight independent slots and editable active seeds', () => {
    const module = createModule('bass', 42);
    expect(module.slots).toHaveLength(8);
    const second = setModuleSlot(module, 1);
    const changed = setModuleSeed(second, 123456);
    expect(changed.activeSlot).toBe(1);
    expect(changed.seed).toBe(123456);
    expect(changed.slots[0]!.seed).toBe(42);
    expect(changed.slots[1]!.seed).toBe(123456);
  });

  it('revert restores the pre-mutation pattern by deep equality', () => {
    const original = createModule('acid', 0x12345678);
    const originalPattern = modulePattern(original, key);
    const mutated = mutateModule(original);
    expect(modulePattern(mutated, key)).toEqual(GENERATORS.acid.mutate(
      originalPattern,
      original.seed,
      original.mutation.intensity,
      original.params,
      { key, bars: 1 },
    ));
    expect(modulePattern(mutated, key)).not.toEqual(originalPattern);
    expect(modulePattern(revertModule(mutated), key)).toEqual(originalPattern);
  });
});

describe('rack history', () => {
  it('coalesces continuous edits into one undo step and supports redo', () => {
    const initial = createRackState(STARTER_RACK);
    const history = new RackHistory(initial);
    history.record({ ...initial, bpm: 121 }, 'tempo');
    history.record({ ...initial, bpm: 122 }, 'tempo');
    history.record({ ...initial, bpm: 123 }, 'tempo');
    history.endCoalescing();
    expect(history.undo()?.bpm).toBe(initial.bpm);
    expect(history.redo()?.bpm).toBe(123);
  });

  it('retains at least fifty independent undo steps', () => {
    const initial = createRackState(STARTER_RACK);
    const history = new RackHistory(initial);
    for (let index = 0; index < 60; index += 1) history.record({ ...history.current, bpm: 120 + index / 10 });
    let undoCount = 0;
    while (history.undo() !== null) undoCount += 1;
    expect(undoCount).toBe(60);
  });
});

describe('project documents', () => {
  it('exports and imports an identical versioned project', () => {
    const project = createProject(createRackState(STARTER_RACK), 'Round trip');
    expect(projectFromJson(projectToJson(project))).toEqual(project);
  });

  it('migrates the legacy single-rack schema', () => {
    const migrated = migrateProject({ schemaVersion: 0, name: 'Legacy', rack: STARTER_RACK });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe('Legacy');
    expect(migrated.racks[0]?.state.modules).toHaveLength(3);
    expect(migrated.racks[0]?.state.modules[0]?.slots).toHaveLength(8);
  });

  it('lists exactly the modules that cannot be shared by link', () => {
    const rack = createRackState(STARTER_RACK);
    rack.modules[1]!.shareable = false;
    expect(nonShareableModuleNames(rack)).toEqual(['Bass']);
  });
});
