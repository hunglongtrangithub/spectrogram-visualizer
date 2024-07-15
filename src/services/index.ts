import debounce from "lodash.debounce";

import { Circular2DBuffer } from "./math-util";
import { SpectrogramGPURenderer, RenderParameters } from "./spectrogram-render";
import { offThreadGenerateSpectrogram } from "./worker-util";

const SPECTROGRAM_WINDOW_SIZE = 4096;
const SPECTROGRAM_WINDOW_OVERLAP = 1024;
const NUMBER_OF_CHANNELS = 2;

interface SpectrogramBufferData {
  buffer: Float32Array;
  start: number;
  length: number;
  sampleRate: number;
  isStart: boolean;
}

// Starts rendering the spectrograms, returning callbacks used to provide audio samples to render
// and update the display parameters of the spectrograms
async function startRenderingSpectrogram(
  canvases: (HTMLCanvasElement | null)[],
): Promise<{
  bufferCallback: (
    bufferData: SpectrogramBufferData[],
  ) => Promise<Float32Array[]>;
  clearCallback: () => void;
  updateRenderParameters: (parameters: Partial<RenderParameters>) => void;
}> {
  // The callbacks for each spectrogram that will render the audio samples provided when called
  const bufferCallbacks: ((
    bufferData: SpectrogramBufferData,
  ) => Promise<Float32Array>)[] = [];

  // Set up the WebGL contexts for each spectrogram
  const spectrogramBuffers: Circular2DBuffer<Float32Array>[] = [];
  const renderers: SpectrogramGPURenderer[] = [];
  canvases.forEach((canvas) => {
    if (canvas === null || canvas.parentElement === null) {
      return;
    }

    // The 2D circular queue of the FFT data for each audio channel
    const spectrogramBuffer = new Circular2DBuffer(
      Float32Array,
      canvas.parentElement.offsetWidth,
      SPECTROGRAM_WINDOW_SIZE / 2,
      1,
    );
    spectrogramBuffers.push(spectrogramBuffer);

    const renderer = new SpectrogramGPURenderer(
      canvas,
      spectrogramBuffer.width,
      spectrogramBuffer.height,
    );
    renderer.resizeCanvas(
      canvas.parentElement.offsetWidth,
      canvas.parentElement.offsetHeight,
    );
    renderers.push(renderer);

    let imageDirty = false;
    bufferCallbacks.push(
      async ({
        buffer,
        start,
        length,
        sampleRate,
        isStart,
      }: SpectrogramBufferData) => {
        renderer.updateParameters({
          windowSize: SPECTROGRAM_WINDOW_SIZE,
          sampleRate,
        });

        const spectrogram = await offThreadGenerateSpectrogram(
          buffer,
          start,
          length,
          {
            windowSize: SPECTROGRAM_WINDOW_SIZE,
            windowStepSize: SPECTROGRAM_WINDOW_OVERLAP,
            sampleRate,
            isStart,
          },
        );
        spectrogramBuffer.enqueue(spectrogram.spectrogramData);
        imageDirty = true;

        return spectrogram.input;
      },
    );

    // Trigger a render on each frame only if we have new spectrogram data to display
    const render = () => {
      if (imageDirty) {
        renderer.updateSpectrogram(spectrogramBuffer);
      }
      renderer.render();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  });

  // Handle resizing of the window
  const resizeHandler = debounce(() => {
    canvases.forEach((canvas, i) => {
      if (canvas === null || canvas.parentElement === null) {
        return;
      }

      spectrogramBuffers[i].resizeWidth(canvas.parentElement.offsetWidth);
      renderers[i].resizeCanvas(
        canvas.parentElement.offsetWidth,
        canvas.parentElement.offsetHeight,
      );
      renderers[i].updateSpectrogram(spectrogramBuffers[i]);
    });
  }, 250);
  window.addEventListener("resize", resizeHandler);

  // Make sure the canvas still displays properly in the middle of a resize
  window.addEventListener("resize", () => {
    canvases.forEach((canvas, i) => {
      if (canvas === null || canvas.parentElement === null) {
        return;
      }

      renderers[i].fastResizeCanvas(
        canvas.parentElement.offsetWidth,
        canvas.parentElement.offsetHeight,
      );
    });
  });

  return {
    bufferCallback: (buffers: SpectrogramBufferData[]) =>
      Promise.all(buffers.map((buffer, i) => bufferCallbacks[i](buffer))),
    clearCallback: () => {
      renderers.forEach((renderer, i) => {
        spectrogramBuffers[i].clear();
        renderer.updateSpectrogram(spectrogramBuffers[i], true);
      });
    },
    updateRenderParameters: (parameters: Partial<RenderParameters>) => {
      for (let i = 0; i < renderers.length; i += 1) {
        renderers[i].updateParameters(parameters);
      }
    },
  };
}

async function setupSpectrogramFromAudioFile(
  audioCtx: AudioContext,
  arrayBuffer: ArrayBuffer,
  bufferCallback: (
    bufferData: SpectrogramBufferData[],
  ) => Promise<Float32Array[]>,
  audioEndCallback: () => void,
  CHANNELS: number = NUMBER_OF_CHANNELS,
) {
  const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) =>
    audioCtx.decodeAudioData(
      arrayBuffer,
      (buffer) => resolve(buffer),
      (err) => reject(err),
    ),
  );
  let channelData: Float32Array[] = [];

  // Handling different number of channels
  const actualChannels = audioBuffer.numberOfChannels;
  for (let i = 0; i < Math.min(actualChannels, CHANNELS); i += 1) {
    channelData.push(new Float32Array(audioBuffer.getChannelData(i)));
  }

  // If actual channels are less than CHANNELS, fill the remaining with the last available channel data
  if (actualChannels < CHANNELS) {
    const lastChannelData = channelData[channelData.length - 1];
    for (let i = actualChannels; i < CHANNELS; i++) {
      channelData.push(new Float32Array(lastChannelData));
    }
  }

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  let isStopping = false;
  let isSourceConnected = false;
  const playStartTime = performance.now();
  let nextSample = 0;

  const audioEventCallback = async () => {
    const duration = (performance.now() - playStartTime) / 1000;
    const bufferCallbackData: SpectrogramBufferData[] = [];

    // Calculate spectrogram up to current point
    const totalSamples =
      Math.ceil(
        (duration * audioBuffer.sampleRate - nextSample) /
          SPECTROGRAM_WINDOW_SIZE,
      ) * SPECTROGRAM_WINDOW_SIZE;

    if (totalSamples > 0) {
      for (let i = 0; i < CHANNELS; i += 1) {
        bufferCallbackData.push({
          buffer: channelData[i],
          start: nextSample,
          length: totalSamples,
          sampleRate: audioBuffer.sampleRate,
          isStart: nextSample === 0,
        });
      }

      nextSample =
        nextSample +
        totalSamples -
        SPECTROGRAM_WINDOW_SIZE +
        SPECTROGRAM_WINDOW_OVERLAP;
      channelData = await bufferCallback(bufferCallbackData);
    }

    if (!isStopping && duration / audioBuffer.duration < 1.0) {
      setTimeout(
        audioEventCallback,
        ((SPECTROGRAM_WINDOW_OVERLAP / audioBuffer.sampleRate) * 1000) / 2,
      );
    } else {
      if (isSourceConnected) {
        console.log("disconnecting from end callback");
        isSourceConnected = false;
        source.disconnect(audioCtx.destination);
      }
      audioEndCallback();
    }
  };
  audioEventCallback();

  // Play audio
  audioCtx.resume();
  source.start(0);
  isSourceConnected = true;

  // Return a function to stop rendering
  return () => {
    isStopping = true;
    if (isSourceConnected) {
      console.log("disconnecting from stop callback");
      isSourceConnected = false;
      source.disconnect(audioCtx.destination);
    }
  };
}

async function setupSpectrogramFromMicrophone(
  audioCtx: AudioContext,
  bufferCallback: (
    bufferData: SpectrogramBufferData[],
  ) => Promise<Float32Array[]>,
  CHANNELS: number = NUMBER_OF_CHANNELS,
) {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  const source = audioCtx.createMediaStreamSource(mediaStream);

  const processor = audioCtx.createScriptProcessor(
    SPECTROGRAM_WINDOW_OVERLAP,
    CHANNELS,
    CHANNELS,
  );

  // An array of the last received audio buffers for each channel
  const channelBuffers: Float32Array[][] = [];
  for (let i = 0; i < CHANNELS; i += 1) {
    channelBuffers.push([]);
  }

  let sampleRate: number | null = null;
  let isStart = true;
  let bufferCallbackPromise: Promise<Float32Array[]> | null = null;
  const processChannelBuffers = () => {
    if (bufferCallbackPromise !== null) {
      return;
    }

    const buffers: Float32Array[] = [];
    for (let i = 0; i < CHANNELS; i += 1) {
      // Check if we have at least full window to render yet
      if (
        channelBuffers[i].length <
        SPECTROGRAM_WINDOW_SIZE / SPECTROGRAM_WINDOW_OVERLAP
      ) {
        break;
      }

      // Merge all the buffers we have so far into a single buffer for rendering
      const buffer = new Float32Array(
        channelBuffers[i].length * SPECTROGRAM_WINDOW_OVERLAP,
      );
      buffers.push(buffer);
      for (let j = 0; j < channelBuffers[i].length; j += 1) {
        buffer.set(channelBuffers[i][j], SPECTROGRAM_WINDOW_OVERLAP * j);
      }

      // Delete the oldest buffers that aren't needed any more for the next render
      channelBuffers[i].splice(
        0,
        channelBuffers[i].length -
          SPECTROGRAM_WINDOW_SIZE / SPECTROGRAM_WINDOW_OVERLAP +
          1,
      );
    }

    // Render the single merged buffer for each channel
    if (buffers.length > 0) {
      bufferCallbackPromise = bufferCallback(
        buffers.map((buffer) => ({
          buffer,
          start: 0,
          length: buffer.length,
          sampleRate: sampleRate!,
          isStart,
        })),
      );
      bufferCallbackPromise.then(() => {
        bufferCallbackPromise = null;
      });
      isStart = false;
    }
  };

  // Each time we record an audio buffer, save it and then render the next window when we have
  // enough samples
  processor.addEventListener("audioprocess", (e) => {
    for (
      let i = 0;
      i < Math.min(CHANNELS, e.inputBuffer.numberOfChannels);
      i += 1
    ) {
      const channelBuffer = e.inputBuffer.getChannelData(i);
      channelBuffers[i].push(new Float32Array(channelBuffer));
    }
    // If a single channel input, pass an empty signal for the right channel
    for (
      let i = Math.min(CHANNELS, e.inputBuffer.numberOfChannels);
      i < CHANNELS;
      i += 1
    ) {
      channelBuffers[i].push(new Float32Array(SPECTROGRAM_WINDOW_OVERLAP));
    }
    sampleRate = e.inputBuffer.sampleRate;
    processChannelBuffers();
  });

  source.connect(processor);
  processor.connect(audioCtx.destination);

  // Return a function to stop rendering
  return () => {
    processor.disconnect(audioCtx.destination);
    source.disconnect(processor);
  };
}

const canvases = [
  document.querySelector("#leftSpectrogram") as HTMLCanvasElement | null,
  document.querySelector("#rightSpectrogram") as HTMLCanvasElement | null,
];

// const spectrogramCallbacksPromise = startRenderingSpectrogram(canvases);
// let globalAudioCtx: AudioContext | null = null;

// (async () => {
//   const controlsContainer = document.querySelector(".controls");
//   const { bufferCallback, clearCallback, updateRenderParameters } =
//     await spectrogramCallbacksPromise;
//   if (controlsContainer !== null) {
//     let stopCallback: (() => void) | null = null;
//     const setPlayState = initialiseControlsUi(controlsContainer, {
//       stopCallback: () => {
//         if (stopCallback !== null) {
//           stopCallback();
//         }
//         stopCallback = null;
//       },
//       clearSpectrogramCallback: () => {
//         clearCallback();
//       },
//       renderParametersUpdateCallback: (
//         parameters: Partial<RenderParameters>,
//       ) => {
//         updateRenderParameters(parameters);
//       },
//       renderFromMicrophoneCallback: () => {
//         if (globalAudioCtx === null) {
//           globalAudioCtx = new (window.AudioContext ||
//             window.webkitAudioContext)();
//         }
//         setupSpectrogramFromMicrophone(globalAudioCtx, bufferCallback).then(
//           (callback) => {
//             stopCallback = callback;
//             setPlayState("playing");
//           },
//           () => setPlayState("stopped"),
//         );
//       },
//       renderFromFileCallback: (file: ArrayBuffer) => {
//         if (globalAudioCtx === null) {
//           globalAudioCtx = new (window.AudioContext ||
//             window.webkitAudioContext)();
//         }
//         setupSpectrogramFromAudioFile(
//           globalAudioCtx,
//           file,
//           bufferCallback,
//           () => setPlayState("stopped"),
//         ).then(
//           (callback) => {
//             stopCallback = callback;
//             setPlayState("playing");
//           },
//           () => setPlayState("stopped"),
//         );
//       },
//     });
//   }
// })();

// async function setupSpectrogramFromMicrophone(
//     audioCtx: AudioContext,
//     bufferCallback: (bufferData: SpectrogramBufferData[]) => Promise<Float32Array[]>
// ) {
//     await audioCtx.audioWorklet.addModule('spectrogram-processor.js');

//     const CHANNELS = 2;
//     const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
//     const source = audioCtx.createMediaStreamSource(mediaStream);

//     const processorNode = new AudioWorkletNode(audioCtx, 'spectrogram-processor');
//     processorNode.port.onmessage = async (event) => {
//         const { buffers, sampleRate, isStart } = event.data;

//         await bufferCallback(
//             buffers.map((buffer: Float32Array[]) => ({
//                 buffer,
//                 start: 0,
//                 length: buffer.length,
//                 sampleRate,
//                 isStart,
//             }))
//         );

//         processorNode.port.postMessage('done');
//     };

//     source.connect(processorNode);
//     processorNode.connect(audioCtx.destination);

//     return () => {
//         processorNode.port.postMessage('reset');
//         source.disconnect(processorNode);
//         processorNode.disconnect(audioCtx.destination);
//     };
// }
class SpectrogramVisualization {
  private canvas: HTMLCanvasElement;
  private renderer: SpectrogramGPURenderer;
  private spectrogramBuffer: Circular2DBuffer<Float32Array>;
  private spectrogramWindowSize: number;
  private spectrogramWindowOverlap: number;
  private imageDirty: boolean = false;

  constructor(
    canvas: HTMLCanvasElement,
    spectrogramWindowSize: number = SPECTROGRAM_WINDOW_SIZE,
    spectrogramWindowOverlap: number = SPECTROGRAM_WINDOW_OVERLAP,
  ) {
    this.canvas = canvas;
    if (this.canvas.parentElement === null) {
      throw new Error("Canvas must be within a parent element");
    }
    this.spectrogramWindowSize = spectrogramWindowSize;
    this.spectrogramWindowOverlap = spectrogramWindowOverlap;

    this.spectrogramBuffer = new Circular2DBuffer(
      Float32Array,
      this.canvas.parentElement.offsetWidth,
      this.spectrogramWindowSize / 2,
      1,
    );

    this.renderer = new SpectrogramGPURenderer(
      this.canvas,
      this.spectrogramBuffer.width,
      this.spectrogramBuffer.height,
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

    const spectrogram = await offThreadGenerateSpectrogram(
      bufferData.buffer,
      bufferData.start,
      bufferData.length,
      {
        windowSize: this.spectrogramWindowSize,
        windowStepSize: this.spectrogramWindowOverlap,
        sampleRate: bufferData.sampleRate,
        isStart: bufferData.isStart,
      },
    );
    this.spectrogramBuffer.enqueue(spectrogram.spectrogramData);
    this.imageDirty = true;

    return spectrogram.input;
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
  private audioCtx: AudioContext;
  private visualizations: SpectrogramVisualization[] = [];
  private numberOfChannels: number;
  private spectrogramWindowSize: number = SPECTROGRAM_WINDOW_SIZE;
  private spectrogramWindowOverlap: number = SPECTROGRAM_WINDOW_OVERLAP;

  constructor(
    canvases: (HTMLCanvasElement | null)[],
    spectrogramWindowSize: number,
    spectrogramWindowOverlap: number,
  ) {
    this.audioCtx = new AudioContext();
    canvases.forEach((canvas) => {
      if (canvas !== null && canvas.parentElement !== null) {
        this.visualizations.push(
          new SpectrogramVisualization(
            canvas,
            this.spectrogramWindowSize,
            this.spectrogramWindowOverlap,
          ),
        );
      }
    });
    this.numberOfChannels = this.visualizations.length;
    this.spectrogramWindowSize = spectrogramWindowSize;
    this.spectrogramWindowOverlap = spectrogramWindowOverlap;
  }

  public async setupSpectrogramFromAudioFile(
    arrayBuffer: ArrayBuffer,
    audioEndCallback: () => void,
  ) {
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) =>
      this.audioCtx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err),
      ),
    );
    // Handling different number of channels
    const numberOfActualChannels = Math.min(
      audioBuffer.numberOfChannels,
      this.numberOfChannels,
    );
    const channelData: Float32Array[] = [];
    for (let i = 0; i < numberOfActualChannels; i += 1) {
      channelData.push(new Float32Array(audioBuffer.getChannelData(i)));
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);

    let isStopping = false;
    let isSourceConnected = false;
    const playStartTime = performance.now();
    let nextSample = 0;

    const audioEventCallback = async () => {
      const duration = (performance.now() - playStartTime) / 1000;
      let bufferCallbackData: SpectrogramBufferData;

      // Calculate spectrogram up to current point
      const totalSamples =
        Math.ceil(
          (duration * audioBuffer.sampleRate - nextSample) /
            this.spectrogramWindowSize,
        ) * this.spectrogramWindowSize;

      if (totalSamples > 0) {
        for (let i = 0; i < numberOfActualChannels; i += 1) {
          // NOTE: channelData.length is always <= this.numberOfChannels
          channelData[i] = await this.visualizations[i].updateSpectrogramBuffer(
            {
              buffer: channelData[i]!,
              start: nextSample,
              length: totalSamples,
              sampleRate: audioBuffer.sampleRate,
              isStart: nextSample === 0,
            },
          );
        }

        nextSample =
          nextSample +
          totalSamples -
          this.spectrogramWindowSize +
          this.spectrogramWindowOverlap;
      }

      if (!isStopping && duration / audioBuffer.duration < 1.0) {
        setTimeout(
          audioEventCallback,
          ((SPECTROGRAM_WINDOW_OVERLAP / audioBuffer.sampleRate) * 1000) / 2,
        );
      } else {
        if (isSourceConnected) {
          console.log("disconnecting from end callback");
          isSourceConnected = false;
          source.disconnect(this.audioCtx.destination);
        }
        audioEndCallback();
      }
    };
    audioEventCallback();

    // Play audio
    this.audioCtx.resume();
    source.start(0);
    isSourceConnected = true;

    // Return a function to stop rendering
    return () => {
      isStopping = true;
      if (isSourceConnected) {
        console.log("disconnecting from stop callback");
        isSourceConnected = false;
        source.disconnect(this.audioCtx.destination);
      }
    };
  }

  public async setupSpectrogramFromMicrophone() {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    const source = this.audioCtx.createMediaStreamSource(mediaStream);

    const processor = this.audioCtx.createScriptProcessor(
      this.spectrogramWindowOverlap,
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
    let bufferCallbackPromise: Promise<Float32Array[]> | null = null;
    const processChannelBuffers = () => {
      if (bufferCallbackPromise !== null) {
        return;
      }

      const buffers: Float32Array[] = [];
      for (let i = 0; i < this.numberOfChannels; i += 1) {
        // Check if we have at least full window to render yet
        if (
          channelBuffers[i].length <
          this.spectrogramWindowOverlap / this.spectrogramWindowOverlap
        ) {
          break;
        }

        // Merge all the buffers we have so far into a single buffer for rendering
        const buffer = new Float32Array(
          channelBuffers[i].length * this.spectrogramWindowOverlap,
        );
        buffers.push(buffer);
        for (let j = 0; j < channelBuffers[i].length; j += 1) {
          buffer.set(channelBuffers[i][j], this.spectrogramWindowOverlap * j);
        }

        // Delete the oldest buffers that aren't needed any more for the next render
        channelBuffers[i].splice(
          0,
          channelBuffers[i].length -
            this.spectrogramWindowOverlap / this.spectrogramWindowOverlap +
            1,
        );
      }

      // Render the single merged buffer for each channel
      if (buffers.length > 0) {
        bufferCallbackPromise = Promise.all(
          // NOTE: buffers.length is always == this.numberOfChannels
          buffers.map((buffer, i) =>
            this.visualizations[i].updateSpectrogramBuffer({
              buffer,
              start: 0,
              length: buffer.length,
              sampleRate: sampleRate!,
              isStart,
            }),
          ),
        );
        bufferCallbackPromise.then(() => {
          bufferCallbackPromise = null;
        });
        isStart = false;
      }
    };

    // Each time we record an audio buffer, save it and then render the next window when we have
    // enough samples
    processor.addEventListener("audioprocess", (e) => {
      for (
        let i = 0;
        i < Math.min(this.numberOfChannels, e.inputBuffer.numberOfChannels);
        i += 1
      ) {
        const channelBuffer = e.inputBuffer.getChannelData(i);
        channelBuffers[i].push(new Float32Array(channelBuffer));
      }
      // If a single channel input, pass an empty signal for the right channel
      for (
        let i = Math.min(this.numberOfChannels, e.inputBuffer.numberOfChannels);
        i < this.numberOfChannels;
        i += 1
      ) {
        channelBuffers[i].push(new Float32Array(this.spectrogramWindowOverlap));
      }
      sampleRate = e.inputBuffer.sampleRate;
      processChannelBuffers();
    });

    source.connect(processor);
    processor.connect(this.audioCtx.destination);

    // Return a function to stop rendering
    return () => {
      processor.disconnect(this.audioCtx.destination);
      source.disconnect(processor);
    };
  }
}
