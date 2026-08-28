import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupDemoProjects, parseDemoProjectIndex } from '../../src/lib/project/demos';
import { projectFromJson } from '../../src/lib/project/model';

describe('legacy project fixtures', () => {
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

describe('bundled Piano showcase projects', () => {
  it('imports all fifteen minimal demos with expressive Piano patterns, scenes, and released sounds', () => {
    const expectedFiles = [
      'moonlit-nocturne.sequens-r.json',
      'pastoral-morning.sequens-r.json',
      'water-garden.sequens-r.json',
      'winter-largo.sequens-r.json',
      'dreaming-etude.sequens-r.json',
      'glass-invention.sequens-r.json',
      'quiet-canon.sequens-r.json',
      'velvet-sarabande.sequens-r.json',
      'clockwork-minuet.sequens-r.json',
      'gentle-fugue-pulse.sequens-r.json',
      'classical-allegretto.sequens-r.json',
      'romantic-waltz-glow.sequens-r.json',
      'sweet-electro-invention.sequens-r.json',
      'ambient-pulse-canon.sequens-r.json',
      'luminous-rondo.sequens-r.json',
    ];
    const index = parseDemoProjectIndex(JSON.parse(readFileSync(new URL('../../public/projects/index.json', import.meta.url), 'utf8')));
    const groups = groupDemoProjects(index);

    expect(index.map(({ file }) => file)).toEqual(expectedFiles);
    expect(groups.map(({ genre, projects }) => [genre, projects.length])).toEqual([
      ['Neoclassical Ambient', 5],
      ['Post-Classical Minimalism', 5],
      ['Melodic Electronica', 5],
    ]);
    for (const file of expectedFiles) {
      const source = readFileSync(new URL(`../../public/projects/${file}`, import.meta.url), 'utf8');
      const project = projectFromJson(source);
      const rack = project.racks[0]!.state;
      const piano = rack.modules.find(({ type }) => type === 'piano');
      const moduleIds = new Set(rack.modules.map(({ id }) => id));

      expect(project.schemaVersion).toBe(5);
      const pianoEvents = piano?.slots[0]?.pattern?.events ?? [];

      expect(project.scenes.map(({ name }) => name)).toEqual(['Prelude', 'Theme', 'Variation', 'Finale']);
      expect(rack.bpm).toBeLessThanOrEqual(130);
      expect(rack.modules.length).toBeLessThanOrEqual(3);
      expect(rack.modules.every(({ slots }) => slots.length === 8)).toBe(true);
      expect(rack.modules.every(({ sound }) => sound.engineVersion === 2)).toBe(true);
      expect(rack.modules.some(({ type }) => type === 'mixer')).toBe(false);
      expect(piano?.slots.every(({ handEdited, pattern }) => handEdited && pattern !== null)).toBe(true);
      expect(new Set(pianoEvents.map(({ velocity }) => velocity)).size).toBeGreaterThan(1);
      expect(pianoEvents.some(({ accent, velocity }) => accent === true && velocity >= 112)).toBe(true);
      expect(pianoEvents.every(({ pitch }) => pitch >= 36 && pitch <= 83)).toBe(true);
      expect(project.scenes.every(({ assignments }) => Object.keys(assignments).every((id) => moduleIds.has(id)))).toBe(true);
    }
  });
});
