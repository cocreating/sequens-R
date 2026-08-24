import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

test('MIDI remains opt-in, routes timestamped notes, clocks, and discovers hot-plugged outputs', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ port: string; data: number[]; timestamp?: number }> = [];
    const outputs = new Map<string, object>();
    const access = new EventTarget();
    const makeOutput = (id: string, name: string) => ({
      id, name, manufacturer: 'Mock Devices', state: 'connected', connection: 'open',
      open: async () => undefined,
      send: (data: Iterable<number>, timestamp?: number) => calls.push({ port: id, data: [...data], ...(timestamp === undefined ? {} : { timestamp }) }),
    });
    outputs.set('mock-1', makeOutput('mock-1', 'Mock Synth'));
    Object.defineProperty(access, 'outputs', { value: outputs });
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: async (options: { sysex?: boolean }) => {
        (window as typeof window & { __midiRequestOptions?: object }).__midiRequestOptions = options;
        return access;
      },
    });
    Object.defineProperty(navigator.permissions, 'query', { configurable: true, value: async () => ({ state: 'prompt' }) });
    const testWindow = window as typeof window & {
      __midiCalls?: typeof calls;
      __hotPlugMidi?: () => void;
    };
    testWindow.__midiCalls = calls;
    testWindow.__hotPlugMidi = () => {
      outputs.set('mock-2', makeOutput('mock-2', 'Hot Plug Synth'));
      access.dispatchEvent(new Event('statechange'));
    };
  });

  await page.goto('/');
  await page.locator('.workspace-utilities > summary').click();
  await expect(page.getByRole('button', { name: 'Connect hardware' })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __midiRequestOptions?: object }).__midiRequestOptions)).toBeUndefined();

  await page.getByRole('button', { name: 'Connect hardware' }).click();
  await expect(page.getByText('1 MIDI output ready')).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __midiRequestOptions?: { sysex?: boolean } }).__midiRequestOptions)).toEqual({ sysex: false, software: false });

  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.locator('.module-advanced > summary').click();
  await bass.getByLabel('MIDI out').selectOption('mock-1');
  await expect(bass.getByRole('button', { name: 'Monitor Bass' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Send clock').check();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Playing', exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Stop' }).click();

  const calls = await page.evaluate(() => (window as typeof window & { __midiCalls: Array<{ data: number[]; timestamp?: number }> }).__midiCalls);
  expect(calls.some(({ data }) => data[0] === 0xfa)).toBe(true);
  expect(calls.filter(({ data }) => data[0] === 0xfa)).toHaveLength(1);
  expect(calls.some(({ data }) => data[0] === 0xf8)).toBe(true);
  expect(calls.some(({ data }) => (data[0]! & 0xf0) === 0x90)).toBe(true);
  expect(calls.some(({ data }) => (data[0]! & 0xf0) === 0x80)).toBe(true);
  expect(calls.some(({ data }) => data[0] === 0xfc)).toBe(true);
  expect(calls.filter(({ data }) => data[1] === 123 || data[1] === 120)).toHaveLength(32);
  expect(calls.filter(({ timestamp }) => timestamp !== undefined).every(({ timestamp }) => Number.isFinite(timestamp))).toBe(true);

  await page.getByLabel('Tempo').fill('300');
  await page.evaluate(() => { (window as typeof window & { __midiCalls: unknown[] }).__midiCalls.length = 0; });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(50);
  await bass.getByRole('button', { name: 'Mute Bass' }).click();
  await page.evaluate(() => { (window as typeof window & { __midiCalls: unknown[] }).__midiCalls.length = 0; });
  await page.waitForTimeout(350);
  const callsAfterMute = await page.evaluate(() => (window as typeof window & { __midiCalls: Array<{ data: number[] }> }).__midiCalls);
  expect(callsAfterMute.some(({ data }) => (data[0]! & 0xf0) === 0x90)).toBe(false);
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.evaluate(() => (window as typeof window & { __hotPlugMidi: () => void }).__hotPlugMidi());
  await expect(bass.getByLabel('MIDI out').getByRole('option', { name: 'Hot Plug Synth' })).toBeAttached();
});

test('MIDI denial has a recovery path while internal play remains available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: async () => { throw new DOMException('Denied', 'SecurityError'); },
    });
    Object.defineProperty(navigator.permissions, 'query', { configurable: true, value: async () => ({ state: 'denied' }) });
  });
  await page.goto('/');
  await page.locator('.workspace-utilities > summary').click();
  await page.getByRole('button', { name: 'Connect hardware' }).click();
  await expect(page.getByText(/Allow MIDI devices in this site’s browser permissions/)).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('Transport playing')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
});

test('rack/module MIDI, mix WAV, and zipped WAV stems download with selected length', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.locator('.workspace-utilities > summary').click();
  await page.getByLabel('Length').selectOption('1');

  let downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Rack MIDI' }).click();
  let download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-1-bars\.mid$/u);
  let path = await download.path();
  if (path === null) throw new Error('Rack MIDI download has no path.');
  expect((await readFile(path)).subarray(0, 4).toString()).toBe('MThd');

  downloadPromise = page.waitForEvent('download');
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.locator('.module-menu > summary').click();
  await bass.getByRole('button', { name: 'Export MIDI' }).click();
  download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bass-1-bars.mid');

  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Mix WAV' }).click();
  download = await downloadPromise;
  path = await download.path();
  if (path === null) throw new Error('Mix WAV download has no path.');
  const wav = await readFile(path);
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.subarray(8, 12).toString()).toBe('WAVE');

  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'WAV stems' }).click();
  download = await downloadPromise;
  path = await download.path();
  if (path === null) throw new Error('WAV stems download has no path.');
  const zip = await readFile(path);
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  expect(zip.toString()).toContain('01-drums.wav');
  expect(zip.toString()).toContain('02-bass.wav');
  expect(zip.toString()).toContain('03-chords.wav');
});
