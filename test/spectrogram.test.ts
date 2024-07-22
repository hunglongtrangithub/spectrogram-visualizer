import {
  generateSpectrogram,
  SpectrogramOptions,
} from "../src/services/spectrogram";
import { expect, describe, test } from "bun:test";

describe("Spectrogram", () => {
  describe("generateSpectrogram", () => {
    test("should generate spectrogram with valid inputs", () => {
      const samples = new Float32Array([1, 2, 3, 4, 5]);
      const samplesStart = 0;
      const samplesLength = 5;
      const options: SpectrogramOptions = {
        sampleRate: 44100,
      };

      const result = generateSpectrogram(
        samples,
        samplesStart,
        samplesLength,
        options,
      );

      // Check if result is as expected
      // This will depend on your expected output
      // expect(result).to.deep.equal(/* expected result */);
    });

    test("should generate spectrogram with isStart and isEnd as true", () => {
      const samples = new Float32Array([1, 2, 3, 4, 5]);
      const samplesStart = 0;
      const samplesLength = 5;
      const options: SpectrogramOptions = {
        sampleRate: 44100,
        isStart: true,
        isEnd: true,
      };

      const result = generateSpectrogram(
        samples,
        samplesStart,
        samplesLength,
        options,
      );

      // Check if result is as expected
      // This will depend on your expected output
      // expect(result).to.deep.equal(/* expected result */);
    });
  });
});
