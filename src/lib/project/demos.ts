export interface DemoProjectEntry {
  name: string;
  file: string;
  genre: string;
  description?: string;
}

export interface DemoProjectGroup {
  genre: string;
  projects: readonly DemoProjectEntry[];
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
    const genre = typeof entry.genre === 'string' ? entry.genre.trim() : '';
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';
    if (name === '') throw new TypeError(`Demo project ${index + 1} needs a name.`);
    if (genre === '') throw new TypeError(`Demo project ${name} needs a genre.`);
    if (!/^[a-z0-9][a-z0-9._-]*\.json$/iu.test(file)) throw new TypeError(`Demo project ${name} has an invalid file name.`);
    return { name, file, genre, ...(description === '' ? {} : { description }) };
  });
}

export function groupDemoProjects(entries: readonly DemoProjectEntry[]): readonly DemoProjectGroup[] {
  const groups = new Map<string, DemoProjectEntry[]>();
  for (const entry of entries) {
    const projects = groups.get(entry.genre) ?? [];
    projects.push(entry);
    groups.set(entry.genre, projects);
  }
  return [...groups].map(([genre, projects]) => ({ genre, projects }));
}

export function demoProjectUrl(file: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/iu.test(file)) throw new TypeError('The demo project file name is invalid.');
  return `/projects/${encodeURIComponent(file)}`;
}
