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

function monoRetention(pcm: AudioPcm): number {
  const left = pcm.channels[0]!;
  const right = pcm.channels[1] ?? left;
  let stereoPower = 0;
  let monoPower = 0;
  for (let index = 0; index < left.length; index += 1) {
    stereoPower += (left[index]! ** 2 + right[index]! ** 2) / 2;
    monoPower += ((left[index]! + right[index]!) / 2) ** 2;
  }
  return Math.sqrt(monoPower / Math.max(Number.EPSILON, stereoPower));
}

test('ten polyphonic Chords presets render clean level-matched mono-compatible references', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.getByRole('listitem', { name: 'Drums' }).getByRole('button', { name: 'Mute Drums' }).click();
  await page.getByRole('listitem', { name: 'Bass' }).getByRole('button', { name: 'Mute Bass' }).click();
  const chords = page.getByRole('listitem', { name: 'Chords' });
  await chords.locator('.module-advanced > summary').click();
  await chords.getByLabel('Seed', { exact: true }).fill('1397051652');
  await chords.getByLabel('Seed', { exact: true }).blur();
  await chords.getByText('Sound', { exact: true }).click();
  await page.locator('.workspace-utilities > summary').click();
  await page.getByLabel('Length').selectOption('1');
  await mkdir('test-results/phase7.5', { recursive: true });
  const presets = [
    ['chords-core-v2', '01-velvetframe'], ['chords-pad-v2', '02-slowbloom'],
    ['chords-keys-v2', '03-softpress'], ['chords-organ-v2', '04-drawline'],
    ['chords-glass-v2', '05-prismveil'], ['chords-muted-v2', '06-feltcut'],
    ['chords-wide-v2', '07-horizon'], ['chords-dark-v2', '08-undercanopy'],
    ['chords-bright-v2', '09-daybreak'], ['chords-drift-v2', '10-cloudcurrent'],
  ] as const;
  const analyses: Array<{ name: string; analysis: AudioAnalysis; mono: number; digest: string }> = [];
  for (let index = 0; index < presets.length; index += 1) {
    const [presetId, name] = presets[index]!;
    await chords.getByLabel('Quality').selectOption(String(index % 5));
    await chords.getByLabel('Preset').selectOption(presetId);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const download = await pending;
    const path = `test-results/phase7.5/${name}.wav`;
    await download.saveAs(path);
    const bytes = await readFile(path);
    const pcm = decodePcm16Wav(bytes);
    analyses.push({ name, analysis: analyzeAudio(pcm), mono: monoRetention(pcm), digest: createHash('sha256').update(bytes).digest('hex') });
  }
  expect(new Set(analyses.map(({ digest }) => digest)).size).toBe(presets.length);
  for (const { name, analysis, mono } of analyses) {
    expect(analysis.integratedLufs, `${name} loudness`).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18), `${name} loudness delta`).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp, `${name} true peak`).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs, `${name} DC`).toBeLessThanOrEqual(-60);
    expect(mono, `${name} mono retention`).toBeGreaterThanOrEqual(0.55);
  }
});
