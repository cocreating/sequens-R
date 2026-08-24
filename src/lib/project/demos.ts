export interface DemoProjectEntry {
  name: string;
  file: string;
  description?: string;
}

export const DEMO_PROJECT_INDEX_URL = '/projects/index.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDemoProjectIndex(value: unknown): readonly DemoProjectEntry[] {
  if (!isRecord(value) || !Array.isArray(value.projects)) throw new TypeError('The demo project index is malformed.');
  return value.projects.map((entry, index) => {
    if (!isRecord(entry)) throw new TypeError(`Demo project ${index + 1} is malformed.`);
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const file = typeof entry.file === 'string' ? entry.file.trim() : '';
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';
    if (name === '') throw new TypeError(`Demo project ${index + 1} needs a name.`);
    if (!/^[a-z0-9][a-z0-9._-]*\.json$/iu.test(file)) throw new TypeError(`Demo project ${name} has an invalid file name.`);
    return { name, file, ...(description === '' ? {} : { description }) };
  });
}

export function demoProjectUrl(file: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/iu.test(file)) throw new TypeError('The demo project file name is invalid.');
  return `/projects/${encodeURIComponent(file)}`;
}
