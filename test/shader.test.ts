import { describe, test, expect, beforeAll } from "bun:test";

import { promises as fs } from "fs";
import { join } from "path";

import { GlslMinify } from "../src/services/utils/glsl-loader";

const vertexShaderPath = join(__dirname, "../src/services/shaders/vertex.glsl");
const fragmentShaderPath = join(
  __dirname,
  "../src/services/shaders/fragment.glsl",
);
let vertexShaderSrc: string;
let fragmentShaderSrc: string;

beforeAll(async () => {
  vertexShaderSrc = await fs.readFile(vertexShaderPath, "utf8");
  fragmentShaderSrc = await fs.readFile(fragmentShaderPath, "utf8");
});

describe("Test SpectrogramGPURenderer", () => {
  // Helper function to check uniform type
  function checkUniform(
    result: any,
    uniformName: string,
    expectedType: string,
  ) {
    expect(result.uniforms).toHaveProperty(uniformName);
    expect(result.uniforms[uniformName]).toHaveProperty(
      "variableType",
      expectedType,
    );
  }

  test("GLSL files are parsed correctly with GlslMinify", async () => {
    const minify = new GlslMinify();
    const result = await minify.execute(fragmentShaderSrc);
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("sourceCode");
    expect(typeof result.sourceCode).toBe("string");
    expect(result).toHaveProperty("uniforms");
    expect(typeof result.uniforms).toBe("object");

    // Check uniforms
    checkUniform(result, "uSpectrogramSampler", "sampler2D");
    checkUniform(result, "uScaleSampler", "sampler2D");
    checkUniform(result, "uGradientSampler", "sampler2D");
    checkUniform(result, "uSpectrogramOffset", "float");
    checkUniform(result, "uSpectrogramLength", "float");
    checkUniform(result, "uScaleRange", "vec2");
    checkUniform(result, "uContrast", "float");
    checkUniform(result, "uSensitivity", "float");
    checkUniform(result, "uZoom", "float");
  });
});
