import debounce from "lodash.debounce";
import { toast } from "react-toastify";

import { Circular2DDataBuffer } from "./spectrogram-render";
import { SpectrogramGPURenderer, RenderParameters } from "./spectrogram-render";
import { offThreadGenerateSpectrogram } from "./worker-util";
import {
  CHANNEL_BUFFER_PROCESSOR,
  ProcessBuffersMessage,
} from "./processor-constants";
import processorUrl from "./processor.ts?url";
import {
  SPECTROGRAM_WINDOW_SIZE,
  SPECTROGRAM_WINDOW_STEPSIZE,
} from "./spectrogram";

interface SpectrogramBufferData {
  buffer: Float32Array;
  start: number;
  length: number;
  sampleRate: number;
  isStart: boolean;
}

export class SpectrogramVisualizer {
  private canvas: HTMLCanvasElement;
  private renderer: SpectrogramGPURenderer;
  private spectrogramBuffer: Circular2DDataBuffer<Float32Array>;
  private readonly spectrogramScaleSize: number;
  private readonly spectrogramWindowSize: number;
  private readonly spectrogramWindowStepSize: number;
  private imageDirty: boolean = false;

  constructor(
    canvas: HTMLCanvasElement,
    spectrogramWindowSize: number = SPECTROGRAM_WINDOW_SIZE,
    spectrogramWindowStepSize: number = SPECTROGRAM_WINDOW_STEPSIZE,
    spectrogramScaleSize: number,
  ) {
    this.canvas = canvas;
    if (this.canvas.parentElement === null) {
      throw new Error("Canvas must be within a parent element");
    }
    this.spectrogramWindowSize = spectrogramWindowSize;
    this.spectrogramWindowStepSize = spectrogramWindowStepSize;
    this.spectrogramScaleSize =
      spectrogramScaleSize || spectrogramWindowSize / 2;

    this.spectrogramBuffer = new Circular2DDataBuffer(
      Float32Array,
      this.canvas.parentElement.offsetWidth,
      this.spectrogramScaleSize,
      1,
    );

    this.renderer = new SpectrogramGPURenderer(
      this.canvas,
      this.spectrogramBuffer.numColumns,
      this.spectrogramBuffer.numRows,
    );

    this.renderer.resizeCanvas(
      this.canvas.parentElement.offsetWidth,
      this.canvas.parentElement.offsetHeight,
    );

    this.startRendering();
  }

  private startRendering(): void {
    const render = () => {
      if (this.imageDirty) {
        this.renderer.updateSpectrogram(this.spectrogramBuffer);
        this.imageDirty = false;
      }
      this.renderer.render();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  public async updateSpectrogramBuffer(
    bufferData: SpectrogramBufferData,
  ): Promise<Float32Array> {
    this.renderer.updateParameters({
      windowSize: this.spectrogramWindowSize,
      sampleRate: bufferData.sampleRate,
    });
    try {
      const spectrogram = await offThreadGenerateSpectrogram(
        bufferData.buffer,
        bufferData.start,
        bufferData.length,
        {
          windowSize: this.spectrogramWindowSize,
          windowStepSize: this.spectrogramWindowStepSize,
          scaleSize: this.spectrogramScaleSize,
          sampleRate: bufferData.sampleRate,
          isStart: bufferData.isStart,
        },
      );
      this.spectrogramBuffer.enqueue(spectrogram.spectrogramData);
      this.imageDirty = true;

      return spectrogram.input;
    } catch (e) {
      this.imageDirty = false;
      console.error(`Failed to generate spectrogram: ${e}`);
      throw new Error(`Failed to generate spectrogram: ${e}`);
    }
  }

  public clearSpectrogram(): void {
    this.spectrogramBuffer.clear();
    this.renderer.updateSpectrogram(this.spectrogramBuffer, true);
  }

  public updateRenderParameters(parameters: Partial<RenderParameters>): void {
    this.renderer.updateParameters(parameters);
  }

  public resize(): void {
    if (this.canvas.parentElement) {
      this.spectrogramBuffer.resizeWidth(this.canvas.parentElement.offsetWidth);
      this.renderer.resizeCanvas(
        this.canvas.parentElement.offsetWidth,
        this.canvas.parentElement.offsetHeight,
      );
      this.renderer.updateSpectrogram(this.spectrogramBuffer);
    }
  }

  public fastResize(): void {
    if (this.canvas.parentElement) {
      this.renderer.fastResizeCanvas(
        this.canvas.parentElement.offsetWidth,
        this.canvas.parentElement.offsetHeight,
      );
    }
  }
}

export default class SpectrogramManager {
  private readonly visualizers: SpectrogramVisualizer[] = [];
  private readonly numberOfChannels: number;
  private readonly spectrogramScaleSize: number;
  private readonly spectrogramWindowSize: number;
  private readonly spectrogramWindowStepSize: number;
  private stopCallback: (() => void) | null = null;

  constructor(
    canvases: (HTMLCanvasElement | null)[],
    spectrogramWindowSize: number = SPECTROGRAM_WINDOW_SIZE,
    spectrogramWindowStepSize: number = SPECTROGRAM_WINDOW_STEPSIZE,
    spectrogramScaleSize?: number,
  ) {
    this.initializeVisualizers(canvases);
    this.numberOfChannels = this.visualizers.length;
    this.spectrogramWindowSize = spectrogramWindowSize;
    this.spectrogramWindowStepSize = spectrogramWindowStepSize;
    this.spectrogramScaleSize =
      spectrogramScaleSize || spectrogramWindowSize / 2; // Nyquist frequency
    console.log(`Number of visualizers: ${this.numberOfChannels}`);
  }

  private initializeVisualizers(canvases: (HTMLCanvasElement | null)[]): void {
    canvases.forEach((canvas) => {
      if (canvas !== null && canvas.parentElement !== null) {
        try {
          this.visualizers.push(
            new SpectrogramVisualizer(
              canvas,
              this.spectrogramWindowSize,
              this.spectrogramWindowStepSize,
              this.spectrogramScaleSize,
            ),
          );
        } catch (e) {
          console.error(
            `Failed to initialize visualizer on canvas id ${canvas.id}: ${e}`,
          );
          toast.error(
            `Failed to initialize visualizer on canvas id ${canvas.id}: ${e}`,
          );
        }
      }
    });
    window.addEventListener(
      "resize",
      debounce(() => {
        this.visualizers.forEach((visualizer) => {
          visualizer.resize();
        });
      }, 250),
    );
    window.addEventListener("resize", () => {
      this.visualizers.forEach((visualizer) => {
        visualizer.fastResize();
      });
    });
  }

  public stop(): void {
    if (this.stopCallback !== null) {
      this.stopCallback();
    }
    this.stopCallback = null;
  }

  public clearSpectrogram(): void {
    this.visualizers.forEach((visualizer) => {
      visualizer.clearSpectrogram();
    });
  }

  public updateRenderParameters(parameters: Partial<RenderParameters>): void {
    this.visualizers.forEach((visualizer) => {
      visualizer.updateRenderParameters(parameters);
    });
  }

  public async setupSpectrogramFromAudioFile(
    audioCtx: AudioContext,
    arrayBuffer: ArrayBuffer,
    audioEndCallback: () => void,
  ): Promise<void> {
    // Decode the audio buffer
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) =>
      audioCtx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err),
      ),
    );
    console.log(
      `Audio duration: ${audioBuffer.duration}s. Sample rate: ${audioBuffer.sampleRate}Hz.`,
    );

    // Handling different number of channels
    const numberOfActualChannels = Math.min(
      audioBuffer.numberOfChannels,
      this.numberOfChannels,
    );

    // Create an AudioWorkletNode to process the audio
    await audioCtx.audioWorklet.addModule(processorUrl);
    const processorNode = new AudioWorkletNode(
      audioCtx,
      CHANNEL_BUFFER_PROCESSOR,
      {
        processorOptions: {
          numberOfChannels: numberOfActualChannels,
          spectrogramBufferSize: this.spectrogramWindowSize,
        },
      },
    );

    // Set up the message handler to update the spectrogram
    processorNode.port.onmessage = async (
      event: MessageEvent<Required<ProcessBuffersMessage>>,
    ) => {
      const { processedBuffers, sampleRate, isStart } = event.data.payload;
      if (processedBuffers.length > 0) {
        console.log(`Processing ${processedBuffers[0].length} samples`);
        await Promise.all(
          processedBuffers.map((buffer, i) =>
            this.visualizers[i].updateSpectrogramBuffer({
              buffer,
              start: 0,
              length: buffer.length,
              sampleRate: sampleRate,
              isStart: isStart,
            }),
          ),
        );
      }
    };

    // Create an AudioBufferSourceNode to play the audio
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.onended = () => {
      // the processor will automatically stop processing when the audio ends
      console.log("disconnecting from audio end callback");
      audioEndCallback();
    };

    // Establish the audio graph
    source.connect(processorNode);
    source.connect(audioCtx.destination);

    // Play audio
    audioCtx.resume();
    source.start(0);

    // Assign a function to stop rendering
    this.stopCallback = () => {
      // signal the processor to stop processing
      console.log("disconnecting from stop callback");
      processorNode.port.postMessage("stop");
      source.disconnect();
    };
  }

  public async setupSpectrogramFromMicrophone(
    audioCtx: AudioContext,
  ): Promise<void> {
    // Request microphone access
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    const source = audioCtx.createMediaStreamSource(mediaStream);

    // Handle different number of channels
    const numberOfActualChannels = Math.min(
      this.numberOfChannels,
      source.channelCount,
    );

    // Create an AudioWorkletNode to process the audio
    await audioCtx.audioWorklet.addModule(processorUrl);
    const processorNode = new AudioWorkletNode(
      audioCtx,
      CHANNEL_BUFFER_PROCESSOR,
      {
        processorOptions: {
          numberOfChannels: numberOfActualChannels,
          spectrogramBufferSize: this.spectrogramWindowSize,
        },
      },
    );

    // Set up the message handler to update the spectrogram
    processorNode.port.onmessage = async (
      event: MessageEvent<Required<ProcessBuffersMessage>>,
    ) => {
      const { processedBuffers, sampleRate, isStart } = event.data.payload;
      if (processedBuffers.length > 0) {
        console.log(`Processing ${processedBuffers[0].length} samples`);
        console.log(processedBuffers);
        await Promise.all(
          processedBuffers.map((buffer, i) =>
            this.visualizers[i].updateSpectrogramBuffer({
              buffer,
              start: 0,
              length: buffer.length,
              sampleRate: sampleRate,
              isStart: isStart,
            }),
          ),
        );
      }
    };

    // Establish the audio graph
    source.connect(processorNode);
    processorNode.connect(audioCtx.destination);

    // Return a function to stop rendering
    this.stopCallback = () => {
      processorNode.port.postMessage("stop");
      processorNode.disconnect(audioCtx.destination);
      source.disconnect(processorNode);
      mediaStream.getTracks().forEach((track) => track.stop());
    };
  }

  public async setupSpectrogramFromAudioFileDep(
    audioCtx: AudioContext,
    arrayBuffer: ArrayBuffer,
    audioEndCallback: () => void,
  ): Promise<void> {
    // Decode the audio buffer
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) =>
      audioCtx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err),
      ),
    );
    console.log(
      `Audio duration: ${audioBuffer.duration}s. Sample rate: ${audioBuffer.sampleRate}Hz.`,
    );

    // Handling different number of channels
    const numberOfActualChannels = Math.min(
      audioBuffer.numberOfChannels,
      this.numberOfChannels,
    );
    console.log(`Number of actual channels: ${numberOfActualChannels}`);

    // Create an AudioBufferSourceNode to play the audio
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Establish the audio graph
    source.connect(audioCtx.destination);

    let channelData: Float32Array[] = [];
    for (let i = 0; i < numberOfActualChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    const windowSize = this.spectrogramWindowSize;
    const stepSize = Math.ceil(windowSize / 4);
    const playStartTime = performance.now();
    let isStopping = false;
    let isSourceConnected = true;

    let currentSample = 0;
    const audioEventCallback = async () => {
      const duration = (performance.now() - playStartTime) / 1000;
      const playedSamples = Math.ceil(duration * audioBuffer.sampleRate);
      const totalSamples =
        Math.ceil((playedSamples - currentSample) / windowSize) * windowSize;
      // NOTE: totalSamples is 0 when playedSamples < currentSample
      if (totalSamples > 0) {
        console.log(`Processing ${totalSamples} samples`);
        channelData = await Promise.all(
          channelData.map((data, i) =>
            this.visualizers[i].updateSpectrogramBuffer({
              buffer: data,
              start: currentSample,
              length: totalSamples,
              sampleRate: audioBuffer.sampleRate,
              isStart: currentSample === 0,
            }),
          ),
        );
        currentSample += totalSamples - windowSize + stepSize;
      }

      if (!isStopping && duration < audioBuffer.duration) {
        setTimeout(audioEventCallback, 0);
      } else {
        console.log("disconnecting from end callback");
        if (isSourceConnected) {
          source.disconnect();
        }
        isSourceConnected = false;
        audioEndCallback();
      }
    };
    audioEventCallback();

    // Play audio
    audioCtx.resume();
    source.start(0);

    // Assign a function to stop rendering
    this.stopCallback = () => {
      isStopping = true;
      console.log("disconnecting from stop callback");
      if (isSourceConnected) {
        source.disconnect();
      }
      isSourceConnected = false;
    };
  }

  public async setupSpectrogramFromMicrophoneDep(
    audioCtx: AudioContext,
  ): Promise<void> {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    const source = audioCtx.createMediaStreamSource(mediaStream);

    const bufferSize = Math.ceil(this.spectrogramWindowSize / 4);
    const processor = audioCtx.createScriptProcessor(
      bufferSize,
      this.numberOfChannels,
      this.numberOfChannels,
    );

    // An array of the last received audio buffers for each channel
    const channelBuffers: Float32Array[][] = [];
    for (let i = 0; i < this.numberOfChannels; i += 1) {
      channelBuffers.push([]);
    }

    let sampleRate: number | null = null;
    let isStart = true;
    const processChannelBuffers = async () => {
      const buffers: Float32Array[] = [];
      for (
        let channelIdx = 0;
        channelIdx < this.numberOfChannels;
        channelIdx += 1
      ) {
        // Check if we have at least full window to render yet
        if (
          channelBuffers[channelIdx].length <
          this.spectrogramWindowSize / bufferSize
        ) {
          break;
        }

        // Merge all the buffers we have so far into a single buffer for rendering
        const buffer = new Float32Array(
          channelBuffers[channelIdx].length * bufferSize,
        );
        buffers.push(buffer);
        for (let j = 0; j < channelBuffers[channelIdx].length; j += 1) {
          buffer.set(channelBuffers[channelIdx][j], bufferSize * j);
        }

        // Delete the oldest buffers that aren't needed any more for the next render
        channelBuffers[channelIdx].splice(
          0,
          channelBuffers[channelIdx].length -
            this.spectrogramWindowSize / bufferSize +
            1,
        );
      }

      // Render the single merged buffer for each channel
      if (buffers.length > 0) {
        console.log(buffers);
        await Promise.all(
          buffers.map((buffer, i) =>
            this.visualizers[i].updateSpectrogramBuffer({
              buffer,
              start: 0,
              length: buffer.length,
              sampleRate: sampleRate!,
              isStart: isStart,
            }),
          ),
        );
        isStart = false;
      }
    };

    // Each time we record an audio buffer, save it and then render the next window when we have
    // enough samples
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      console.log(`Processing ${bufferSize} samples`);
      for (
        let i = 0;
        i < Math.min(this.numberOfChannels, e.inputBuffer.numberOfChannels);
        i += 1
      ) {
        const channelBuffer = e.inputBuffer.getChannelData(i);
        channelBuffers[i].push(new Float32Array(channelBuffer));
      }
      // Fill in empty channels with empty buffers
      for (
        let i = Math.min(this.numberOfChannels, e.inputBuffer.numberOfChannels);
        i < this.numberOfChannels;
        i += 1
      ) {
        channelBuffers[i].push(new Float32Array(bufferSize));
      }
      sampleRate = e.inputBuffer.sampleRate;
      processChannelBuffers();
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    // Assign a function to stop rendering
    this.stopCallback = () => {
      console.log("disconnecting from stop callback");
      processor.disconnect();
      source.disconnect();
      mediaStream.getTracks().forEach((track) => track.stop());
      processor.onaudioprocess = null;
    };
  }
}
