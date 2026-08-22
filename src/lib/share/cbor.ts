export type CborValue = number | boolean | null | string | readonly CborValue[];

function pushUnsigned(bytes: number[], major: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('CBOR integer must be unsigned and safe.');
  const prefix = major << 5;
  if (value < 24) bytes.push(prefix | value);
  else if (value <= 0xff) bytes.push(prefix | 24, value);
  else if (value <= 0xffff) bytes.push(prefix | 25, value >>> 8, value & 0xff);
  else if (value <= 0xffffffff) {
    bytes.push(prefix | 26, value >>> 24, value >>> 16 & 0xff, value >>> 8 & 0xff, value & 0xff);
  } else {
    throw new RangeError('The compact patch encoder only supports uint32 values.');
  }
}

function encodeValue(bytes: number[], value: CborValue): void {
  if (value === null) {
    bytes.push(0xf6);
  } else if (typeof value === 'boolean') {
    bytes.push(value ? 0xf5 : 0xf4);
  } else if (typeof value === 'number') {
    pushUnsigned(bytes, 0, value);
  } else if (typeof value === 'string') {
    const encoded = new TextEncoder().encode(value);
    pushUnsigned(bytes, 3, encoded.length);
    bytes.push(...encoded);
  } else {
    pushUnsigned(bytes, 4, value.length);
    for (const item of value) encodeValue(bytes, item);
  }
}

export function encodeCbor(value: CborValue): Uint8Array {
  const bytes: number[] = [];
  encodeValue(bytes, value);
  return Uint8Array.from(bytes);
}

class Reader {
  readonly #bytes: Uint8Array;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  get done(): boolean {
    return this.#offset === this.#bytes.length;
  }

  #take(): number {
    const value = this.#bytes[this.#offset];
    if (value === undefined) throw new RangeError('Unexpected end of CBOR payload.');
    this.#offset += 1;
    return value;
  }

  #readLength(additional: number): number {
    if (additional < 24) return additional;
    if (additional === 24) return this.#take();
    if (additional === 25) return this.#take() * 0x100 + this.#take();
    if (additional === 26) {
      return (this.#take() * 0x1000000 + this.#take() * 0x10000 + this.#take() * 0x100 + this.#take()) >>> 0;
    }
    throw new RangeError('Unsupported CBOR length encoding.');
  }

  read(): CborValue {
    const initial = this.#take();
    if (initial === 0xf4) return false;
    if (initial === 0xf5) return true;
    if (initial === 0xf6) return null;

    const major = initial >>> 5;
    const length = this.#readLength(initial & 0x1f);
    if (major === 0) return length;
    if (major === 3) {
      const end = this.#offset + length;
      if (end > this.#bytes.length) throw new RangeError('Unexpected end of CBOR string.');
      const value = new TextDecoder().decode(this.#bytes.subarray(this.#offset, end));
      this.#offset = end;
      return value;
    }
    if (major === 4) {
      const values: CborValue[] = [];
      for (let index = 0; index < length; index += 1) values.push(this.read());
      return values;
    }
    throw new RangeError(`Unsupported CBOR major type ${major}.`);
  }
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const reader = new Reader(bytes);
  const value = reader.read();
  if (!reader.done) throw new RangeError('Trailing bytes after CBOR payload.');
  return value;
}
