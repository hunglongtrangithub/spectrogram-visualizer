export const CHANNEL_BUFFER_PROCESSOR = "channel-buffer-processor";

interface MessageBase<U> {
  payload?: U;
  error?: Error;
}

export type ProcessBuffersMessage = MessageBase<{
  processedBuffers: Float32Array[];
  sampleRate: number;
  isStart: boolean;
}>;
