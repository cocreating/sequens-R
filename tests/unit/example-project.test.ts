import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectFromJson } from '../../src/lib/project/model';

describe('bundled example projects', () => {
  it('imports Basic Electro through the production project boundary', () => {
    const source = readFileSync(new URL('../../public/projects/basic-electro.sequens-r.json', import.meta.url), 'utf8');
    const project = projectFromJson(source);
    const modules = project.racks[0]?.state.modules;

    expect(project.name).toBe('Basic Electro');
    expect(project.schemaVersion).toBe(5);
    expect(project.racks[0]?.state.bpm).toBe(110);
    expect(modules?.map(({ type }) => type)).toEqual(['drums', 'arp']);
  });

  it('imports Basic Electro 2 through the production project boundary', () => {
    const source = readFileSync(new URL('../../public/projects/basic-electro2.sequens-r.json', import.meta.url), 'utf8');
    const project = projectFromJson(source);
    const modules = project.racks[0]?.state.modules;

    expect(project.name).toBe('Basic Electro 2');
    expect(project.schemaVersion).toBe(5);
    expect(project.racks[0]?.state.bpm).toBe(110);
    expect(modules?.map(({ type }) => type)).toEqual(['mixer', 'bass', 'drums', 'arp']);
    expect(modules?.every(({ sound }) => sound.engineVersion === 2)).toBe(true);
  });
});
