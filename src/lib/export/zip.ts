export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface PreparedEntry extends ZipEntry {
  nameBytes: Uint8Array;
  checksum: number;
  localOffset: number;
}

export function createStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new RangeError('A ZIP can contain at most 65535 stems.');
  const encoder = new TextEncoder();
  let localSize = 0;
  const prepared: PreparedEntry[] = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    if (nameBytes.length > 0xffff) throw new RangeError('ZIP entry name is too long.');
    const result = { ...entry, nameBytes, checksum: crc32(entry.data), localOffset: localSize };
    localSize += 30 + nameBytes.length + entry.data.length;
    return result;
  });
  const centralSize = prepared.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  const u16 = (value: number): void => { view.setUint16(offset, value, true); offset += 2; };
  const u32 = (value: number): void => { view.setUint32(offset, value, true); offset += 4; };
  const bytes = (value: Uint8Array): void => { output.set(value, offset); offset += value.length; };

  for (const entry of prepared) {
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(0); u16(0);
    u32(entry.checksum); u32(entry.data.length); u32(entry.data.length); u16(entry.nameBytes.length); u16(0);
    bytes(entry.nameBytes); bytes(entry.data);
  }
  for (const entry of prepared) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(0);
    u32(entry.checksum); u32(entry.data.length); u32(entry.data.length); u16(entry.nameBytes.length);
    u16(0); u16(0); u16(0); u16(0); u32(0); u32(entry.localOffset); bytes(entry.nameBytes);
  }
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
  u32(centralSize); u32(localSize); u16(0);
  return output;
}
