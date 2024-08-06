import { FFT } from "jsfft";

import {
  blackmanHarris,
  hzToMel,
  inverseLerp,
  lerp,
  melToHz,
  nyquistFrequency,
} from "./math-util";

export type Scale = "linear" | "mel";
export const SPECTROGRAM_WINDOW_SIZE = 4096;
export const SPECTROGRAM_WINDOW_STEPSIZE = 1024;

export interface SpectrogramOptions {
  isStart?: boolean;
  isEnd?: boolean;
  windowSize?: number;
  windowStepSize?: number;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  sampleRate: number;
  scale?: Scale;
  scaleSize?: number;
}

export interface SpectrogramResult {
  windowCount: number;
  options: Required<SpectrogramOptions>;
  spectrogramData: Float32Array;
}

// Helper function to calculate the spectrogram for a single frame
// When minFrequencyHz > maxFrequencyHz, the resultBuffer will be filled in the reverse order: larger index -> lower frequency
function generateSpectrogramForSingleFrame(
  windowSamples: Float32Array,
  resultBuffer: Float32Array,
  resultBufferIndex: number,
  minFrequencyHz: number,
  maxFrequencyHz: number,
  sampleRate: number,
  scale: Scale,
  scaleSize: number,
) {
  // Apply a Blackman-Harris windowing function to the input
  for (let i = 0; i < windowSamples.length; i += 1) {
    windowSamples[i] *= blackmanHarris(i, windowSamples.length);
  }

  const fft = FFT(windowSamples);
  for (let j = 0; j < scaleSize; j += 1) {
    const scaleAmount = inverseLerp(0, scaleSize - 1, j);
    let freqIdx; // The estimated index of the frequency in the FFT result
    switch (scale) {
      case "linear": {
        const hz = lerp(minFrequencyHz, maxFrequencyHz, scaleAmount);
        freqIdx = (hz * windowSamples.length) / sampleRate;
        break;
      }
      case "mel": {
        const mel = lerp(
          hzToMel(minFrequencyHz),
          hzToMel(maxFrequencyHz),
          scaleAmount,
        );
        freqIdx = (melToHz(mel) * windowSamples.length) / sampleRate;
        break;
      }
      default:
        throw new Error("Unknown scale");
    }

    const lowerFreqIdx = Math.floor(freqIdx);
    const upperFreqIdx = Math.ceil(freqIdx);

    const amplitude =
      lerp(
        Math.sqrt(fft.real[lowerFreqIdx] ** 2 + fft.imag[lowerFreqIdx] ** 2),
        Math.sqrt(fft.real[upperFreqIdx] ** 2 + fft.imag[upperFreqIdx] ** 2),
        freqIdx - lowerFreqIdx,
      ) / Math.sqrt(windowSamples.length); // NOTE: Why divide by the window size?

    resultBuffer[resultBufferIndex + j] = amplitude;
  }
}

// Generate spectrogram for the given audio samples at the given start index and length
// NOTE: when isStart or isEnd are false:
// if samplesLength <= windowSize - windowStepSize, numWindows <= 0
// if windowSize - windowStepSize < samplesLength <= windowSize, numWindows = 1
// Make sure that samplesLength is larger than windowSize - windowStepSize, otherwise the function won't render any window
export function generateSpectrogram(
  samples: Float32Array, // The whole audio samples
  samplesStart: number, // The start index in the audio samples to calculate the spectrogram for
  samplesLength: number, // The length of the audio samples to calculate the spectrogram for
  {
    isStart = false, // Is the frame at the start of the audio
    isEnd = false, // Is the frame at the end of the audio
    windowSize = SPECTROGRAM_WINDOW_SIZE, // Size of the FFT window in samples
    windowStepSize = SPECTROGRAM_WINDOW_STEPSIZE, // Number of samples between each FFT window
    minFrequencyHz, // Smallest frequency in Hz to calculate the spectrogram for
    maxFrequencyHz, // Largest frequency in Hz to calculate the spectrogram for
    sampleRate, // Sample rate of the audio
    scale = "linear", // Scale of the returned spectrogram (can be 'linear' or 'mel')
    scaleSize, // Number of rows in the returned spectrogram
  }: SpectrogramOptions,
): SpectrogramResult {
  if (minFrequencyHz === undefined) {
    minFrequencyHz = 0;
  }
  if (maxFrequencyHz === undefined) {
    maxFrequencyHz = nyquistFrequency(sampleRate, windowSize);
  }
  if (scaleSize === undefined) {
    scaleSize = windowSize / 2;
  }

  let numWindows = Math.ceil((samplesLength - windowSize) / windowStepSize + 1);
  if (numWindows < 0) {
    numWindows = 0;
  }
  let startIdx = samplesStart;

  if (isStart || isEnd) {
    // Pad the spectrogram with 1 additional window if it is at the start or end
    const additionalWindows = Math.floor(windowSize / windowStepSize);
    if (isStart) {
      // Pad at the start
      numWindows += additionalWindows;
      startIdx -= additionalWindows * windowStepSize;
    }
    if (isEnd) {
      // Pad at the end
      numWindows += additionalWindows;
    }
  }

  // The result buffer to store the spectrograms.
  // NOTE: scaleSize is the number of rows in the spectrogram, numWindows is the number of columns. Will be fed to the Circular2DDataBuffer
  const result = new Float32Array(scaleSize * numWindows);

  // The buffer to store the samples for the current window in each iteration
  const windowSamples = new Float32Array(windowSize);
  // i is the start index of the window, windowIdx is the index of the window in the result
  for (
    let i = startIdx, windowIdx = 0;
    windowIdx < numWindows * scaleSize;
    i += windowStepSize, windowIdx += scaleSize
  ) {
    // Fill the window with samples
    for (let j = 0; j < windowSize; j += 1) {
      const sampleIdx = i + j;
      if (
        sampleIdx < samplesStart ||
        sampleIdx >= samplesStart + samplesLength
      ) {
        // Pad with zeros if the sample is outside the range
        windowSamples[j] = 0;
      } else {
        windowSamples[j] = samples[sampleIdx];
      }
    }

    // This will calculate and store the spectrogram for the current window at index windowIdx with length scaleSize
    generateSpectrogramForSingleFrame(
      windowSamples,
      result,
      windowIdx,
      minFrequencyHz,
      maxFrequencyHz,
      sampleRate,
      scale,
      scaleSize,
    );
  }

  return {
    windowCount: numWindows,
    options: {
      isStart,
      isEnd,
      windowSize,
      windowStepSize,
      minFrequencyHz,
      maxFrequencyHz,
      sampleRate,
      scale,
      scaleSize,
    },
    spectrogramData: result,
  };
}
