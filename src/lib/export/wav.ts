export interface AudioBufferData {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodePcm16Wav(buffer: AudioBufferData): Uint8Array {
  const channels = buffer.numberOfChannels;
  const dataLength = buffer.length * channels * 2;
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (const data of channelData) {
      const sample = Math.max(-1, Math.min(1, data[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
      offset += 2;
    }
  }
  return new Uint8Array(output);
}
