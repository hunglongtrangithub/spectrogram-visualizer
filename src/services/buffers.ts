import { Queue } from "queue-typescript";

// Moderately fast, has to know the size of the input audio buffer in advance
class FixedBufferSizeArrayCircularDataBuffer {
  private buffers: Float32Array[];
  private capacity: number; // Maximum number of Float32Array elements that can be stored
  private bufferSize: number = 128; // Number of samples each Float32Array holds

  constructor(capacity: number) {
    this.capacity = capacity; // Total capacity in number of Float32Array blocks
    this.buffers = [];
  }

  push(data: Float32Array): void {
    if (data.length !== this.bufferSize) {
      throw new Error("Data pushed must match the defined buffer size.");
    }

    // Add new buffer
    this.buffers.push(new Float32Array(data)); // Ensure we're copying the data
    if (this.capacity < this.buffers.length * this.bufferSize) {
      this.buffers.splice(
        0,
        this.buffers.length - this.capacity / this.bufferSize + 1,
      );
    }
  }
  
  shift(size: number): Float32Array {
    const result = new Float32Array(size);
    let resultIdx = 0;
    for (let i = 0; i < this.buffers.length; i++) {
      const currentBuffer = this.buffers[i];
      if (resultIdx + currentBuffer.length <= size) {
        result.set(currentBuffer, resultIdx);
        resultIdx += currentBuffer.length;
      } else {
        const remainingData = currentBuffer.subarray(0, size - resultIdx);
        result.set(remainingData, resultIdx);
        this.buffers[i] = currentBuffer.subarray(size - resultIdx);
        break;
      }
    }

    return result;
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

// Fast, but shifts in O(n) time
class ArrayCircularDataBuffer {
  private buffer: Float32Array[];
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  push(data: Float32Array): void {
    this.buffer.push(new Float32Array(data));
    this.currentSize += data.length;
    while (this.currentSize > this.maxSize) {
      const removedData = this.buffer.shift()!;
      this.currentSize -= removedData.length;
    }
  }

  shift(size: number): Float32Array {
    const data = new Float32Array(size);
    let dataIdx = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const currentData = this.buffer[i];
      if (dataIdx + currentData.length <= size) {
        data.set(currentData, dataIdx);
        dataIdx += currentData.length;
      } else {
        const remainingData = currentData.subarray(0, size - dataIdx);
        data.set(remainingData, dataIdx);
        this.buffer[i] = currentData.subarray(size - dataIdx);
        break;
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

// Fastest, dequeues in O(1) time
class QueueCircularDataBuffer {
  private queue: Queue<Float32Array>;
  private capacity: number; // Maximum number of samples that can be stored
  private currentSize: number = 0; // Current number of samples stored

  constructor(capacity: number) {
    this.capacity = capacity;
    this.queue = new Queue<Float32Array>();
  }

  push(data: Float32Array): void {
    this.currentSize += data.length;
    this.queue.enqueue(new Float32Array(data));

    // Ensure total size does not exceed capacity
    while (this.currentSize > this.capacity) {
      const removed = this.queue.dequeue();
      this.currentSize -= removed.length;
    }
  }

  shift(size: number): Float32Array {
    const result = new Float32Array(size);
    let resultIdx = 0;
    const buffers = this.queue.toArray();
    for (let i = 0; i < buffers.length; i++) {
      const currentBuffer = buffers[i];
      if (resultIdx + currentBuffer.length <= size) {
        result.set(currentBuffer, resultIdx);
        resultIdx += currentBuffer.length;
      } else {
        const remainingData = currentBuffer.subarray(0, size - resultIdx);
        result.set(remainingData, resultIdx);
        this.queue.dequeue();
        this.currentSize -= currentBuffer.length;
        break;
      }
    }
    return result;
  }

  shiftAll(): Float32Array {
    const result = new Float32Array(this.currentSize);
    const buffers = this.queue.toArray();
    let resultIdx = 0;
    for (let i = 0; i < buffers.length; i++) {
      result.set(buffers[i], resultIdx);
      resultIdx += buffers[i].length;
    }
    return result;
  }

  size(): number {
    return this.currentSize;
  }
}

// Slow 
class Float32ArrayCircularDataBuffer {
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

export default QueueCircularDataBuffer;