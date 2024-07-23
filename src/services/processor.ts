import {
  CHANNEL_BUFFER_PROCESSOR,
  ProcessBuffersMessage,
} from "./processor-constants";
import { SPECTROGRAM_WINDOW_SIZE } from "./spectrogram";
import { Queue } from "queue-typescript";

class CircularDataBuffer {
  private buffers: Float32Array[];
  private capacity: number; // Maximum number of Float32Array elements that can be stored
  private bufferSize: number; // Number of samples each Float32Array holds

  constructor(capacity: number, bufferSize: number) {
    this.capacity = capacity; // Total capacity in number of Float32Array blocks
    this.bufferSize = bufferSize; // This is the size of each individual buffer element
    this.buffers = [];
  }

  push(data: Float32Array): void {
    if (data.length !== this.bufferSize) {
      throw new Error("Data pushed must match the defined buffer size.");
    }

    // Add new buffer
    this.buffers.push(new Float32Array(data)); // Ensure we're copying the data
    if (this.capacity < this.buffers.length * this.bufferSize) {
      this.buffers.splice(0, this.buffers.length - this.capacity / this.bufferSize + 1);
    }
  }

  shiftAll(): Float32Array {
    const result = new Float32Array(this.buffers.length * this.bufferSize);
    for (let i = 0; i < this.buffers.length; i++) {
      result.set(this.buffers[i], i * this.bufferSize);
    }

    return result;
  }

  size(): number {
    return this.buffers.length * this.bufferSize; // Returns the number of Float32Arrays currently stored
  }
}

class depppCircularDataBuffer {
  private buffer: Float32Array[];
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  push(data: Float32Array): void {
    this.buffer.push(data);
    this.currentSize += data.length;
    while (this.currentSize > this.maxSize) {
      const removedData = this.buffer.shift()!;
      this.currentSize -= removedData.length;
    }
  }

  shift(size: number): Float32Array {
    const data = new Float32Array(size);
    let dataIdx = 0;
    while (this.buffer.length > 0 && dataIdx < size) {
      const currentData = this.buffer.shift()!;
      this.currentSize -= currentData.length;
      if (dataIdx + currentData.length <= size) {
        data.set(currentData, dataIdx);
        dataIdx += currentData.length;
      } else {
        const remainingData = currentData.subarray(0, size - dataIdx);
        data.set(remainingData, dataIdx);
        this.buffer.push(currentData.subarray(size - dataIdx));
        this.currentSize += currentData.length - (size - dataIdx);
      }
    }
    return data;
  }

  shiftAll(): Float32Array {
    const data = new Float32Array(this.currentSize);
    let dataIdx = 0;
    while (this.buffer.length > 0) {
      const currentData = this.buffer.shift()!;
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

class deppCircularDataBuffer {
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
        const remainingData = currentData.subarray(0, size - dataIdx);
        data.set(remainingData, dataIdx);
        this.buffer.enqueue(currentData.subarray(size - dataIdx));
        this.currentSize += currentData.length - (size - dataIdx);
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

class depCircularDataBuffer {
  private buffer: Float32Array;
  private maxSize: number;
  private head: number = 0;
  private currentSize: number = 0;

  constructor(capacity: number) {
    this.maxSize = capacity;
    this.buffer = new Float32Array(capacity);
  }

  push(data: Float32Array): void {
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

  shift(size: number): Float32Array {
    const output = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      output[i] = this.buffer[(this.head + i) % this.maxSize];
    }

    this.head = (this.head + size) % this.maxSize;
    this.currentSize -= size;
    return output;
  }

  size(): number {
    return this.currentSize;
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
      this.channelBuffers.push(
        new CircularDataBuffer(this.spectrogramBufferSize, 128),
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
      // Check if we have at least full window to render yet
      if (this.channelBuffers[channelIdx].size() < this.spectrogramBufferSize) {
        return;
      }

      // Merge all the buffers we have so far into a single buffer for rendering
      const buffer = this.channelBuffers[channelIdx].shiftAll();
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
