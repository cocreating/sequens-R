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

test('eight monophonic Synth presets render distinct, clean, level-matched references', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  for (const moduleName of ['Drums', 'Bass', 'Chords']) {
    await page.getByRole('listitem', { name: moduleName }).getByRole('button', { name: `Mute ${moduleName}` }).click();
  }
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="synth"]').click();
  const synth = page.getByRole('listitem', { name: 'Synth' });
  await synth.locator('.module-advanced > summary').click();
  await synth.getByLabel('Seed', { exact: true }).fill('1370480211');
  await synth.getByLabel('Seed', { exact: true }).blur();
  await synth.getByLabel('Density').fill('100');
  await synth.getByText('Sound', { exact: true }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByLabel('Length').selectOption('1');
  await mkdir('test-results/synth', { recursive: true });

  const presets = [
    ['synth-core-v2', '01-signal'], ['synth-soft-v2', '02-soft-arc'],
    ['synth-bright-v2', '03-dayline'], ['synth-hollow-v2', '04-hollow-point'],
    ['synth-pluck-v2', '05-quick-pulse'], ['synth-wide-v2', '06-twin-path'],
    ['synth-dark-v2', '07-night-signal'], ['synth-glass-v2', '08-glass-current'],
  ] as const;
  const analyses: Array<{ name: string; analysis: AudioAnalysis; digest: string }> = [];
  for (const [presetId, name] of presets) {
    await synth.getByLabel('Preset').selectOption(presetId);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const path = `test-results/synth/${name}.wav`;
    await (await pending).saveAs(path);
    const bytes = await readFile(path);
    analyses.push({ name, analysis: analyzeAudio(decodePcm16Wav(bytes)), digest: createHash('sha256').update(bytes).digest('hex') });
  }

  console.log(analyses.map(({ name, analysis }) => `${name}: ${analysis.integratedLufs?.toFixed(2)} LUFS-I / ${analysis.truePeakDbtp.toFixed(2)} dBTP / ${analysis.dcDbfs.toFixed(2)} dBFS DC`).join('\n'));
  expect(new Set(analyses.map(({ digest }) => digest)).size).toBe(presets.length);
  for (const { name, analysis } of analyses) {
    expect(analysis.integratedLufs, `${name} loudness`).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18), `${name} loudness delta`).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp, `${name} true peak`).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs, `${name} DC`).toBeLessThanOrEqual(-60);
  }
});
