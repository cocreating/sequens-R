import { describe, expect, it } from 'vitest';
import { demoProjectUrl, groupDemoProjects, parseDemoProjectIndex } from '../../src/lib/project/demos';

describe('demo project index', () => {
  it('validates entries and builds public project URLs', () => {
    const [entry] = parseDemoProjectIndex({ projects: [{ name: 'Basic Electro', file: 'basic-electro.sequens-r.json', genre: 'Melodic Electronica', description: 'Demo' }] });
    expect(entry).toEqual({ name: 'Basic Electro', file: 'basic-electro.sequens-r.json', genre: 'Melodic Electronica', description: 'Demo' });
    expect(demoProjectUrl(entry!.file)).toBe('/projects/basic-electro.sequens-r.json');
  });

  it('groups projects by genre in catalog order', () => {
    const entries = parseDemoProjectIndex({ projects: [
      { name: 'Quiet One', file: 'quiet-one.json', genre: 'Ambient' },
      { name: 'Bright One', file: 'bright-one.json', genre: 'Electronica' },
      { name: 'Quiet Two', file: 'quiet-two.json', genre: 'Ambient' },
    ] });

    expect(groupDemoProjects(entries).map(({ genre, projects }) => ({ genre, names: projects.map(({ name }) => name) }))).toEqual([
      { genre: 'Ambient', names: ['Quiet One', 'Quiet Two'] },
      { genre: 'Electronica', names: ['Bright One'] },
    ]);
  });

  it('rejects paths that could escape the public projects directory', () => {
    expect(() => parseDemoProjectIndex({ projects: [{ name: 'Unsafe', file: '../unsafe.json', genre: 'Ambient' }] })).toThrow(/invalid file name/u);
    expect(() => parseDemoProjectIndex({ projects: [{ name: 'Missing genre', file: 'safe.json' }] })).toThrow(/needs a genre/u);
    expect(() => demoProjectUrl('/unsafe.json')).toThrow(/invalid/u);
  });
});
