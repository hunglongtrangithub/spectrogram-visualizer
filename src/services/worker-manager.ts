import { SpectrogramOptions, SpectrogramResult } from "./spectrogram";
import {
  ACTION_COMPUTE_SPECTROGRAM,
  ComputeSpectrogramMessage,
  Message,
} from "./worker-constants";
import HelperWorker from "./worker?worker";

// Define a type for instances of HelperWorker
type HelperWorkerInstance = InstanceType<typeof HelperWorker>;

const WORKER_QUEUE: ((worker: HelperWorkerInstance) => void)[] = [];
const WORKER_POOL: { worker: HelperWorkerInstance; busy: boolean }[] = [];
for (let i = 0; i < (window.navigator.hardwareConcurrency || 4); i += 1) {
  WORKER_POOL.push({
    worker: new HelperWorker(),
    busy: false,
  });
}

function getFreeWorker(): Promise<HelperWorkerInstance> {
  const workerData = WORKER_POOL.find((w) => !w.busy);
  if (workerData !== undefined) {
    workerData.busy = true;
    return Promise.resolve(workerData.worker);
  }
  return new Promise((resolve) => {
    WORKER_QUEUE.push(resolve);
  });
}

function releaseWorker(worker: HelperWorkerInstance) {
  const workerData = WORKER_POOL.find((w) => w.worker === worker);
  if (workerData === undefined) {
    throw new Error("Provided worker to release is not valid");
  }

  workerData.busy = false;

  if (WORKER_QUEUE.length > 0) {
    const [next] = WORKER_QUEUE.splice(0, 1);
    workerData.busy = true;
    next(workerData.worker);
  }
}

function queueTask<T extends Message>(
  action: T["request"]["action"],
  payload: T["request"]["payload"],
  transfer: Transferable[],
): Promise<Required<T["response"]>["payload"]> {
  return new Promise((resolve, reject) => {
    getFreeWorker().then((worker) => {
      // Handler to receive the response from the worker
      worker.onmessage = (event: { data: T["response"] }) => {
        // Remove the message handler
        worker.onmessage = null;
        releaseWorker(worker);

        if ("error" in event.data) {
          reject(event.data.error);
          return;
        }
        resolve(event.data.payload);
      };

      // Send the message to the worker
      worker.postMessage(
        {
          action,
          payload,
        },
        transfer,
      );
    });
  });
}

export function getWorkerCount(): number {
  return WORKER_POOL.length;
}

export async function offThreadGenerateSpectrogram(
  samples: Float32Array,
  samplesStart: number,
  samplesLength: number,
  options: SpectrogramOptions,
): Promise<SpectrogramResult & { input: Float32Array }> {
  const samplesBuffer = samples.buffer as ArrayBuffer;
  const {
    spectrogramWindowCount,
    spectrogramOptions,
    spectrogramBuffer,
    inputBuffer,
  } = await queueTask<ComputeSpectrogramMessage>(
    ACTION_COMPUTE_SPECTROGRAM,
    {
      samplesBuffer,
      samplesStart,
      samplesLength,
      options,
    },
    [samplesBuffer],
  );

  return {
    windowCount: spectrogramWindowCount,
    options: spectrogramOptions,
    spectrogramData: new Float32Array(spectrogramBuffer),
    input: new Float32Array(inputBuffer),
  };
}
