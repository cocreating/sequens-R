import { describe, expect, it } from 'vitest';
import { MODULE_TYPES } from '../../src/lib/share/schema';
import { createProject, projectFromJson, projectToJson } from '../../src/lib/project/model';
import { MODULE_COLOR_OPTIONS, defaultModuleColor, normalizeModuleColor } from '../../src/lib/state/module-color';
import { createModule, createRackState } from '../../src/lib/state/rack';
import { STARTER_RACK } from '../../src/lib/share/starter';

describe('module colors', () => {
  it('assigns every module type a distinct dark palette default', () => {
    const defaults = MODULE_TYPES.map((type) => createModule(type, 42).color);
    expect(new Set(defaults).size).toBe(MODULE_TYPES.length);
    for (const option of MODULE_COLOR_OPTIONS) {
      const channels = option.value.slice(1).match(/.{2}/gu)?.map((channel) => Number.parseInt(channel, 16)) ?? [];
      expect(Math.max(...channels)).toBeLessThan(80);
    }
  });

  it('persists a customized color and defaults older projects by module type', () => {
    const rack = createRackState(STARTER_RACK);
    rack.modules[0] = { ...rack.modules[0]!, color: 'teal' };
    const source = JSON.parse(projectToJson(createProject(rack))) as { racks: Array<{ state: { modules: Array<Record<string, unknown>> } }> };
    expect(projectFromJson(JSON.stringify(source)).racks[0]?.state.modules[0]?.color).toBe('teal');

    delete source.racks[0]!.state.modules[0]!.color;
    expect(projectFromJson(JSON.stringify(source)).racks[0]?.state.modules[0]?.color).toBe(defaultModuleColor(rack.modules[0]!.type));
    expect(() => normalizeModuleColor('neon', 'drums')).toThrow(/invalid drums module color/iu);
  });
});
