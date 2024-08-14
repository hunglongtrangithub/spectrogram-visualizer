import { FFT } from "jsfft";

import {
  hzToMel,
  inverseLerp,
  lerp,
  melToHz,
  nyquistFrequency,
  getNumWindows,
} from "./utils/math-util";

import { WindowFunctionName, window } from "./utils/fft-windowing";

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
  windowFunction?: WindowFunctionName;
}

export interface SpectrogramResult {
  windowCount: number;
  options: Required<SpectrogramOptions>;
  spectrogramData: Float32Array;
}

/**
 * Helper function to calculate the spectrogram for a single frame.
 *
 * @param {Float32Array} windowSamples - The audio samples for the current frame.
 * @param {Float32Array} resultBuffer - The buffer to store the spectrogram result.
 * @param {number} resultBufferIndex - The start index in the result buffer.
 * @param {number} minFrequencyHz - The minimum frequency to calculate the spectrogram for.
 * @param {number} maxFrequencyHz - The maximum frequency to calculate the spectrogram for.
 * @param {number} sampleRate - The sample rate of the audio.
 * @param {Scale} scale - The scale to use for the spectrogram.
 * @param {number} scaleSize - The size of the scale.
 * @param {WindowFunctionName} windowFunction - The windowing function to apply to the samples.
 *
 * When minFrequencyHz > maxFrequencyHz, the resultBuffer will be filled in the reverse order: larger index -> lower frequency.
 */
function generateSpectrogramForSingleFrame(
  windowSamples: Float32Array,
  resultBuffer: Float32Array,
  resultBufferIndex: number,
  minFrequencyHz: number,
  maxFrequencyHz: number,
  sampleRate: number,
  scale: Scale,
  scaleSize: number,
  windowFunction: WindowFunctionName,
) {
  // Apply a windowing function to the input
  windowSamples = window(windowFunction, windowSamples);

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

/**
 * Generate spectrogram for the given audio samples at the given start index and length.
 *
 * @param {Float32Array} samples - The whole audio samples.
 * @param {number} samplesStart - The start index in the audio samples to calculate the spectrogram for.
 * @param {number} samplesLength - The length of the audio samples to calculate the spectrogram for.
 * @param {Object} options - The options for generating the spectrogram.
 * @param {boolean} [options.isStart=false] - Is the frame at the start of the audio.
 * @param {boolean} [options.isEnd=false] - Is the frame at the end of the audio.
 * @param {number} [options.windowSize=SPECTROGRAM_WINDOW_SIZE] - Size of the FFT window in samples.
 * @param {number} [options.windowStepSize=SPECTROGRAM_WINDOW_STEPSIZE] - Number of samples between each FFT window.
 * @param {number} options.minFrequencyHz - Smallest frequency in Hz to calculate the spectrogram for.
 * @param {number} options.maxFrequencyHz - Largest frequency in Hz to calculate the spectrogram for.
 * @param {number} options.sampleRate - Sample rate of the audio.
 * @param {string} [options.scale="linear"] - Scale of the returned spectrogram (can be 'linear' or 'mel').
 * @param {number} options.scaleSize - Number of rows in the returned spectrogram.
 * @param {string} [options.windowFunction="hann"] - The windowing function to apply to the samples before calculating the FFT.
 * @returns {SpectrogramResult} The result of the spectrogram generation.
 *
 * When isStart or isEnd are false:
 * - if samplesLength <= windowSize - windowStepSize, numWindows <= 0
 * - if windowSize - windowStepSize < samplesLength <= windowSize, numWindows = 1
 * - Make sure that samplesLength is larger than windowSize - windowStepSize, otherwise the function won't render any window.
 */
export function generateSpectrogram(
  samples: Float32Array,
  samplesStart: number,
  samplesLength: number,
  {
    isStart = false,
    isEnd = false,
    windowSize = SPECTROGRAM_WINDOW_SIZE,
    windowStepSize = SPECTROGRAM_WINDOW_STEPSIZE,
    minFrequencyHz,
    maxFrequencyHz,
    sampleRate,
    scale = "linear",
    scaleSize,
    windowFunction = "hann",
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

  let numWindows = getNumWindows(samplesLength, windowSize, windowStepSize);

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
      windowFunction,
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
      windowFunction,
    },
    spectrogramData: result,
  };
}
