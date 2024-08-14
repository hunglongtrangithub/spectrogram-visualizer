import {
  CHANNEL_BUFFER_PROCESSOR,
  ProcessBuffersMessage,
} from "./processor-constants";
import { SPECTROGRAM_WINDOW_SIZE } from "./spectrogram";
import CircularDataBuffer from "./utils/processor-buffers";

class ChannelBufferProcessor extends AudioWorkletProcessor {
  private channelBuffers: CircularDataBuffer[] = [];
  private numberOfChannels: number;
  private spectrogramBufferSize: number;
  private isStart: boolean;
  private isStop: boolean;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.numberOfChannels = options?.processorOptions.numberOfChannels || 2;
    this.spectrogramBufferSize =
      options?.processorOptions.spectrogramBufferSize ||
      SPECTROGRAM_WINDOW_SIZE;
    this.isStart = true;
    this.isStop = false;

    // Initialize channel buffers
    for (let i = 0; i < this.numberOfChannels; i++) {
      this.channelBuffers.push(
        new CircularDataBuffer(this.spectrogramBufferSize),
      );
    }

    // Listen for stop message
    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        this.isStop = true;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    if (this.isStop) {
      return false;
    }
    const input = inputs[0]; // Only one input
    if (input.length === 0) {
      return true;
    }
    // Handle different number of channels
    const numberOfChannels = Math.min(input.length, this.numberOfChannels);
    for (let i = 0; i < numberOfChannels; i++) {
      this.channelBuffers[i].push(input[i]);
    }
    this.processChannelBuffers(numberOfChannels);
    return true;
  }

  private processChannelBuffers(numberOfChannels: number): void {
    const buffers: Float32Array[] = [];
    for (let channelIdx = 0; channelIdx < numberOfChannels; channelIdx += 1) {
      if (this.channelBuffers[channelIdx].size() < this.spectrogramBufferSize) {
        return;
      }

      // Merge all the buffers we have so far into a single buffer for rendering
      const buffer = this.channelBuffers[channelIdx].shift(
        this.spectrogramBufferSize,
      );
      buffers.push(buffer);
    }

    // Render the single merged buffer for each channel
    this.port.postMessage({
      payload: {
        // sampleRate lives in the AudioWorkletGlobalScope and runs on the Web Audio rendering thread, so it's safe to access it here like this
        processedBuffers: buffers,
        sampleRate: sampleRate!,
        isStart: this.isStart,
      },
    } as ProcessBuffersMessage);
    this.isStart = false;
  }
}

registerProcessor(CHANNEL_BUFFER_PROCESSOR, ChannelBufferProcessor);
