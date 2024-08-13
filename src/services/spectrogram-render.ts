import { colorRamp, Gradient, HEATED_METAL_GRADIENT } from "./color-util";
import {
  TypedArray,
  lerp,
  mod,
  hzToMel,
  melToHz,
  nyquistFrequency,
} from "./math-util";
import FragmentShaderSrc from "./shaders/fragment.glsl";
import VertexShaderSrc from "./shaders/vertex.glsl";
import { Scale } from "./spectrogram";
import { GlslMinify } from "./glsl-loader";

export class Circular2DDataBuffer<T extends TypedArray> {
  // Number of columns in the buffer
  public numColumns: number;

  // Number of rows in the buffer
  public numRows: number;

  // Size of each element in the buffer (e.g., number of bytes or components)
  public elementSize: number;

  // Starting index of the circular buffer
  public startIndex: number;

  // Current length of the data in the buffer (number of columns filled)
  public currentLength: number;

  // The actual buffer holding the data, of type T (which extends TypedArray)
  public bufferData: T;

  constructor(
    // Either the TypedArray constructor or an existing TypedArray instance
    TypedArrayConstructorOrData: T | { new (length: number): T },
    // Number of columns in the buffer
    numColumns: number,
    // Number of rows in the buffer
    numRows: number,
    // Size of each element in the buffer (e.g., number of bytes or components)
    elementSize: number,
    // Initial starting index of the circular buffer (default is 0)
    startIndex: number = 0,
    // Initial length of the data in the buffer (default is 0)
    currentLength: number = 0,
  ) {
    this.numColumns = numColumns;
    this.numRows = numRows;
    this.elementSize = elementSize;
    this.startIndex = startIndex;
    this.currentLength = currentLength;

    // Initialize the data buffer
    if (typeof TypedArrayConstructorOrData === "function") {
      // If TypedArrayConstructorOrData is a constructor, create a new TypedArray instance
      this.bufferData = new TypedArrayConstructorOrData(
        numColumns * numRows * elementSize,
      );
    } else {
      // If TypedArrayConstructorOrData is an existing TypedArray instance, use it directly
      this.bufferData = TypedArrayConstructorOrData;
    }
  }

  // Adds new data to the buffer. newData has length
  enqueue(newData: T): void {
    // Calculate the number of columns in the incoming data. Remaining data will be ignored
    const numNewColumns = Math.floor(
      newData.length / (this.elementSize * this.numRows),
    );

    // Loop through each column of the incoming data
    for (let i = 0; i < numNewColumns; i += 1) {
      // Calculate the target column index in the circular buffer
      const targetIndex = mod(
        this.startIndex + this.currentLength + i,
        this.numColumns,
      );

      // Set the data for the target column
      this.bufferData.set(
        newData.subarray(i * this.numRows, (i + 1) * this.numRows),
        targetIndex * this.numRows,
      );
    }

    // Update the current length of the buffer with the number of new columns
    this.currentLength += numNewColumns;

    // If the buffer exceeds its capacity, adjust the start index and current length
    if (this.currentLength > this.numColumns) {
      this.startIndex = mod(
        this.startIndex + this.currentLength - this.numColumns,
        this.numColumns,
      );
      this.currentLength = this.numColumns;
    }
  }

  // Resizes the width of the buffer, preserving newer data
  resizeWidth(newNumColumns: number): void {
    // If the new width is the same as the current width, do nothing
    if (newNumColumns === this.numColumns) {
      return;
    }

    // Create a new buffer with the new width
    const newBufferData: T = new (Object.getPrototypeOf(
      this.bufferData,
    ).constructor)(newNumColumns * this.numRows * this.elementSize);

    // Copy the most recent data to the new buffer
    for (let i = 0; i < Math.min(this.currentLength, newNumColumns); i += 1) {
      const newIndex = Math.min(this.currentLength, newNumColumns) - i - 1;
      const oldIndex = mod(
        this.startIndex + this.currentLength - i - 1,
        this.numColumns,
      );
      newBufferData.set(
        this.bufferData.subarray(
          oldIndex * this.numRows,
          (oldIndex + 1) * this.numRows,
        ),
        newIndex * this.numRows,
      );
    }

    // Replace the old buffer with the new buffer
    this.bufferData = newBufferData;
    this.numColumns = newNumColumns;

    // Adjust the current length and start index
    if (this.currentLength >= this.numColumns) {
      this.currentLength = this.numColumns;
    }
    this.startIndex = 0;
  }

  // Clears the buffer
  clear(): void {
    // Create an empty buffer with the same dimensions
    const emptyBufferData: T = new (Object.getPrototypeOf(
      this.bufferData,
    ).constructor)(this.numColumns * this.numRows * this.elementSize);

    // Replace the old buffer with the empty buffer
    this.bufferData = emptyBufferData;
    this.startIndex = 0;
    this.currentLength = 0;
  }

  // Display function to render the buffer in 2D
  display(threshold: number = 3): void {
    console.log("Buffer Data:");

    const totalRows = this.numRows;
    const showStartRows = Math.min(threshold, totalRows);
    const showEndRows = Math.min(threshold, totalRows - showStartRows);

    // Display the first few rows
    for (let i = 0; i < showStartRows; i++) {
      this.printRow(i, threshold);
    }

    // Ellipsis if there are hidden rows in the middle
    if (totalRows > 2 * threshold) {
      console.log("...");
    }

    // Display the last few rows
    for (let i = 0; i < showEndRows; i++) {
      this.printRow(totalRows - showEndRows + i, threshold);
    }
  }

  // Helper function to print a single row
  private printRow(rowIdx: number, threshold: number): void {
    let row = "";

    const totalColumns = this.numColumns;
    const showStartColumns = Math.min(threshold, totalColumns);
    const showEndColumns = Math.min(threshold, totalColumns - showStartColumns);

    // Display first few columns
    for (let j = 0; j < showStartColumns; j++) {
      const index =
        mod(this.startIndex + j, totalColumns) * this.numRows + rowIdx;
      row += this.formatValue(this.bufferData[index]) + "\t";
    }

    // Ellipsis if there are hidden columns in the middle
    if (totalColumns > 2 * threshold) {
      row += "...\t";
    }

    // Display last few columns
    for (let j = 0; j < showEndColumns; j++) {
      const index =
        mod(this.startIndex + totalColumns - showEndColumns + j, totalColumns) *
          this.numRows +
        rowIdx;
      row += this.formatValue(this.bufferData[index]) + "\t";
    }

    console.log(row.trim());
  }

  // Helper function to format values based on the TypedArray type
  private formatValue(value: number): string {
    if (
      this.bufferData instanceof Float32Array ||
      this.bufferData instanceof Float64Array
    ) {
      return value.toFixed(4); // Formatting for floating-point numbers
    }
    return value.toString(); // Default formatting for other types
  }
}

const glslLoader = new GlslMinify(FragmentShaderSrc);
const FragmentShader = await glslLoader.execute(FragmentShaderSrc);
const VertexShader = await glslLoader.execute(VertexShaderSrc);

// Helper function to get all uniform locations
const getAllUniformLocations = (
  program: WebGLProgram,
  ctx: WebGLRenderingContext,
) => {
  const uniformLocations: Map<string, WebGLUniformLocation | null> = new Map();
  const numUniforms = ctx.getProgramParameter(program, ctx.ACTIVE_UNIFORMS);

  for (let i = 0; i < numUniforms; ++i) {
    const uniformInfo = ctx.getActiveUniform(program, i);
    if (!uniformInfo) {
      break;
    }
    const name = uniformInfo.name;
    const location = ctx.getUniformLocation(program, name);
    uniformLocations.set(name, location?.toString() || null);
  }

  return uniformLocations;
};

export interface RenderParameters {
  contrast: number;
  sensitivity: number;
  zoom: number;
  minFrequencyHz: number;
  maxFrequencyHz: number;
  sampleRate: number;
  windowSize: number;
  scale: Scale;
  gradient: Gradient;
}

export const DEFAULT_RENDER_PARAMETERS: RenderParameters = {
  contrast: 25,
  sensitivity: 25,
  zoom: 4,
  minFrequencyHz: 10,
  maxFrequencyHz: 12000,
  sampleRate: 48000,
  windowSize: 4096,
  scale: "mel",
  gradient: HEATED_METAL_GRADIENT,
};

function merge<T>(
  newValue: T | undefined | null,
  oldValue: T | undefined | null,
  defaultValue: T,
): T {
  if (newValue !== undefined && newValue !== null) {
    return newValue;
  }
  if (oldValue !== undefined && oldValue !== null) {
    return oldValue;
  }
  return defaultValue;
}

function stepTowards(x: number, y: number, amount: number): number {
  if (Math.abs(x - y) < 1e-9) {
    return y;
  }
  return lerp(x, y, amount);
}

export class SpectrogramGPURenderer {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: WebGLRenderingContext;

  private readonly vertexBuffer: WebGLBuffer;

  private readonly indexBuffer: WebGLBuffer;

  private spectrogramTexture: WebGLTexture;

  private scaleTexture: WebGLTexture | null = null;

  private gradientTexture: WebGLTexture | null = null;

  private spectrogramWidth: number;

  private spectrogramHeight: number;

  private spectrogramLength: number = 0;

  private spectrogramOffset: number = 0;

  private lastSpectrogramStart: number | null = null;

  private lastSpectrogramLength: number = 0;

  private parameters: RenderParameters | null = null;

  private scaleRange: [number, number] = [0, 0];

  private currentScaleRange: [number, number] = [0, 0];

  private currentContrast: number = 25;

  private currentSensitivity: number = 25;

  private currentZoom: number = 4;

  private resizeHandlerLastRealWidth: number = 0;

  private resizeHandlerZoomOverride: number = 1;

  private readonly program: {
    program: WebGLProgram;
    positionAttribute: number;
    texCoordAttribute: number;
    spectrogramSamplerUniform: WebGLUniformLocation;
    scaleSamplerUniform: WebGLUniformLocation;
    gradientSamplerUniform: WebGLUniformLocation;
    spectrogramOffsetUniform: WebGLUniformLocation;
    spectrogramLengthUniform: WebGLUniformLocation;
    scaleRangeUniform: WebGLUniformLocation;
    contrastUniform: WebGLUniformLocation;
    sensitivityUniform: WebGLUniformLocation;
    zoomUniform: WebGLUniformLocation;
  };

  constructor(
    canvas: HTMLCanvasElement,
    spectrogramWidth: number,
    spectrogramHeight: number,
  ) {
    this.canvas = canvas;
    const ctx = this.canvas.getContext("webgl");

    if (ctx === null) {
      throw new Error(
        "Unable to create WebGL context. Your browser or machine may not support it.",
      );
    }
    this.ctx = ctx;

    if (this.ctx.getExtension("OES_texture_float") === null) {
      throw new Error("OES_texture_float extension is not supported");
    }

    if (this.ctx.getExtension("OES_texture_float_linear") === null) {
      throw new Error("OES_texture_float_linear extension is not supported");
    }

    const program = this.loadProgram(
      VertexShader.sourceCode,
      FragmentShader.sourceCode,
    );
    this.program = {
      program,
      positionAttribute: this.ctx.getAttribLocation(program, "aVertexPos"),
      texCoordAttribute: this.ctx.getAttribLocation(program, "aVertexTexCoord"),
      spectrogramSamplerUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uSpectrogramSampler.variableName,
      ),
      scaleSamplerUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uScaleSampler.variableName,
      ),
      gradientSamplerUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uGradientSampler.variableName,
      ),
      spectrogramOffsetUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uSpectrogramOffset.variableName,
      ),
      spectrogramLengthUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uSpectrogramLength.variableName,
      ),
      scaleRangeUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uScaleRange.variableName,
      ),
      contrastUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uContrast.variableName,
      ),
      sensitivityUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uSensitivity.variableName,
      ),
      zoomUniform: this.getUniformLocation(
        program,
        FragmentShader.uniforms.uZoom.variableName,
      ),
    };

    const [vertexBuffer, indexBuffer] = this.createFullscreenQuad();
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;

    this.ctx.pixelStorei(this.ctx.UNPACK_ALIGNMENT, 1);

    this.spectrogramWidth = spectrogramWidth;
    this.spectrogramHeight = spectrogramHeight;
    // Store the spectrogram in the reverse orientation for faster updates
    this.spectrogramTexture = this.createSpectrogramTexture(
      this.spectrogramHeight,
      this.spectrogramWidth,
    );

    this.updateParameters({});
  }

  render() {
    this.ctx.clearColor(0.0, 0.0, 0.0, 1.0);
    this.ctx.clear(this.ctx.COLOR_BUFFER_BIT);

    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vertexBuffer);
    this.ctx.bindBuffer(this.ctx.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    this.ctx.vertexAttribPointer(
      this.program.positionAttribute,
      2,
      this.ctx.FLOAT,
      false,
      16,
      0,
    );
    this.ctx.enableVertexAttribArray(this.program.positionAttribute);
    this.ctx.vertexAttribPointer(
      this.program.texCoordAttribute,
      2,
      this.ctx.FLOAT,
      false,
      16,
      8,
    );
    this.ctx.enableVertexAttribArray(this.program.texCoordAttribute);

    this.ctx.useProgram(this.program.program);
    this.ctx.uniform1f(
      this.program.spectrogramOffsetUniform,
      this.spectrogramOffset,
    );
    this.ctx.uniform1f(
      this.program.spectrogramLengthUniform,
      this.spectrogramLength,
    );

    // Smoothing factor to make render parameter changes gradually interpolate to their new
    // value
    const LERP_AMOUNT = 0.5;
    this.currentScaleRange = [
      stepTowards(this.currentScaleRange[0], this.scaleRange[0], LERP_AMOUNT),
      stepTowards(this.currentScaleRange[1], this.scaleRange[1], LERP_AMOUNT),
    ];
    this.currentContrast = stepTowards(
      this.currentContrast,
      this.parameters!.contrast,
      LERP_AMOUNT,
    );
    // Don't interpolate the contrast when it gets close to 0 to avoid numerical instability in
    // the shader
    if (this.currentContrast < 0.05) {
      this.currentContrast = 0.0;
    }
    this.currentSensitivity = stepTowards(
      this.currentSensitivity,
      this.parameters!.sensitivity,
      LERP_AMOUNT,
    );
    this.currentZoom = stepTowards(
      this.currentZoom,
      this.parameters!.zoom,
      LERP_AMOUNT,
    );
    this.ctx.uniform2fv(this.program.scaleRangeUniform, this.currentScaleRange);
    this.ctx.uniform1f(this.program.contrastUniform, this.currentContrast);
    this.ctx.uniform1f(
      this.program.sensitivityUniform,
      this.currentSensitivity,
    );
    this.ctx.uniform1f(
      this.program.zoomUniform,
      this.resizeHandlerZoomOverride * this.currentZoom,
    );

    this.ctx.activeTexture(this.ctx.TEXTURE0);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.spectrogramTexture);
    this.ctx.uniform1i(this.program.spectrogramSamplerUniform, 0);

    this.ctx.activeTexture(this.ctx.TEXTURE1);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.scaleTexture);
    this.ctx.uniform1i(this.program.scaleSamplerUniform, 1);

    this.ctx.activeTexture(this.ctx.TEXTURE2);
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.gradientTexture);
    this.ctx.uniform1i(this.program.gradientSamplerUniform, 2);

    this.ctx.drawElements(this.ctx.TRIANGLES, 6, this.ctx.UNSIGNED_SHORT, 0);
  }

  public resizeCanvas(width: number, height: number) {
    this.lastSpectrogramStart = null;
    this.resizeHandlerZoomOverride = 1;
    this.resizeHandlerLastRealWidth = width;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.viewport(0, 0, width, height);
  }

  public fastResizeCanvas(width: number, height: number) {
    this.resizeHandlerZoomOverride = this.resizeHandlerLastRealWidth / width;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.viewport(0, 0, width, height);
  }

  public updateParameters(parameters: Partial<RenderParameters>) {
    const newParameters: RenderParameters = {
      contrast: merge(
        parameters.contrast,
        this.parameters?.contrast,
        DEFAULT_RENDER_PARAMETERS.contrast,
      ),
      sensitivity: merge(
        parameters.sensitivity,
        this.parameters?.sensitivity,
        DEFAULT_RENDER_PARAMETERS.sensitivity,
      ),
      zoom: merge(
        parameters.zoom,
        this.parameters?.zoom,
        DEFAULT_RENDER_PARAMETERS.zoom,
      ),
      minFrequencyHz: merge(
        parameters.minFrequencyHz,
        this.parameters?.minFrequencyHz,
        DEFAULT_RENDER_PARAMETERS.minFrequencyHz,
      ),
      maxFrequencyHz: merge(
        parameters.maxFrequencyHz,
        this.parameters?.maxFrequencyHz,
        DEFAULT_RENDER_PARAMETERS.maxFrequencyHz,
      ),
      sampleRate: merge(
        parameters.sampleRate,
        this.parameters?.sampleRate,
        DEFAULT_RENDER_PARAMETERS.sampleRate,
      ),
      windowSize: merge(
        parameters.windowSize,
        this.parameters?.windowSize,
        DEFAULT_RENDER_PARAMETERS.windowSize,
      ),
      scale: merge(
        parameters.scale,
        this.parameters?.scale,
        DEFAULT_RENDER_PARAMETERS.scale,
      ),
      gradient: merge(
        parameters.gradient,
        this.parameters?.gradient,
        DEFAULT_RENDER_PARAMETERS.gradient,
      ),
    };

    if (
      this.parameters === null ||
      this.parameters.gradient !== newParameters.gradient
    ) {
      this.updateGradientTexture(newParameters.gradient);
    }

    if (
      this.parameters === null ||
      this.parameters.scale !== newParameters.scale ||
      this.parameters.minFrequencyHz !== newParameters.minFrequencyHz ||
      this.parameters.maxFrequencyHz !== newParameters.maxFrequencyHz ||
      this.parameters.sampleRate !== newParameters.sampleRate ||
      this.parameters.windowSize !== newParameters.windowSize
    ) {
      this.updateScaleRange(
        newParameters.scale,
        newParameters.minFrequencyHz,
        newParameters.maxFrequencyHz,
        newParameters.sampleRate,
        newParameters.windowSize,
      );
    }

    if (
      this.parameters === null ||
      this.parameters.scale !== newParameters.scale ||
      this.parameters.sampleRate !== newParameters.sampleRate ||
      this.parameters.windowSize !== newParameters.windowSize
    ) {
      this.updateScaleTexture(
        newParameters.scale,
        newParameters.sampleRate,
        newParameters.windowSize,
      );
      this.currentScaleRange = this.scaleRange;
    }

    this.parameters = newParameters;
  }

  public updateSpectrogram(
    circular2dQueue: Circular2DDataBuffer<Float32Array>,
    forceFullRender: boolean = false,
  ) {
    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.spectrogramTexture);

    if (forceFullRender || this.lastSpectrogramStart === null) {
      this.ctx.texImage2D(
        this.ctx.TEXTURE_2D,
        0,
        this.ctx.LUMINANCE,
        circular2dQueue.numRows,
        circular2dQueue.numColumns,
        0,
        this.ctx.LUMINANCE,
        this.ctx.FLOAT,
        circular2dQueue.bufferData,
      );
    } else if (circular2dQueue.startIndex !== this.lastSpectrogramStart) {
      if (circular2dQueue.startIndex >= this.lastSpectrogramStart) {
        this.updateSpectrogramPartial(
          circular2dQueue.numRows,
          circular2dQueue.startIndex - this.lastSpectrogramStart,
          this.lastSpectrogramStart,
          circular2dQueue.bufferData,
        );
      } else {
        this.updateSpectrogramPartial(
          circular2dQueue.numRows,
          circular2dQueue.startIndex,
          0,
          circular2dQueue.bufferData,
        );
        this.updateSpectrogramPartial(
          circular2dQueue.numRows,
          circular2dQueue.numColumns - this.lastSpectrogramStart,
          this.lastSpectrogramStart,
          circular2dQueue.bufferData,
        );
      }
    } else if (circular2dQueue.currentLength > this.lastSpectrogramLength) {
      this.updateSpectrogramPartial(
        circular2dQueue.numRows,
        circular2dQueue.currentLength - this.lastSpectrogramLength,
        this.lastSpectrogramLength,
        circular2dQueue.bufferData,
      );
    }

    this.lastSpectrogramLength = circular2dQueue.currentLength;
    this.lastSpectrogramStart = circular2dQueue.startIndex;
    this.spectrogramOffset =
      circular2dQueue.startIndex / circular2dQueue.numColumns;
    this.spectrogramLength =
      -0.5 / circular2dQueue.numColumns +
      circular2dQueue.currentLength / circular2dQueue.numColumns;
  }

  private updateSpectrogramPartial(
    width: number,
    height: number,
    dataStart: number,
    data: Float32Array,
  ) {
    this.ctx.texSubImage2D(
      this.ctx.TEXTURE_2D,
      0,
      0,
      dataStart,
      width,
      height,
      this.ctx.LUMINANCE,
      this.ctx.FLOAT,
      data.subarray(dataStart * width, (dataStart + height) * width),
    );
  }

  private getUniformLocation(
    program: WebGLProgram,
    name: string,
  ): WebGLUniformLocation {
    const location = this.ctx.getUniformLocation(program, name);

    if (location === null) {
      throw new Error(`Could not get uniform location for ${name}`);
    }

    return location;
  }

  private loadProgram(
    vertexShaderSrc: string,
    fragmentShaderSrc: string,
  ): WebGLProgram {
    const vertexShader = this.loadShader(
      this.ctx.VERTEX_SHADER,
      vertexShaderSrc,
    );
    const fragmentShader = this.loadShader(
      this.ctx.FRAGMENT_SHADER,
      fragmentShaderSrc,
    );

    const program = this.ctx.createProgram();
    if (program === null) {
      throw new Error("Failed to create program");
    }

    this.ctx.attachShader(program, vertexShader);
    this.ctx.attachShader(program, fragmentShader);
    this.ctx.linkProgram(program);
    this.ctx.validateProgram(program);

    if (!this.ctx.getProgramParameter(program, this.ctx.LINK_STATUS)) {
      const error = this.ctx.getProgramInfoLog(program);
      this.ctx.deleteProgram(program);
      throw new Error(`Failed to link program:\n${error}`);
    }

    return program;
  }

  private loadShader(type: number, src: string): WebGLShader {
    const shader = this.ctx.createShader(type);

    if (shader === null) {
      throw new Error("Could not create shader");
    }

    this.ctx.shaderSource(shader, src);
    this.ctx.compileShader(shader);

    if (!this.ctx.getShaderParameter(shader, this.ctx.COMPILE_STATUS)) {
      const error = this.ctx.getShaderInfoLog(shader);
      this.ctx.deleteShader(shader);
      throw new Error(`Failed to compile shader:\n${error}`);
    }

    return shader;
  }

  private createFullscreenQuad(): [WebGLBuffer, WebGLBuffer] {
    const vertexBuffer = this.ctx.createBuffer();
    const indexBuffer = this.ctx.createBuffer();

    if (vertexBuffer === null || indexBuffer === null) {
      throw new Error("Could not create buffer");
    }

    this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, vertexBuffer);
    this.ctx.bufferData(
      this.ctx.ARRAY_BUFFER,
      // (x, y, u, v) tuples for each vertex
      new Float32Array([
        // v0
        -1.0, 1.0, 0.0, 0.0,
        // v1
        -1.0, -1.0, 0.0, 1.0,
        // v2
        1.0, -1.0, 1.0, 1.0,
        // v3
        1.0, 1.0, 1.0, 0.0,
      ]),
      this.ctx.STATIC_DRAW,
    );

    this.ctx.bindBuffer(this.ctx.ELEMENT_ARRAY_BUFFER, indexBuffer);
    this.ctx.bufferData(
      this.ctx.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([0, 1, 3, 2, 3, 1]),
      this.ctx.STATIC_DRAW,
    );

    return [vertexBuffer, indexBuffer];
  }

  private createSpectrogramTexture(
    width: number,
    height: number,
  ): WebGLTexture {
    const texture = this.ctx.createTexture();

    if (texture === null) {
      throw new Error("Could not create texture");
    }

    this.ctx.bindTexture(this.ctx.TEXTURE_2D, texture);
    this.ctx.texImage2D(
      this.ctx.TEXTURE_2D,
      0,
      this.ctx.LUMINANCE,
      width,
      height,
      0,
      this.ctx.LUMINANCE,
      this.ctx.FLOAT,
      new Float32Array(width * height),
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_S,
      this.ctx.CLAMP_TO_EDGE,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_T,
      this.ctx.CLAMP_TO_EDGE,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MIN_FILTER,
      this.ctx.LINEAR,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MAG_FILTER,
      this.ctx.LINEAR,
    );

    return texture;
  }

  private updateScaleRange(
    scale: Scale,
    minFrequencyHz: number,
    maxFrequencyHz: number,
    sampleRate: number,
    windowSize: number,
  ) {
    const peakHz = nyquistFrequency(sampleRate, windowSize);
    switch (scale) {
      case "linear":
        this.scaleRange = [minFrequencyHz / peakHz, maxFrequencyHz / peakHz];
        break;
      case "mel":
        this.scaleRange = [
          hzToMel(minFrequencyHz) / hzToMel(peakHz),
          hzToMel(maxFrequencyHz) / hzToMel(peakHz),
        ];
        break;
      default:
        throw new Error("Unknown scale");
    }
  }

  private updateScaleTexture(
    scale: Scale,
    sampleRate: number,
    windowSize: number,
  ) {
    const buffer = new Float32Array(this.spectrogramHeight);
    for (let i = 0; i < this.spectrogramHeight; i += 1) {
      const scaleAmount = i / (this.spectrogramHeight - 1);
      switch (scale) {
        case "linear":
          buffer[i] = scaleAmount;
          break;
        case "mel": {
          const peakHz = nyquistFrequency(sampleRate, windowSize);
          buffer[i] = melToHz(scaleAmount * hzToMel(peakHz)) / peakHz;
          break;
        }
        default:
          throw new Error("Unknown scale");
      }
    }

    if (this.scaleTexture === null) {
      this.scaleTexture = this.ctx.createTexture();

      if (this.scaleTexture === null) {
        throw new Error("Could not create texture");
      }
    }

    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.scaleTexture);
    this.ctx.texImage2D(
      this.ctx.TEXTURE_2D,
      0,
      this.ctx.LUMINANCE,
      1,
      this.spectrogramHeight,
      0,
      this.ctx.LUMINANCE,
      this.ctx.FLOAT,
      buffer,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_S,
      this.ctx.CLAMP_TO_EDGE,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_T,
      this.ctx.CLAMP_TO_EDGE,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MIN_FILTER,
      this.ctx.LINEAR,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MAG_FILTER,
      this.ctx.LINEAR,
    );
  }

  private updateGradientTexture(gradient: Gradient) {
    const buffer = new Uint8Array(128 * 3);
    for (let i = 0; i < 128; i += 1) {
      const [r, g, b] = colorRamp(i / 127, gradient);
      buffer[i * 3] = r;
      buffer[i * 3 + 1] = g;
      buffer[i * 3 + 2] = b;
    }

    if (this.gradientTexture === null) {
      this.gradientTexture = this.ctx.createTexture();

      if (this.gradientTexture === null) {
        throw new Error("Could not create texture");
      }
    }

    this.ctx.bindTexture(this.ctx.TEXTURE_2D, this.gradientTexture);
    this.ctx.texImage2D(
      this.ctx.TEXTURE_2D,
      0,
      this.ctx.RGB,
      1,
      128,
      0,
      this.ctx.RGB,
      this.ctx.UNSIGNED_BYTE,
      buffer,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_S,
      this.ctx.CLAMP_TO_EDGE,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_WRAP_T,
      this.ctx.CLAMP_TO_EDGE,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MIN_FILTER,
      this.ctx.LINEAR,
    );
    this.ctx.texParameteri(
      this.ctx.TEXTURE_2D,
      this.ctx.TEXTURE_MAG_FILTER,
      this.ctx.LINEAR,
    );
  }
}
