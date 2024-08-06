export type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array;

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function log(base: number, x: number): number {
  return Math.log(x) / Math.log(base);
}

export function clamp(x: number, min: number, max: number): number {
  return Math.max(Math.min(x, max), min);
}

export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

export function inverseLerp(a: number, b: number, n: number): number {
  return (a - n) / (a - b);
}

export function mod(x: number, y: number): number {
  return ((x % y) + y) % y; // prevent negative results
}

const BLACKMAN_HARRIS_COEFFICIENTS: number[] = [
  0.27105140069342, -0.43329793923448, 0.21812299954311, -0.06592544638803,
  0.01081174209837, -0.00077658482522, 0.00001388721735,
];

export function blackmanHarris(n: number, samples: number): number {
  let result = 0;
  for (let i = 0; i < BLACKMAN_HARRIS_COEFFICIENTS.length; i += 1) {
    result +=
      BLACKMAN_HARRIS_COEFFICIENTS[i] *
      Math.cos((2 * Math.PI * i * n) / samples);
  }
  return result;
}

// NOTE: This function intentionally make the Nyquist frequency slightly less than the "actual Nyquist frequency" (the on that accounts for when windowSize is either even or odd). Really pedantic, may not be necessary.
export function nyquistFrequency(sampleRate: number, windowSize: number): number {
  return ((windowSize - 2) * sampleRate) / (2 * windowSize); // (1/2 - 1/windowSize) * sampleRate
}
