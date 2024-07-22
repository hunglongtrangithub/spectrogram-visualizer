import {
  CHANNEL_BUFFER_PROCESSOR,
  ProcessBuffersMessage,
} from "./processor-constants";
import { SPECTROGRAM_WINDOW_SIZE } from "./spectrogram";

class CircularDataBuffer {
  private buffer: Float32Array;
  private maxSize: number;
  private head: number = 0;
  private currentSize: number = 0;

  constructor(capacity: number) {
    this.maxSize = capacity;
    this.buffer = new Float32Array(capacity);
  }

  enqueue(data: Float32Array): void {
    for (let i = 0; i < data.length; i++) {
      const index = (this.head + this.currentSize) % this.maxSize;
      this.buffer[index] = data[i];
      if (this.currentSize < this.maxSize) {
        this.currentSize++;
      } else {
        // If the buffer is full, move the head forward to overwrite the oldest data
        // Keep the count the same
        this.head = (this.head + 1) % this.maxSize;
      }
    }
  }

  dequeue(n: number): void {
    if (n > this.currentSize) {
      throw new Error("Not enough elements in the buffer");
    }

    this.head = (this.head + n) % this.maxSize;
    this.currentSize -= n;
  }

  read(n: number): Float32Array {
    if (n > this.currentSize) {
      throw new Error("Not enough elements in the buffer");
    }

    const output = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      output[i] = this.buffer[(this.head + i) % this.maxSize];
    }

    return output;
  }

  size(): number {
    return this.currentSize;
  }

  isFull(): boolean {
    return this.currentSize === this.maxSize;
  }

  isEmpty(): boolean {
    return this.currentSize === 0;
  }
}

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
      // Each channel buffer has the size of the spectrogram buffer size * 2
      this.channelBuffers.push(new CircularDataBuffer(this.spectrogramBufferSize * 2));
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
    for (let i = 0; i < Math.min(this.numberOfChannels, input.length); i++) {
      const channelData = input[i];
      this.channelBuffers[i].enqueue(channelData);
    }
    // If input has less channels than the processor, fill the rest with empty buffers with the size of channelData
    const channelDataSize = input[0].length; // All channels have the same size
    for (
      let i = Math.min(this.numberOfChannels, input.length);
      i < this.numberOfChannels;
      i++
    ) {
      this.channelBuffers[i].enqueue(new Float32Array(channelDataSize));
    }

    try {
      const buffers: Float32Array[] = [];
      for (let i = 0; i < this.numberOfChannels; i++) {
        if (this.channelBuffers[i].size() < this.spectrogramBufferSize) {
          continue;
        }
        buffers.push(this.channelBuffers[i].read(this.spectrogramBufferSize));
        this.channelBuffers[i].dequeue(this.spectrogramBufferSize);
      }

      if (buffers.length > 0) {
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
    } catch (error) {
      this.port.postMessage({ error });
    }

    return true;
  }
}

registerProcessor(CHANNEL_BUFFER_PROCESSOR, ChannelBufferProcessor);
