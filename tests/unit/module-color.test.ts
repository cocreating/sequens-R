import { describe, expect, it } from 'vitest';
import { MODULE_TYPES } from '../../src/lib/share/schema';
import { createProject, projectFromJson, projectToJson } from '../../src/lib/project/model';
import { MODULE_COLOR_OPTIONS, defaultModuleColor, normalizeModuleColor } from '../../src/lib/state/module-color';
import { createModule, createRackState } from '../../src/lib/state/rack';
import { STARTER_RACK } from '../../src/lib/share/starter';

describe('module colors', () => {
  it('assigns every module type a distinct identity hue', () => {
    const defaults = MODULE_TYPES.map((type) => createModule(type, 42).color);
    expect(new Set(defaults).size).toBe(MODULE_TYPES.length);
    // AD-017: these are spine hues, not plate tints. They are deliberately
    // bright — the plate behind them is what carries the darkness — so the
    // former per-channel ceiling no longer applies. What still must hold is
    // that every option is a distinct, in-gamut oklch value.
    const values = MODULE_COLOR_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(MODULE_COLOR_OPTIONS.length);
    for (const value of values) {
      const match = /^oklch\((?<lightness>\d+(?:\.\d+)?)% (?<chroma>\d+(?:\.\d+)?) (?<hue>\d+(?:\.\d+)?)\)$/u.exec(value);
      expect(match?.groups, `${value} is not an oklch triple`).toBeDefined();
      expect(Number(match!.groups!.lightness)).toBeGreaterThanOrEqual(60);
      expect(Number(match!.groups!.chroma)).toBeLessThanOrEqual(0.37);
      expect(Number(match!.groups!.hue)).toBeLessThan(360);
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
