import {
  CHANNEL_BUFFER_PROCESSOR,
  ProcessBuffersMessage,
} from "./processor-constants";
import { SPECTROGRAM_WINDOW_SIZE } from "./spectrogram";
import { Queue } from "queue-typescript";

class CircularDataBuffer {
  private buffer: Queue<Float32Array>;
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Queue<Float32Array>();
  }

  push(data: Float32Array): void {
    this.buffer.enqueue(data);
    this.currentSize += data.length;
    while (this.currentSize > this.maxSize) {
      const removedData = this.buffer.dequeue();
      this.currentSize -= removedData.length;
    }
  }

  shift(size: number): Float32Array {
    const data = new Float32Array(size);
    let dataIdx = 0;
    while (this.buffer.length > 0 && dataIdx < size) {
      const currentData = this.buffer.dequeue();
      this.currentSize -= currentData.length;
      if (dataIdx + currentData.length <= size) {
        data.set(currentData, dataIdx);
        dataIdx += currentData.length;
      } else {
        break;
      }
    }
    return data;
  }

  shiftAll(): Float32Array {
    const data = new Float32Array(this.currentSize);
    let dataIdx = 0;
    while (this.buffer.length > 0) {
      const currentData = this.buffer.dequeue();
      this.currentSize -= currentData.length;
      data.set(currentData, dataIdx);
      dataIdx += currentData.length;
    }
    return data;
  }

  size(): number {
    return this.currentSize;
  }
}

class ChannelBufferProcessor extends AudioWorkletProcessor {
  private channelBuffers: CircularDataBuffer[] = [];
  private processedBuffers: Float32Array[] = [];
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
      // Each channel buffer has the size of the spectrogram buffer size
      this.channelBuffers.push(
        new CircularDataBuffer(this.spectrogramBufferSize),
      );
      // Initialize each processed buffer with empty buffers
      this.processedBuffers.push(new Float32Array(this.spectrogramBufferSize));
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
    const numberOfChannels = Math.min(this.numberOfChannels, input.length);

    try {
      for (let i = 0; i < numberOfChannels; i++) {
        this.channelBuffers[i].push(input[i]);
        if (this.channelBuffers[i].size() < this.spectrogramBufferSize) {
          continue;
        }
        this.processedBuffers[i] = this.channelBuffers[i].shift(
          this.spectrogramBufferSize,
        );
      }

      this.port.postMessage({
        payload: {
          // sampleRate lives in the AudioWorkletGlobalScope and runs on the Web Audio rendering thread, so it's safe to access it here like this
          processedBuffers: this.processedBuffers,
          sampleRate: sampleRate!,
          isStart: this.isStart,
        },
      } as ProcessBuffersMessage);
      this.isStart = false;
    } catch (error) {
      this.port.postMessage({ error });
    }

    return true;
  }
}

registerProcessor(CHANNEL_BUFFER_PROCESSOR, ChannelBufferProcessor);
