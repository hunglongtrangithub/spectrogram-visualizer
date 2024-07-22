import { generateSpectrogram } from "./spectrogram";
import {
  ACTION_COMPUTE_SPECTROGRAM,
  ComputeSpectrogramMessage,
  Message,
} from "./worker-constants";
const ctx: Worker = self as any;

ctx.onmessage = (event: { data: Message["request"] }) => {
  const {
    data: { action, payload },
  } = event;

  switch (action) {
    case ACTION_COMPUTE_SPECTROGRAM: {
      const { samplesBuffer, samplesStart, samplesLength, options } =
        payload as ComputeSpectrogramMessage["request"]["payload"];

      try {
        const samples = new Float32Array(samplesBuffer);
        const {
          windowCount: spectrogramWindowCount,
          options: spectrogramOptions,
          spectrogramData: spectrogram,
        } = generateSpectrogram(samples, samplesStart, samplesLength, options);
        const spectrogramBuffer = spectrogram.buffer as ArrayBuffer;
        const inputBuffer = samples.buffer as ArrayBuffer;
        const response: ComputeSpectrogramMessage["response"] = {
          payload: {
            spectrogramWindowCount,
            spectrogramOptions,
            spectrogramBuffer,
            inputBuffer,
          },
        };
        ctx.postMessage(response, [spectrogramBuffer, inputBuffer]);
      } catch (error) {
        const response: ComputeSpectrogramMessage["response"] = {
          error: error as Error,
        };
        ctx.postMessage(response);
      }

      break;
    }
    default:
      ctx.postMessage({
        error: new Error("Unknown action"),
      });
      break;
  }
};

export {};
