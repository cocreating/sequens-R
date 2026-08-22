export type RandomSource = () => number;

export function sfc32(seed: number): RandomSource {
  let a = seed ^ 0x9e3779b9;
  let b = seed ^ 0x243f6a88;
  let c = seed ^ 0xb7e15162;
  let d = 1;

  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = ((a + b) | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function randomInt(random: RandomSource, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function choose<T>(random: RandomSource, values: readonly T[]): T {
  if (values.length === 0) throw new RangeError('Cannot choose from an empty collection.');
  return values[Math.floor(random() * values.length)]!;
}
