import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ClearIcon from "@mui/icons-material/Clear";
import CloseIcon from "@mui/icons-material/Close";
import MicIcon from "@mui/icons-material/Mic";
import SettingsIcon from "@mui/icons-material/Settings";
import StopIcon from "@mui/icons-material/Stop";
import Drawer from "@mui/material/Drawer";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";

import {
  StyledSelect,
  StyledDivider,
  ButtonContainer,
  ButtonProgress,
  LastButton,
  CloseButton,
  SettingsHeader,
  SettingsButton,
  DrawerInner,
} from "./StyledComponents";
import generateLabelledSlider from "./LabelSlider";

import { WindowFunctionName } from "../services/utils/fft-windowing";
import { GRADIENTS } from "../services/utils/color-util";
import { hzToMel, melToHz, getNumWindows } from "../services/utils/math-util";
import { Scale } from "../services/spectrogram";
import { ManagerParameters } from "../services";
import { PlayState } from "../App";

const formatHz = (hz: number) => {
  if (hz < 999.5) {
    return `${hz.toPrecision(3)} Hz`;
  }
  return `${(hz / 1000).toPrecision(3)} kHz`;
};

const formatPercentage = (value: number) => {
  if (value * 100 >= 999.5) {
    return `${(value * 100).toPrecision(4)}%`;
  }
  return `${(value * 100).toPrecision(3)}%`;
};

const defaultParameters = {
  bufferSize: 4096,
  windowSize: 4096, // 2^12 samples
  stepSize: 0.25, // 1/4 of window size
  sensitivity: 0.5,
  contrast: 0.5,
  zoom: 1,
  minFrequency: 10,
  maxFrequency: 12000,
  windowFunction: "hann" as WindowFunctionName,
  scale: "mel" as Scale,
  gradient: "Heated Metal",
};
export default function Controls({
  playState,
  setPlayState,
  onRenderFromMicrophone,
  onRenderFromFile,
  onStop,
  onClearSpectrogram,
  onRenderParametersUpdate,
}: {
  playState: PlayState;
  setPlayState: React.Dispatch<React.SetStateAction<PlayState>>;
  onRenderFromMicrophone: () => void;
  onRenderFromFile: (file: ArrayBuffer) => void;
  onStop: () => void;
  onClearSpectrogram: () => void;
  onRenderParametersUpdate: (settings: Partial<ManagerParameters>) => void;
}) {
  const renderParameters = useRef({ ...defaultParameters });
  const isMobile = useMediaQuery("(max-width: 800px)");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openSettings = useCallback(
    () => setSettingsOpen(true),
    [setSettingsOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsOpen(false),
    [setSettingsOpen],
  );

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [numWindows, setNumWindows] = useState(0);

  const onPlayMicrophoneClick = useCallback(() => {
    setPlayState("loading-mic");
    onRenderFromMicrophone();
  }, [onRenderFromMicrophone, setPlayState]);

  const readFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      setPlayState("loading-file");

      reader.addEventListener("load", () => {
        if (reader.result instanceof ArrayBuffer) {
          onRenderFromFile(reader.result);
        } else {
          setPlayState("stopped");
        }
      });
      reader.readAsArrayBuffer(file);
    },
    [onRenderFromFile, setPlayState],
  );
  const onPlayFileClick = useCallback(() => {
    if (fileRef.current === null) {
      return;
    }
    if (file !== null) {
      readFile(file);
      return;
    }
    fileRef.current.click();
  }, [fileRef, file, readFile]);
  const onClearFile = useCallback(() => {
    if (fileRef.current !== null) {
      fileRef.current.value = "";
    }
    setFile(null);
  }, [fileRef]);
  const onFileChange = useCallback(() => {
    if (
      fileRef.current === null ||
      fileRef.current.files === null ||
      fileRef.current.files.length !== 1
    ) {
      return;
    }

    const file = fileRef.current.files[0];
    setFile(file);

    readFile(file);
  }, [fileRef, readFile]);

  const onStopClick = useCallback(() => {
    onStop();
    setPlayState("stopped");
  }, [onStop, setPlayState]);

  const [BufferSizeSlider, setBufferSize] = useMemo(generateLabelledSlider, []);
  const [WindowSizeSlider, setWindowSize] = useMemo(generateLabelledSlider, []);
  const [StepSizeSlider, setStepSize] = useMemo(generateLabelledSlider, []);
  const [SensitivitySlider, setSensitivity] = useMemo(
    generateLabelledSlider,
    [],
  );
  const [ContrastSlider, setContrast] = useMemo(generateLabelledSlider, []);
  const [ZoomSlider, setZoom] = useMemo(generateLabelledSlider, []);
  const [MinFrequencySlider, setMinFrequency] = useMemo(
    generateLabelledSlider,
    [],
  );
  const [MaxFrequencySlider, setMaxFrequency] = useMemo(
    generateLabelledSlider,
    [],
  );

  const onBufferSizeChange = useCallback(
    (value: number) => {
      renderParameters.current.bufferSize = 2 ** value;
      onRenderParametersUpdate({ bufferSize: 2 ** value });
      setBufferSize(`${2 ** value} = 2^${value.toString()} samples`);
      setNumWindows(
        getNumWindows(
          renderParameters.current.bufferSize,
          renderParameters.current.windowSize,
          renderParameters.current.stepSize *
            renderParameters.current.windowSize,
        ),
      );
    },
    [onRenderParametersUpdate, setBufferSize],
  );

  const onWindowSizeChange = useCallback(
    (value: number) => {
      const windowSize = 2 ** value;
      renderParameters.current.windowSize = windowSize;
      // step size needs to be recalculated when window size changes
      const windowStepSize =
        windowSize * (1 - renderParameters.current.stepSize);
      onRenderParametersUpdate({ windowSize, windowStepSize });
      setWindowSize(`${windowSize.toString()} = 2^${value.toString()} samples`);

      setNumWindows(
        getNumWindows(
          renderParameters.current.bufferSize,
          renderParameters.current.windowSize,
          renderParameters.current.stepSize *
            renderParameters.current.windowSize,
        ),
      );
    },
    [onRenderParametersUpdate, setWindowSize],
  );

  const onStepSizeChange = useCallback(
    (value: number) => {
      const windowStepSize = Math.floor(
        renderParameters.current.windowSize * value,
      );
      renderParameters.current.stepSize = value;
      onRenderParametersUpdate({ windowStepSize });
      setStepSize(`${formatPercentage(value)} window size`);

      setNumWindows(
        getNumWindows(
          renderParameters.current.bufferSize,
          renderParameters.current.windowSize,
          renderParameters.current.stepSize *
            renderParameters.current.windowSize,
        ),
      );
    },
    [onRenderParametersUpdate, setStepSize],
  );

  const onSensitivityChange = useCallback(
    (value: number) => {
      renderParameters.current.sensitivity = value;
      const scaledValue = 10 ** (value * 3) - 1;
      onRenderParametersUpdate({ sensitivity: scaledValue });
      setSensitivity(formatPercentage(value));
    },
    [onRenderParametersUpdate, setSensitivity],
  );

  const onContrastChange = useCallback(
    (value: number) => {
      renderParameters.current.contrast = value;
      const scaledValue = 10 ** (value * 6) - 1;
      onRenderParametersUpdate({ contrast: scaledValue });
      setContrast(formatPercentage(value));
    },
    [onRenderParametersUpdate, setContrast],
  );

  const onZoomChange = useCallback(
    (value: number) => {
      renderParameters.current.zoom = value;
      onRenderParametersUpdate({ zoom: value });
      setZoom(formatPercentage(value));
    },
    [onRenderParametersUpdate, setZoom],
  );

  const onMinFreqChange = useCallback(
    (value: number) => {
      const hz = melToHz(value);
      renderParameters.current.minFrequency = hz;
      onRenderParametersUpdate({ minFrequencyHz: hz });
      setMinFrequency(formatHz(hz));
    },
    [onRenderParametersUpdate, setMinFrequency],
  );

  const onMaxFreqChange = useCallback(
    (value: number) => {
      const hz = melToHz(value);
      renderParameters.current.maxFrequency = hz;
      onRenderParametersUpdate({ maxFrequencyHz: hz });
      setMaxFrequency(formatHz(hz));
    },
    [onRenderParametersUpdate, setMaxFrequency],
  );

  const onWindowFunctionChange = useCallback(
    (event: SelectChangeEvent) => {
      if (typeof event.target.value === "string") {
        renderParameters.current.windowFunction = event.target
          .value as WindowFunctionName;
        onRenderParametersUpdate({
          windowFunction: event.target.value as WindowFunctionName,
        });
      }
    },
    [onRenderParametersUpdate],
  );

  const onScaleChange = useCallback(
    (event: SelectChangeEvent) => {
      if (typeof event.target.value === "string") {
        renderParameters.current.scale = event.target.value as Scale;
        onRenderParametersUpdate({ scale: event.target.value as Scale });
      }
    },
    [onRenderParametersUpdate],
  );

  const onGradientChange = useCallback(
    (event: SelectChangeEvent) => {
      if (typeof event.target.value === "string") {
        const gradientData = GRADIENTS.find(
          (g) => g.name === event.target.value,
        );
        if (gradientData !== undefined) {
          renderParameters.current.gradient = gradientData.name;
          onRenderParametersUpdate({ gradient: gradientData.gradient });
        }
      }
    },
    [onRenderParametersUpdate],
  );

  // Update all parameters on mount with current values
  useEffect(() => {
    onBufferSizeChange(Math.log2(renderParameters.current.bufferSize));
    onWindowSizeChange(Math.log2(renderParameters.current.windowSize));
    onStepSizeChange(renderParameters.current.stepSize);
    onSensitivityChange(renderParameters.current.sensitivity);
    onContrastChange(renderParameters.current.contrast);
    onZoomChange(renderParameters.current.zoom);
    onMinFreqChange(hzToMel(renderParameters.current.minFrequency));
    onMaxFreqChange(hzToMel(renderParameters.current.maxFrequency));
    onRenderParametersUpdate({ scale: renderParameters.current.scale });
    onRenderParametersUpdate({
      windowFunction: renderParameters.current.windowFunction,
    });
    const gradientData = GRADIENTS.find(
      (g) => g.name === renderParameters.current.gradient,
    );
    if (gradientData !== undefined) {
      onRenderParametersUpdate({ gradient: gradientData.gradient });
    }
  });

  const content = (
    <>
      <ButtonContainer>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={onPlayMicrophoneClick}
          startIcon={<MicIcon />}
          disabled={playState !== "stopped"}
        >
          Record from mic
        </Button>
        {playState === "loading-mic" && <ButtonProgress size={24} />}
      </ButtonContainer>
      <input
        type="file"
        style={{ display: "none" }}
        accept="audio/x-m4a,audio/*"
        onChange={onFileChange}
        ref={fileRef}
      />
      <ButtonContainer>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={onPlayFileClick}
          startIcon={<AudiotrackIcon />}
          disabled={playState !== "stopped"}
        >
          Play audio file
        </Button>
        {playState === "loading-file" && <ButtonProgress size={24} />}
      </ButtonContainer>
      <Button
        fullWidth
        variant="outlined"
        color="primary"
        onClick={onClearFile}
        startIcon={<ClearIcon />}
        disabled={file === null}
      >
        Clear file
      </Button>
      <LastButton
        fullWidth
        variant="outlined"
        color="secondary"
        onClick={onStopClick}
        startIcon={<StopIcon />}
        disabled={playState !== "playing"}
      >
        Stop
      </LastButton>

      <StyledDivider />
      <Typography variant="caption" paragraph>
        Current file: {file?.name ?? "None"}
      </Typography>
      <Typography variant="caption" paragraph>
        Spectrogram speed: {numWindows} windows/render
      </Typography>
      <StyledDivider />

      <BufferSizeSlider
        nameLabelId="buffer-size-slider-label"
        nameLabel="Buffer size"
        min={5}
        max={15}
        step={1}
        disabled={playState !== "stopped"}
        defaultValue={Math.log2(renderParameters.current.bufferSize)}
        onChange={onBufferSizeChange}
      />
      <WindowSizeSlider
        nameLabelId="window-size-slider-label"
        nameLabel="Window size"
        min={5}
        max={15}
        step={1}
        defaultValue={Math.log2(renderParameters.current.windowSize)}
        onChange={onWindowSizeChange}
      />
      <StepSizeSlider
        nameLabelId="stepSize-slider-label"
        nameLabel="Window step size"
        min={0.05}
        max={1}
        step={0.05}
        defaultValue={renderParameters.current.stepSize}
        onChange={onStepSizeChange}
      />
      <SensitivitySlider
        nameLabelId="sensitivity-slider-label"
        nameLabel="Sensitivity"
        min={0}
        max={1}
        step={0.001}
        defaultValue={renderParameters.current.sensitivity}
        onChange={onSensitivityChange}
      />
      <ContrastSlider
        nameLabelId="contrast-slider-label"
        nameLabel="Contrast"
        min={0}
        max={1}
        step={0.001}
        defaultValue={renderParameters.current.contrast}
        onChange={onContrastChange}
      />
      <ZoomSlider
        nameLabelId="zoom-slider-label"
        nameLabel="Zoom"
        min={1}
        max={10}
        step={0.01}
        defaultValue={renderParameters.current.zoom}
        onChange={onZoomChange}
      />
      <MinFrequencySlider
        nameLabelId="min-freq-slider-label"
        nameLabel="Min. frequency"
        min={hzToMel(0)}
        max={hzToMel(20000)}
        step={1}
        defaultValue={hzToMel(renderParameters.current.minFrequency)}
        onChange={onMinFreqChange}
      />
      <MaxFrequencySlider
        nameLabelId="max-freq-slider-label"
        nameLabel="Max. frequency"
        min={hzToMel(0)}
        max={hzToMel(20000)}
        step={1}
        defaultValue={hzToMel(renderParameters.current.maxFrequency)}
        onChange={onMaxFreqChange}
      />
      <StyledSelect>
        <InputLabel id="window-select-label">Window function</InputLabel>
        <Select
          labelId="window-select-label"
          id="window-select"
          label="Window function"
          defaultValue="hann"
          onChange={onWindowFunctionChange}
        >
          <MenuItem value="hann">Hann</MenuItem>
          <MenuItem value="hamming">Hamming</MenuItem>
          <MenuItem value="blackman">Blackman</MenuItem>
          <MenuItem value="blackman_harris">Blackman-Harris</MenuItem>
        </Select>
      </StyledSelect>
      <StyledSelect>
        <InputLabel id="scale-select-label">Frequency scale</InputLabel>
        <Select
          labelId="scale-select-label"
          id="scale-select"
          label="Frequency scale"
          defaultValue={renderParameters.current.scale}
          onChange={onScaleChange}
        >
          <MenuItem value="mel">Mel</MenuItem>
          <MenuItem value="linear">Linear</MenuItem>
        </Select>
      </StyledSelect>
      <StyledSelect>
        <InputLabel id="gradient-select-label">Colour</InputLabel>
        <Select
          labelId="gradient-select-label"
          id="gradient-select"
          label="Colour"
          defaultValue={renderParameters.current.gradient}
          onChange={onGradientChange}
        >
          {GRADIENTS.map((g) => (
            <MenuItem value={g.name} key={g.name}>
              {g.name}
            </MenuItem>
          ))}
        </Select>
      </StyledSelect>
      <Button
        fullWidth
        variant="text"
        color="secondary"
        onClick={onClearSpectrogram}
        startIcon={<ClearIcon />}
      >
        Clear spectrogram
      </Button>
    </>
  );
  return (
    <div className="controls">
      {isMobile ? (
        <>
          <SettingsButton
            size="large"
            variant="contained"
            color="primary"
            startIcon={<SettingsIcon />}
            onClick={openSettings}
            disableElevation
          >
            Settings
          </SettingsButton>
          <Drawer anchor="right" open={settingsOpen} onClose={closeSettings}>
            <DrawerInner>
              <SettingsHeader>
                <CloseButton aria-label="close" onClick={closeSettings}>
                  <CloseIcon />
                </CloseButton>
              </SettingsHeader>
              {content}
            </DrawerInner>
          </Drawer>
        </>
      ) : (
        content
      )}
    </div>
  );
}
