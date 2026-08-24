import { describe, expect, it } from 'vitest';
import { demoProjectUrl, parseDemoProjectIndex } from '../../src/lib/project/demos';

describe('demo project index', () => {
  it('validates entries and builds public project URLs', () => {
    const [entry] = parseDemoProjectIndex({ projects: [{ name: 'Basic Electro', file: 'basic-electro.sequens-r.json', description: 'Demo' }] });
    expect(entry).toEqual({ name: 'Basic Electro', file: 'basic-electro.sequens-r.json', description: 'Demo' });
    expect(demoProjectUrl(entry!.file)).toBe('/projects/basic-electro.sequens-r.json');
  });

  it('rejects paths that could escape the public projects directory', () => {
    expect(() => parseDemoProjectIndex({ projects: [{ name: 'Unsafe', file: '../unsafe.json' }] })).toThrow(/invalid file name/u);
    expect(() => demoProjectUrl('/unsafe.json')).toThrow(/invalid/u);
  });
});
