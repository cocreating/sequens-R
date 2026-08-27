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

test('12 AudioWorklet Acid presets render clean level-matched audition references', async ({ browser }) => {
  test.setTimeout(150_000);
  await mkdir('test-results/phase7.4', { recursive: true });
  const presets = [
    ['acid-core-v2', '01-pulsewire'], ['acid-clean-v2', '02-clearcut'],
    ['acid-hollow-v2', '03-hollow'], ['acid-sharp-v2', '04-razorleaf'],
    ['acid-rubber-v2', '05-rubberline'], ['acid-animated-v2', '06-neoncoil'],
    ['acid-dark-v2', '07-nighttrace'], ['acid-driven-v2', '08-scorch'],
    ['acid-liquid-v2', '09-liquidstep'], ['acid-short-v2', '10-pinpoint'],
    ['acid-low-v2', '11-lowcurrent'], ['acid-bright-v2', '12-glasswire'],
  ] as const;
  const analyses: Array<{ name: string; analysis: AudioAnalysis }> = [];
  for (const [presetId, name] of presets) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, acceptDownloads: true });
    const page = await context.newPage();
    await page.goto('/');
    for (const moduleName of ['Drums', 'Bass', 'Chords']) {
      await page.getByRole('listitem', { name: moduleName }).getByRole('button', { name: `Mute ${moduleName}` }).click();
    }
    await page.getByLabel('New module').selectOption('acid');
    await page.getByRole('button', { name: 'Add Module', exact: true }).click();
    const acid = page.getByRole('listitem', { name: 'Acid' });
    await acid.locator('.module-advanced > summary').click();
    await acid.getByLabel('Seed', { exact: true }).fill('1946157057');
    await acid.getByLabel('Seed', { exact: true }).blur();
    await acid.getByText('Sound', { exact: true }).click();
    await acid.getByLabel('Preset').selectOption(presetId);
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByLabel('Length').selectOption('1');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const download = await pending;
    const path = `test-results/phase7.4/${name}.wav`;
    await download.saveAs(path);
    analyses.push({ name, analysis: analyzeAudio(decodePcm16Wav(await readFile(path))) });
    await context.close();
  }
  for (const { name, analysis } of analyses) {
    expect(analysis.integratedLufs, `${name} loudness`).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18), `${name} loudness delta`).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp, `${name} true peak`).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs, `${name} DC`).toBeLessThanOrEqual(-60);
  }
});
