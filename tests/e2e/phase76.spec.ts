import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { analyzeAudio, type AudioAnalysis, type AudioPcm } from '../../src/lib/audio/analysis';

test.use({ viewport: { width: 375, height: 812 } });

function decodePcm16Wav(bytes: Buffer): AudioPcm {
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WAVE');
  const channelCount = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  expect(bytes.readUInt16LE(34)).toBe(16);
  let offset = 12;
  while (offset + 8 <= bytes.length && bytes.subarray(offset, offset + 4).toString() !== 'data') offset += 8 + bytes.readUInt32LE(offset + 4);
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

test('eight four-slot Arp presets render clean level-matched pluck references', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  for (const moduleName of ['Drums', 'Bass', 'Chords']) {
    await page.getByRole('listitem', { name: moduleName }).getByRole('button', { name: `Mute ${moduleName}` }).click();
  }
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="arp"]').click();
  const arp = page.getByRole('listitem', { name: 'Arp' });
  await arp.locator('.module-advanced > summary').click();
  await arp.getByLabel('Seed', { exact: true }).fill('1397051654');
  await arp.getByLabel('Seed', { exact: true }).blur();
  await arp.getByLabel('Rate').selectOption('2');
  await arp.getByText('Sound', { exact: true }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByLabel('Length').selectOption('1');
  await mkdir('test-results/phase7.6', { recursive: true });
  const presets = [
    ['arp-core-v2', '01-threadlight'], ['arp-soft-v2', '02-dewpluck'],
    ['arp-crystal-v2', '03-crystalstep'], ['arp-pixel-v2', '04-softpixel'],
    ['arp-needle-v2', '05-needledrop'], ['arp-copper-v2', '06-copperkey'],
    ['arp-dark-v2', '07-nightbead'], ['arp-quick-v2', '08-quickglass'],
  ] as const;
  const analyses: Array<{ name: string; analysis: AudioAnalysis; digest: string }> = [];
  for (let index = 0; index < presets.length; index += 1) {
    const [presetId, name] = presets[index]!;
    await arp.getByLabel('Preset').selectOption(presetId);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const download = await pending;
    const path = `test-results/phase7.6/${name}.wav`;
    await download.saveAs(path);
    const bytes = await readFile(path);
    analyses.push({ name, analysis: analyzeAudio(decodePcm16Wav(bytes)), digest: createHash('sha256').update(bytes).digest('hex') });
  }
  expect(new Set(analyses.map(({ digest }) => digest)).size).toBe(presets.length);
  for (const { name, analysis } of analyses) {
    expect(analysis.integratedLufs, `${name} loudness`).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18), `${name} loudness delta`).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp, `${name} true peak`).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs, `${name} DC`).toBeLessThanOrEqual(-60);
  }
});
