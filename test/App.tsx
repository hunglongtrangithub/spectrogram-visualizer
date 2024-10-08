import { ThemeProvider, createTheme } from "@mui/material/styles";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import pink from "@mui/material/colors/pink";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { toast } from "react-toastify";

import React, { useCallback, useState, useRef, useEffect } from "react";

import SpectrogramManager from "../src/services";
import Controls from "../src/components/Controls";
import { RenderParameters } from "../src/services/spectrogram-render";

export type PlayState = "stopped" | "loading-file" | "loading-mic" | "playing";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const controlsTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#101010",
      paper: "#222222",
    },
    primary: {
      main: "#ffffff",
    },
    secondary: pink,
  },
});

let globalAudioCtx: AudioContext | null = null;

function App() {
  const leftSpectrogramRef = useRef<HTMLCanvasElement | null>(null);
  const rightSpectrogramRef = useRef<HTMLCanvasElement | null>(null);
  const spectrogramWindowSize = 4096;
  const spectrogramwindowStepSize = 1024;

  const [spectrogramManager, setSpectrogramManager] =
    useState<SpectrogramManager | null>(null);

  useEffect(() => {
    if (leftSpectrogramRef.current && rightSpectrogramRef.current) {
      toast.info("Initializing spectrogram manager");
      try {
        const manager = new SpectrogramManager(
          [leftSpectrogramRef.current, rightSpectrogramRef.current],
          spectrogramWindowSize,
          spectrogramwindowStepSize,
        );
        setSpectrogramManager(manager);
      } catch (e) {
        console.error(e);
        toast.error(`Failed to initialize spectrogram manager: ${e}`);
      }
    }
  }, [spectrogramWindowSize, spectrogramwindowStepSize]);

  const onRenderFromMicrophone = useCallback(() => {
    if (!spectrogramManager) {
      return;
    }
    if (globalAudioCtx === null) {
      globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    spectrogramManager.setupSpectrogramFromMicrophone(globalAudioCtx).then(
      () => setPlayState("playing"),
      (reason) => {
        setPlayState("stopped");
        console.error(reason);
        toast.error(`Failed to render from microphone: ${reason}`);
      },
    );
  }, [spectrogramManager]);

  const onRenderFromFile = useCallback(
    (file: ArrayBuffer) => {
      if (!spectrogramManager) {
        return;
      }
      if (globalAudioCtx === null) {
        globalAudioCtx = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      spectrogramManager
        .setupSpectrogramFromAudioFile(globalAudioCtx, file, () =>
          setPlayState("stopped"),
        )
        .then(
          () => setPlayState("playing"),
          (reason) => {
            setPlayState("stopped");
            console.error(reason);
            toast.error(`Failed to render from file: ${reason}`);
          },
        );
    },
    [spectrogramManager],
  );

  const onStop = useCallback(() => {
    if (!spectrogramManager) {
      return;
    }
    try {
      spectrogramManager.stop();
    } catch (e) {
      console.error(e);
      toast.error(`Failed to stop rendering: ${e}`);
    }
  }, [spectrogramManager]);

  const onClearSpectrogram = useCallback(() => {
    if (!spectrogramManager) {
      return;
    }
    try {
      spectrogramManager.clearSpectrogram();
    } catch (e) {
      console.error(e);
      toast.error(`Failed to clear spectrogram: ${e}`);
    }
  }, [spectrogramManager]);

  const onRenderParametersUpdate = useCallback(
    (settings: Partial<RenderParameters>) => {
      if (!spectrogramManager) {
        return;
      }
      try {
        spectrogramManager.updateRenderParameters(settings);
      } catch (e) {
        console.error(e);
        toast.error(`Failed to update render parameters: ${e}`);
      }
    },
    [spectrogramManager],
  );

  const [playState, setPlayState] = useState<PlayState>("stopped");

  return (
    <>
      <div className="spectrograms">
        <div className="spectrogram">
          <canvas id="leftSpectrogram" ref={leftSpectrogramRef}></canvas>
          <div className="label">Left channel</div>
        </div>
        <div className="spectrogram">
          <canvas id="rightSpectrogram" ref={rightSpectrogramRef}></canvas>
          <div className="label">Right channel</div>
        </div>
        <div className="separator"></div>
      </div>
      <ThemeProvider theme={controlsTheme}>
        <ScopedCssBaseline>
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
          <Controls
            playState={playState}
            setPlayState={setPlayState}
            onRenderFromMicrophone={onRenderFromMicrophone}
            onRenderFromFile={onRenderFromFile}
            onStop={onStop}
            onClearSpectrogram={onClearSpectrogram}
            onRenderParametersUpdate={onRenderParametersUpdate}
          />
        </ScopedCssBaseline>
      </ThemeProvider>
    </>
  );
}

export default App;
