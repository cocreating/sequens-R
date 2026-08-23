import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelConfig {
  headers?: Array<{
    source: string;
    headers: VercelHeader[];
  }>;
}

describe('Vercel production headers', () => {
  it('enables cross-origin isolation on every route', async () => {
    const configUrl = new URL('../../vercel.json', import.meta.url);
    const config = JSON.parse(await readFile(configUrl, 'utf8')) as VercelConfig;
    const allRoutes = config.headers?.find(({ source }) => source === '/(.*)');

    expect(allRoutes?.headers).toEqual(expect.arrayContaining([
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ]));
  });
});
