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

describe('bundled electronic demo projects', () => {
  it('imports all twenty rhythm-archetype demos with bounded tempos, modules, scenes, and released sounds', () => {
    const expectedFiles = [
      'basement-ledger.sequens-r.json',
      'rotary-hood.sequens-r.json',
      'motorik-mile.sequens-r.json',
      'purpose-signal.sequens-r.json',
      'chrome-cell.sequens-r.json',
      'dial-tone-loop.sequens-r.json',
      'schaffel-grain.sequens-r.json',
      'jack-ledger.sequens-r.json',
      'deep-pocket.sequens-r.json',
      'bucharest-tick.sequens-r.json',
      'filter-sunrise.sequens-r.json',
      'garage-slant.sequens-r.json',
      'sunday-organ.sequens-r.json',
      'tech-pocket.sequens-r.json',
      'selected-drift.sequens-r.json',
      'sequencer-field.sequens-r.json',
      'amen-chapel.sequens-r.json',
      'autobahn-coast.sequens-r.json',
      'tilt-machine.sequens-r.json',
      'tape-haze.sequens-r.json',
    ];
    const index = parseDemoProjectIndex(JSON.parse(readFileSync(new URL('../../public/projects/index.json', import.meta.url), 'utf8')));
    const groups = groupDemoProjects(index);

    expect(index.map(({ file }) => file)).toEqual(expectedFiles);
    expect(groups.map(({ genre, projects }) => [genre, projects.length])).toEqual([
      ['Minimal Techno', 7],
      ['Minimal House Techno', 7],
      ['Ambient Techno & Breakbeats', 6],
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
      expect(rack.bpm).toBeGreaterThanOrEqual(84);
      expect(rack.bpm).toBeLessThanOrEqual(168);
      expect(rack.modules.length).toBeGreaterThanOrEqual(2);
      expect(rack.modules.length).toBeLessThanOrEqual(3);
      expect(rack.modules.every(({ slots }) => slots.length === 8)).toBe(true);
      expect(rack.modules.every(({ sound }) => sound.engineVersion === 2)).toBe(true);
      expect(synths.length).toBeLessThanOrEqual(1);
      if (synth !== undefined) {
        expect(synth.sound.presetId.startsWith('synth-')).toBe(true);
        expect(synth.slots.every(({ handEdited, pattern }) => !handEdited && pattern === null)).toBe(true);
        expect(new Set(synth.slots.map(({ seed }) => seed))).toHaveLength(8);
      }
      // Every demo declares at most four drum sounds, in all eight pattern slots.
      for (const drums of rack.modules.filter(({ type }) => type === 'drums')) {
        for (const slot of drums.slots) {
          const voiced = Array.from({ length: 8 }, (_, lane) => slot.params[`lane${lane}`] ?? 0).filter((mask) => mask > 0);
          expect(voiced.length).toBeLessThanOrEqual(4);
        }
      }
      expect(rack.modules.some(({ type }) => type === 'synth' || type === 'drums' || type === 'drone')).toBe(true);
      expect(project.scenes.every(({ assignments }) => Object.keys(assignments).every((id) => moduleIds.has(id)))).toBe(true);
    }
  });
});
