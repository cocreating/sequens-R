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
    await page.getByLabel('New module').selectOption(type);
    await page.getByRole('button', { name: 'Add Module', exact: true }).click();
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
