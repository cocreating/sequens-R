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
    expect(project.schemaVersion).toBe(7);
    expect(project.racks[0]?.state.bpm).toBe(110);
    expect(modules?.map(({ type }) => type)).toEqual(['drums', 'arp']);
  });

  it('rejects projects containing the retired Mixer module type', () => {
    const source = JSON.parse(readFileSync(new URL('../../public/projects/basic-electro.sequens-r.json', import.meta.url), 'utf8')) as {
      racks: Array<{ state: { modules: Array<{ type: string }> } }>;
    };
    source.racks[0]!.state.modules[0]!.type = 'mixer';

    expect(() => projectFromJson(JSON.stringify(source))).toThrow(/Unknown module type/u);
  });

});

describe('bundled Synth electronic projects', () => {
  it('imports all fifteen Synth-first demos with bounded tempos, modules, scenes, and released sounds', () => {
    const expectedFiles = [
      'glass-invention.sequens-r.json',
      'quiet-canon.sequens-r.json',
      'winter-largo.sequens-r.json',
      'clockwork-minuet.sequens-r.json',
      'gentle-fugue-pulse.sequens-r.json',
      'pastoral-morning.sequens-r.json',
      'velvet-sarabande.sequens-r.json',
      'classical-allegretto.sequens-r.json',
      'romantic-waltz-glow.sequens-r.json',
      'luminous-rondo.sequens-r.json',
      'moonlit-nocturne.sequens-r.json',
      'water-garden.sequens-r.json',
      'dreaming-etude.sequens-r.json',
      'sweet-electro-invention.sequens-r.json',
      'ambient-pulse-canon.sequens-r.json',
    ];
    const index = parseDemoProjectIndex(JSON.parse(readFileSync(new URL('../../public/projects/index.json', import.meta.url), 'utf8')));
    const groups = groupDemoProjects(index);

    expect(index.map(({ file }) => file)).toEqual(expectedFiles);
    expect(groups.map(({ genre, projects }) => [genre, projects.length])).toEqual([
      ['Minimal Techno', 5],
      ['Minimal House Techno', 5],
      ['Ambient Techno & Breakbeats', 5],
    ]);
    for (const entry of index) {
      const source = readFileSync(new URL(`../../public/projects/${entry.file}`, import.meta.url), 'utf8');
      const project = projectFromJson(source);
      const rack = project.racks[0]!.state;
      const synths = rack.modules.filter(({ type }) => type === 'synth');
      const synth = synths[0];
      const moduleIds = new Set(rack.modules.map(({ id }) => id));

      expect(project.schemaVersion).toBe(7);
      expect(project.settings.genre).toBe(entry.genre);
      expect(project.scenes.map(({ name }) => name)).toEqual(['Intro', 'Groove', 'Variation', 'Peak']);
      expect(rack.bpm).toBeLessThanOrEqual(130);
      expect(rack.modules.length).toBeLessThanOrEqual(3);
      expect(rack.modules.every(({ slots }) => slots.length === 8)).toBe(true);
      expect(rack.modules.every(({ sound }) => sound.engineVersion === 2)).toBe(true);
      expect(synths).toHaveLength(1);
      expect(synth?.sound.presetId.startsWith('synth-')).toBe(true);
      expect(synth?.slots.every(({ handEdited, pattern }) => !handEdited && pattern === null)).toBe(true);
      expect(new Set(synth?.slots.map(({ seed }) => seed))).toHaveLength(8);
      expect(rack.modules.some(({ type }) => type === 'synth' || type === 'drums')).toBe(true);
      expect(project.scenes.every(({ assignments }) => Object.keys(assignments).every((id) => moduleIds.has(id)))).toBe(true);
    }
  });
});
