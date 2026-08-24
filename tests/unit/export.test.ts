import { describe, expect, it } from 'vitest';
import { createSmfType1 } from '../../src/lib/export/smf';
import { encodePcm16Wav } from '../../src/lib/export/wav';
import { createStoredZip } from '../../src/lib/export/zip';
import { createRackState } from '../../src/lib/state/rack';
import { STARTER_RACK } from '../../src/lib/share/starter';

function ascii(data: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(data.slice(start, start + length));
}

function uint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}

function uint32le(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

describe('music export', () => {
  it('writes an SMF Type 1 conductor track plus one track per generator', () => {
    const rack = createRackState(STARTER_RACK);
    const midi = createSmfType1(rack, 4);
    expect(ascii(midi, 0, 4)).toBe('MThd');
    expect(uint32(midi, 4)).toBe(6);
    expect([...midi.slice(8, 14)]).toEqual([0, 1, 0, 4, 1, 224]);
    expect(ascii(midi, 14, 4)).toBe('MTrk');
    expect(ascii(midi, 26, 9)).toBe('sequens-R');
    expect(new TextDecoder().decode(midi)).toContain('Drums');
    expect(new TextDecoder().decode(midi)).toContain('Bass');
    expect(new TextDecoder().decode(midi)).toContain('Chords');
  });

  it('writes a single requested module track and rejects unsupported lengths', () => {
    const rack = createRackState(STARTER_RACK);
    const midi = createSmfType1(rack, 1, rack.modules[1]!.id);
    expect([...midi.slice(8, 14)]).toEqual([0, 1, 0, 2, 1, 224]);
    expect(() => createSmfType1(rack, 3)).toThrow(/1, 2, 4, or 8/);
  });

  it('encodes interleaved stereo PCM16 WAV with a correct RIFF size', () => {
    const left = new Float32Array([-1, 0.5]);
    const right = new Float32Array([1, -0.5]);
    const wav = encodePcm16Wav({ numberOfChannels: 2, length: 2, sampleRate: 44_100, getChannelData: (channel) => channel === 0 ? left : right });
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(wav.byteLength).toBe(52);
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
  });

  it('packages UTF-8 named stems in a valid stored ZIP directory', () => {
    const zip = createStoredZip([
      { name: '01-drums.wav', data: new Uint8Array([1, 2, 3]) },
      { name: '02-bass.wav', data: new Uint8Array([4, 5]) },
    ]);
    expect(uint32le(zip, 0)).toBe(0x04034b50);
    expect(new TextDecoder().decode(zip)).toContain('01-drums.wav');
    expect(new TextDecoder().decode(zip)).toContain('02-bass.wav');
    expect(uint32le(zip, zip.length - 22)).toBe(0x06054b50);
  });
});
