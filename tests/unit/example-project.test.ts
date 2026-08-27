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

  it('imports the ten genre demos with editable patterns, scenes, and released sounds', () => {
    const expectedFiles = [
      'detroit-minimal-techno.sequens-r.json',
      'deep-tech-house.sequens-r.json',
      'euphoric-trance.sequens-r.json',
      'neon-synthwave.sequens-r.json',
      'halftime-dubstep-trap.sequens-r.json',
      'ambient-idm-polymeter.sequens-r.json',
      'electro-funk-machine.sequens-r.json',
      'hardstyle-overdrive.sequens-r.json',
      'jungle-drum-and-bass.sequens-r.json',
      'nu-disco-night-drive.sequens-r.json',
    ];
    const index = JSON.parse(readFileSync(new URL('../../public/projects/index.json', import.meta.url), 'utf8')) as {
      projects: { file: string }[];
    };

    expect(index.projects.slice(0, 10).map(({ file }) => file)).toEqual(expectedFiles);
    for (const file of expectedFiles) {
      const source = readFileSync(new URL(`../../public/projects/${file}`, import.meta.url), 'utf8');
      const project = projectFromJson(source);
      const rack = project.racks[0]!.state;
      const piano = rack.modules.find(({ type }) => type === 'piano');
      const moduleIds = new Set(rack.modules.map(({ id }) => id));

      expect(project.schemaVersion).toBe(5);
      expect(project.scenes.map(({ name }) => name)).toEqual(['Intro', 'Main', 'Variation', 'Peak']);
      expect(rack.modules.length).toBeLessThanOrEqual(3);
      expect(rack.modules.every(({ slots }) => slots.length === 8)).toBe(true);
      expect(rack.modules.every(({ sound }) => sound.engineVersion === 2)).toBe(true);
      expect(rack.modules.some(({ type }) => type === 'mixer')).toBe(false);
      expect(piano?.slots.every(({ handEdited, pattern }) => handEdited && pattern !== null)).toBe(true);
      expect(project.scenes.every(({ assignments }) => Object.keys(assignments).every((id) => moduleIds.has(id)))).toBe(true);
    }
  });
});
