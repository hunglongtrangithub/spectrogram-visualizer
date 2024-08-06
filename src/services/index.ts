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

export interface VisualizerParameters extends RenderParameters {
  windowStepSize: number;
}

export interface ManagerParameters extends VisualizerParameters {
  bufferSize: number;
}

export class SpectrogramVisualizer {
  private canvas: HTMLCanvasElement;
  private renderer: SpectrogramGPURenderer;
  private readonly spectrogramBuffer: Circular2DDataBuffer<Float32Array>;
  private readonly spectrogramScaleSize: number;
  private spectrogramWindowSize: number;
  private spectrogramWindowStepSize: number;
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
    const spectrogramOptions = {
      windowSize: this.spectrogramWindowSize,
      windowStepSize: this.spectrogramWindowStepSize,
      scaleSize: this.spectrogramScaleSize,
      sampleRate: bufferData.sampleRate,
      isStart: bufferData.isStart,
    };
    console.log(
      `Spectrogram options: ${JSON.stringify(spectrogramOptions)}. Buffer length: ${bufferData.length}`,
    );
    try {
      const spectrogram = await offThreadGenerateSpectrogram(
        bufferData.buffer,
        bufferData.start,
        bufferData.length,
        spectrogramOptions,
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

  public updateRenderParameters(
    parameters: Partial<VisualizerParameters>,
  ): void {
    const { windowStepSize, ...renderParameters } = parameters;
    this.spectrogramWindowStepSize =
      windowStepSize || this.spectrogramWindowStepSize;
    this.spectrogramWindowSize =
      renderParameters.windowSize || this.spectrogramWindowSize;
    this.renderer.updateParameters(renderParameters);
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
  private bufferSize: number;
  private stopCallback: (() => void) | null = null;

  constructor(
    canvases: (HTMLCanvasElement | null)[],
    spectrogramWindowSize: number = SPECTROGRAM_WINDOW_SIZE,
    spectrogramWindowStepSize: number = SPECTROGRAM_WINDOW_STEPSIZE,
    spectrogramScaleSize?: number,
    managerBufferSize?: number,
  ) {
    this.numberOfChannels = this.visualizers.length;
    this.bufferSize = managerBufferSize || spectrogramWindowSize;
    this.initializeVisualizers(
      canvases,
      spectrogramWindowSize,
      spectrogramWindowStepSize,
      spectrogramScaleSize || spectrogramWindowSize / 2,
    );
    console.log(`Number of visualizers: ${this.numberOfChannels}`);
  }

  private initializeVisualizers(
    canvases: (HTMLCanvasElement | null)[],
    windowSize: number,
    windowStepSize: number,
    scaleSize: number,
  ): void {
    canvases.forEach((canvas) => {
      if (canvas !== null && canvas.parentElement !== null) {
        try {
          this.visualizers.push(
            new SpectrogramVisualizer(
              canvas,
              windowSize,
              windowStepSize,
              scaleSize,
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

  public updateRenderParameters(parameters: Partial<ManagerParameters>): void {
    const { bufferSize, ...visualizerParameters } = parameters;
    this.bufferSize = bufferSize || this.bufferSize;
    this.visualizers.forEach((visualizer) => {
      visualizer.updateRenderParameters(visualizerParameters);
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
          spectrogramBufferSize: this.bufferSize,
        },
      },
    );

    // Set up the message handler to update the spectrogram
    processorNode.port.onmessage = async (
      event: MessageEvent<Required<ProcessBuffersMessage>>,
    ) => {
      const { processedBuffers, sampleRate, isStart } = event.data.payload;
      if (processedBuffers.length > 0) {
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
          spectrogramBufferSize: this.bufferSize,
        },
      },
    );

    // Set up the message handler to update the spectrogram
    processorNode.port.onmessage = async (
      event: MessageEvent<Required<ProcessBuffersMessage>>,
    ) => {
      if (event.data.error) {
        console.error(`Error: ${event.data.error}`);
        return;
      }
      const { processedBuffers, sampleRate, isStart } = event.data.payload;
      if (processedBuffers.length > 0) {
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
}
