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

test('eight monophonic Bass presets render clean level-matched audition references', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('listitem', { name: 'Drums' }).getByRole('button', { name: 'Mute Drums' }).click();
  await page.getByRole('listitem', { name: 'Chords' }).getByRole('button', { name: 'Mute Chords' }).click();
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.getByText('Sound', { exact: true }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByLabel('Length').selectOption('1');
  await mkdir('test-results/phase7.3', { recursive: true });
  const presets = [
    ['bass-core-v2', '01-roundhouse'],
    ['bass-clean-v2', '02-clearline'],
    ['bass-pluck-v2', '03-shortwood'],
    ['bass-sub-v2', '04-undertow'],
    ['bass-driven-v2', '05-ember'],
    ['bass-animated-v2', '06-orbit'],
    ['bass-square-v2', '07-block'],
    ['bass-deep-v2', '08-nightfloor'],
  ] as const;
  const analyses: Array<{ name: string; analysis: AudioAnalysis }> = [];
  for (let index = 0; index < presets.length; index += 1) {
    await bass.getByLabel('Style').selectOption(String(index % 6));
    await bass.getByLabel('Preset').selectOption(presets[index]![0]);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const download = await pending;
    const path = `test-results/phase7.3/${presets[index]![1]}.wav`;
    await download.saveAs(path);
    analyses.push({ name: presets[index]![1], analysis: analyzeAudio(decodePcm16Wav(await readFile(path))) });
  }
  for (const { name, analysis } of analyses) {
    expect(analysis.integratedLufs, `${name} loudness`).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18), `${name} loudness delta`).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp, `${name} true peak`).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs, `${name} DC`).toBeLessThanOrEqual(-60);
  }
});
