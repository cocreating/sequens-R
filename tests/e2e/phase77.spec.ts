import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { analyzeAudio, type AudioAnalysis, type AudioPcm } from '../../src/lib/audio/analysis';

test.use({ viewport: { width: 1280, height: 900 } });

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

test('eight electric Piano presets render clean level-matched eight-note references', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
  await page.goto('/');
  for (const moduleName of ['Drums', 'Bass', 'Chords']) {
    await page.getByRole('listitem', { name: moduleName }).getByRole('button', { name: `Mute ${moduleName}` }).click();
  }
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="piano"]').click();
  const piano = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'piano module name' }) });
  await piano.locator('.module-advanced > summary').click();
  await piano.getByLabel('Pitch mode').getByRole('button', { name: 'Chromatic' }).click();
  const intervals = [0, 4, 7, 11, 14, 11, 7, 4];
  for (let index = 0; index < intervals.length; index += 1) {
    await piano.getByRole('button', { name: 'Add note' }).click();
    const note = piano.locator('.piano-note').nth(index);
    await note.focus();
    for (let semitone = 0; semitone < intervals[index]!; semitone += 1) await note.press('ArrowUp');
  }
  await piano.getByText('Sound', { exact: true }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByLabel('Music export').getByLabel('Length').selectOption('1');
  await mkdir('test-results/phase7.7', { recursive: true });
  const presets = [
    ['piano-core-v2', '01-amberkey'], ['piano-soft-v2', '02-velvet-tine'],
    ['piano-bell-v2', '03-silver-bell'], ['piano-tine-v2', '04-tinewire'],
    ['piano-muted-v2', '05-mufflekey'], ['piano-dark-v2', '06-night-felt'],
    ['piano-bright-v2', '07-sun-tine'], ['piano-tremolo-v2', '08-reed-shimmer'],
  ] as const;
  const analyses: Array<{ name: string; analysis: AudioAnalysis; digest: string }> = [];
  for (const [presetId, name] of presets) {
    await piano.getByLabel('Preset').selectOption(presetId);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const download = await pending;
    const path = `test-results/phase7.7/${name}.wav`;
    await download.saveAs(path);
    const bytes = await readFile(path);
    const analysis = analyzeAudio(decodePcm16Wav(bytes));
    analyses.push({ name, analysis, digest: createHash('sha256').update(bytes).digest('hex') });
    test.info().annotations.push({ type: name, description: `${analysis.integratedLufs?.toFixed(1)} LUFS-I · ${analysis.truePeakDbtp.toFixed(1)} dBTP · ${analysis.dcDbfs.toFixed(1)} dBFS DC` });
  }
  expect(new Set(analyses.map(({ digest }) => digest)).size).toBe(presets.length);
  for (const { name, analysis } of analyses) {
    expect(analysis.integratedLufs, `${name} loudness`).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18), `${name} loudness delta`).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp, `${name} true peak`).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs, `${name} DC`).toBeLessThanOrEqual(-60);
  }
});
