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

import React, {
  MouseEvent,
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
  SettingsDrawer,
  SettingsDrawerInner,
} from "./StyledComponents";
import generateLabelledSlider from "./LabelSlider";

import { GRADIENTS } from "../services/color-util";
import { hzToMel, melToHz } from "../services/math-util";
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
  windowSize: 4096, // 2^12 samples
  overlap: 0.75, // step size = 1/4 of window size
  sensitivity: 0.5,
  contrast: 0.5,
  zoom: 1,
  minFrequency: 10,
  maxFrequency: 12000,
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

  const onInnerPaperClick = useCallback(
    (e: MouseEvent) => e.stopPropagation(),
    [],
  );

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);

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

  const [WindowSizeSlider, setWindowSize] = useMemo(generateLabelledSlider, []);
  const [OverlapSlider, setOverlap] = useMemo(generateLabelledSlider, []);
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

  const onWindowSizeChange = useCallback(
    (value: number) => {
      const windowSize = 2 ** value;
      renderParameters.current.windowSize = windowSize;
      // step size needs to be recalculated when window size changes
      const windowStepSize =
        windowSize * (1 - renderParameters.current.overlap);
      onRenderParametersUpdate({ windowSize, windowStepSize });
      setWindowSize(`${windowSize.toString()} = 2^${value.toString()} samples`);
    },
    [onRenderParametersUpdate, setWindowSize],
  );

  const onOverlapChange = useCallback(
    (value: number) => {
      // step size needs to be recalculated when overlap changes
      const windowStepSize = renderParameters.current.windowSize * (1 - value);
      renderParameters.current.overlap = value;
      onRenderParametersUpdate({ windowStepSize });
      setOverlap(`${formatPercentage(value)} window size`);
    },
    [onRenderParametersUpdate, setOverlap],
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
    onWindowSizeChange(Math.log2(renderParameters.current.windowSize));
    onOverlapChange(renderParameters.current.overlap);
    onSensitivityChange(renderParameters.current.sensitivity);
    onContrastChange(renderParameters.current.contrast);
    onZoomChange(renderParameters.current.zoom);
    onMinFreqChange(hzToMel(renderParameters.current.minFrequency));
    onMaxFreqChange(hzToMel(renderParameters.current.maxFrequency));
    onRenderParametersUpdate({ scale: renderParameters.current.scale });

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
      <Typography variant="subtitle1">Current file: {file?.name}</Typography>
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

      <WindowSizeSlider
        nameLabelId="window-size-slider-label"
        nameLabel="Window size"
        min={5}
        max={15}
        step={1}
        defaultValue={Math.log2(renderParameters.current.windowSize)}
        onChange={onWindowSizeChange}
      />
      <OverlapSlider
        nameLabelId="overlap-slider-label"
        nameLabel="Overlap"
        min={0}
        max={1}
        step={0.001}
        defaultValue={renderParameters.current.overlap}
        onChange={onOverlapChange}
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
        <InputLabel id="scale-select-label">Frequency scale</InputLabel>
        <Select
          labelId="scale-select-label"
          id="scale-select"
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
          <SettingsDrawer
            anchor="bottom"
            open={settingsOpen}
            onClose={closeSettings}
            PaperProps={{ elevation: 0, onClick: closeSettings }}
          >
            <SettingsDrawerInner elevation={16} onClick={onInnerPaperClick}>
              <SettingsHeader>
                <CloseButton aria-label="close" onClick={closeSettings}>
                  <CloseIcon />
                </CloseButton>
                <Typography variant="subtitle1">Settings</Typography>
              </SettingsHeader>
              {content}
            </SettingsDrawerInner>
          </SettingsDrawer>
        </>
      ) : (
        content
      )}
    </div>
  );
}
