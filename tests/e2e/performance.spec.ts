import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page, type TestInfo } from '@playwright/test';
import { analyzeAudio, type AudioPcm } from '../../src/lib/audio/analysis';

test.use({ viewport: { width: 1280, height: 900 } });

function decodePcm16Wav(bytes: Buffer): AudioPcm {
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WAVE');
  const channelCount = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  let offset = 12;
  while (offset + 8 <= bytes.length && bytes.subarray(offset, offset + 4).toString() !== 'data') {
    offset += 8 + bytes.readUInt32LE(offset + 4);
  }
  const byteLength = bytes.readUInt32LE(offset + 4);
  const sampleCount = byteLength / 2 / channelCount;
  const channels = Array.from({ length: channelCount }, () => new Float32Array(sampleCount));
  let cursor = offset + 8;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels[channel]![sample] = bytes.readInt16LE(cursor) / 32_768;
      cursor += 2;
    }
  }
  return { sampleRate, channels };
}

async function addModules(page: Page, types: readonly string[]): Promise<void> {
  for (const type of types) {
    await page.getByRole('button', { name: 'Add Module', exact: true }).click();
    await page.locator(`.module-choice[data-module-type="${type}"]`).click();
  }
}

async function bounceOneBar(page: Page, testInfo: TestInfo, name: string): Promise<ReturnType<typeof analyzeAudio>> {
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('#studio-workspace').getByLabel('Length').selectOption('1');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Mix WAV' }).click();
  const download: Download = await pending;
  const outputPath = testInfo.outputPath(`${name}.wav`);
  await download.saveAs(outputPath);
  await page.getByRole('button', { name: 'Close workspace' }).click();
  return analyzeAudio(decodePcm16Wav(await readFile(outputPath)));
}

test('five- and fourteen-module racks retain true-peak headroom', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
  await page.goto('/');

  await addModules(page, ['acid', 'arp']);
  await expect(page.locator('article')).toHaveCount(5);
  const fiveModules = await bounceOneBar(page, testInfo, 'five-modules');
  expect(fiveModules.integratedLufs).not.toBeNull();
  expect(fiveModules.integratedLufs!).toBeGreaterThan(-24);
  expect(fiveModules.truePeakDbtp).toBeLessThanOrEqual(-1);

  await addModules(page, ['euclid', 'piano', 'drums', 'bass', 'acid', 'chords', 'arp', 'euclid', 'piano']);
  await expect(page.locator('article')).toHaveCount(14);
  const fourteenModules = await bounceOneBar(page, testInfo, 'fourteen-modules');
  expect(fourteenModules.integratedLufs).not.toBeNull();
  expect(fourteenModules.integratedLufs!).toBeGreaterThan(-24);
  expect(fourteenModules.truePeakDbtp).toBeLessThanOrEqual(-1);
  console.log(`Performance mix evidence: 5 modules ${fiveModules.integratedLufs!.toFixed(2)} LUFS-I / ${fiveModules.truePeakDbtp.toFixed(2)} dBTP; 14 modules ${fourteenModules.integratedLufs!.toFixed(2)} LUFS-I / ${fourteenModules.truePeakDbtp.toFixed(2)} dBTP.`);
});

test('Phase 7 acceptance prepares the fixed C10 rack and copies an explicit evidence report', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByText('Diagnostics', { exact: true }).click();
  await page.getByRole('button', { name: 'Prepare 16-module C10 rack' }).click();
  await expect(page.locator('article')).toHaveCount(16);
  await expect(page.locator('#tempo')).toHaveValue('140');
  await expect(page.locator('.session-status')).toContainText('C10 rack prepared');

  await page.getByRole('button', { name: 'Close workspace' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  const diagnosticsPanel = page.locator('.diagnostics-panel');
  if (!await diagnosticsPanel.evaluate((element) => (element as HTMLDetailsElement).open)) await diagnosticsPanel.locator('summary').click();
  await page.getByRole('button', { name: 'Start 10-minute run' }).click();
  await expect(page.locator('#c10-progress')).toBeVisible();
  await page.waitForTimeout(1_100);
  await page.getByRole('button', { name: 'Stop run' }).click();

  await page.locator('#c10-xruns').fill('0');
  await page.locator('#c10-ui-frame').fill('7.5');
  await page.locator('#c10-midi-jitter').fill('0.8');
  await page.getByRole('checkbox', { name: 'Mixer', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Piano', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Euclid', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Final mixed starter', exact: true }).check();
  await page.locator('#phase7-listening-notes').fill('Reference-device listening recorded by the operator.');
  await expect(page.getByText('All listening decisions are recorded.')).toBeVisible();
  await expect(page.getByText('Android C10 remains open until every check passes.')).toBeVisible();

  await page.getByRole('button', { name: 'Copy report' }).click();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain('# Phase 7 acceptance report');
  expect(report).toContain('- [x] Mixer');
  expect(report).toContain('Duration ≥ 10 minutes');
  expect(report).toContain('Reference-device listening recorded by the operator.');
});
