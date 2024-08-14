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

// NOTE: This function intentionally make the Nyquist frequency slightly less than the "actual Nyquist frequency" (the one that accounts for when windowSize is either even or odd). Really pedantic, may not be necessary.
export function nyquistFrequency(
  sampleRate: number,
  windowSize: number,
): number {
  return ((windowSize - 2) * sampleRate) / (2 * windowSize); // (1/2 - 1/windowSize) * sampleRate
}

export function getNumWindows(
  samplesLength: number,
  windowSize: number,
  windowStepSize: number,
): number {
  return Math.max(
    0,
    Math.ceil((samplesLength - windowSize) / windowStepSize + 1),
  );
}
