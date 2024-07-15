import Controls from "./components/Controls";
import SpectrogramManager from "./services";

function App() {
  const canvases = [
    document.getElementById("leftSpectrogram") as HTMLCanvasElement,
    document.getElementById("rightSpectrogram") as HTMLCanvasElement,
  ];
  const spectrogramWindowSize = 4096;
  const spectrogramWindowOverlap = 1024;
  const spectrogramManager = new SpectrogramManager(
    canvases,
    spectrogramWindowSize,
    spectrogramWindowOverlap,
  );
  return (
    <>
      <div className="spectrograms">
        <div className="spectrogram">
          <canvas id="leftSpectrogram"></canvas>
          <div className="label">Left channel</div>
        </div>
        <div className="spectrogram">
          <canvas id="rightSpectrogram"></canvas>
          <div className="label">Right channel</div>
        </div>
        <div className="separator"></div>
      </div>
      <Controls />
    </>
  );
}

export default App;
