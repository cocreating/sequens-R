import { mkdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { analyzeAudio, type AudioPcm } from '../../src/lib/audio/analysis';

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

test('six procedural drum kits render deterministic clean audition references', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('listitem', { name: 'Bass' }).getByRole('button', { name: 'Mute Bass' }).click();
  await page.getByRole('listitem', { name: 'Chords' }).getByRole('button', { name: 'Mute Chords' }).click();
  const drums = page.getByRole('listitem', { name: 'Drums' });
  await drums.getByText('Sound', { exact: true }).click();
  await page.locator('.workspace-utilities > summary').click();
  await page.getByLabel('Length').selectOption('1');
  await mkdir('test-results/phase7.2', { recursive: true });
  const kits = [
    ['drums-core-v2', '01-foundation'],
    ['drums-broken-v2', '02-fracture'],
    ['drums-latin-v2', '03-solar'],
    ['drums-electro-v2', '04-voltage'],
    ['drums-halftime-v2', '05-weight'],
    ['drums-odd-v2', '06-tilt'],
  ] as const;
  for (let index = 0; index < kits.length; index += 1) {
    await drums.getByLabel('Style').selectOption(String(index));
    await drums.getByLabel('Kit').selectOption(kits[index]![0]);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Mix WAV' }).click();
    const download = await pending;
    const path = `test-results/phase7.2/${kits[index]![1]}.wav`;
    await download.saveAs(path);
    const analysis = analyzeAudio(decodePcm16Wav(await readFile(path)));
    expect(analysis.integratedLufs).not.toBeNull();
    expect(Math.abs(analysis.integratedLufs! - -18)).toBeLessThanOrEqual(1);
    expect(analysis.truePeakDbtp).toBeLessThanOrEqual(-1);
    expect(analysis.dcDbfs).toBeLessThanOrEqual(-60);
  }
});
