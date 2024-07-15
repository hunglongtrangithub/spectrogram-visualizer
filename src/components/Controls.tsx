import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import pink from "@mui/material/colors/pink";
import { ThemeProvider, createTheme } from "@mui/material/styles";
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

import { GRADIENTS } from "../services/color-util";
import { hzToMel, melToHz } from "../services/math-util";
import { Scale } from "../services/spectrogram";
import { RenderParameters } from "../services/spectrogram-render";

export type PlayState = "stopped" | "loading-file" | "loading-mic" | "playing";

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
function generateLabelledSlider(): [
  React.FC,
  React.Dispatch<React.SetStateAction<number>>,
] {
  const [value, setValue] = React.useState(0);
  const Slider: React.FC = () => (
    <div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <label>{value}</label>
    </div>
  );

  return [Slider, setValue];
}
export default function Controls() {
  const { current: defaultParameters } = useRef({
    sensitivity: 0.5,
    contrast: 0.5,
    zoom: 4,
    minFrequency: 10,
    maxFrequency: 12000,
    scale: "mel" as Scale,
    gradient: "Heated Metal",
  });
  const [count, setCount] = useState(0);
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
  const [playState, setPlayState] = useState<PlayState>("stopped");
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

      <SensitivitySlider
        nameLabelId="sensitivity-slider-label"
        nameLabel="Sensitivity"
        min={0}
        max={1}
        step={0.001}
        defaultValue={defaultParameters.sensitivity}
        onChange={onSensitivityChange}
      />
      <ContrastSlider
        nameLabelId="contrast-slider-label"
        nameLabel="Contrast"
        min={0}
        max={1}
        step={0.001}
        defaultValue={defaultParameters.contrast}
        onChange={onContrastChange}
      />
      <ZoomSlider
        nameLabelId="zoom-slider-label"
        nameLabel="Zoom"
        min={1}
        max={10}
        step={0.01}
        defaultValue={defaultParameters.zoom}
        onChange={onZoomChange}
      />
      <MinFrequencySlider
        nameLabelId="min-freq-slider-label"
        nameLabel="Min. frequency"
        min={hzToMel(0)}
        max={hzToMel(20000)}
        step={1}
        defaultValue={hzToMel(defaultParameters.minFrequency)}
        onChange={onMinFreqChange}
      />
      <MaxFrequencySlider
        nameLabelId="max-freq-slider-label"
        nameLabel="Max. frequency"
        min={hzToMel(0)}
        max={hzToMel(20000)}
        step={1}
        defaultValue={hzToMel(defaultParameters.maxFrequency)}
        onChange={onMaxFreqChange}
      />
      <StyledSelect>
        <InputLabel id="scale-select-label">Frequency scale</InputLabel>
        <Select
          labelId="scale-select-label"
          id="scale-select"
          defaultValue={defaultParameters.scale}
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
          defaultValue={defaultParameters.gradient}
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
      <button onClick={() => setCount((count) => count + 1)}>
        count is: {count}
      </button>
      <ThemeProvider theme={controlsTheme}>
        <ScopedCssBaseline>
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
        </ScopedCssBaseline>
      </ThemeProvider>
    </div>
  );
}
