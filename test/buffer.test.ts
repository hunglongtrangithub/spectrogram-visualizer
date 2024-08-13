import { describe, test } from "bun:test";
import { Circular2DDataBuffer } from "../src/services/spectrogram-render";

describe("Circular2DDataBuffer", () => {
  test("should display elipsis when array is too big", () => {
    const buffer = new Circular2DDataBuffer(Uint32Array, 100, 100, 1);
    for (let i = 0; i < buffer.numColumns; i++) {
      buffer.enqueue(
        Uint32Array.from(
          Array.from({ length: buffer.numRows }, (_, j) => i + j),
        ),
      );
    }
    buffer.display();
  });

  test("should overwrite old data when buffer is full", () => {
    const buffer = new Circular2DDataBuffer(Uint32Array, 3, 2, 1);
    for (let i = 0; i < buffer.numColumns; i++) {
      buffer.enqueue(
        Uint32Array.from(
          Array.from({ length: buffer.numRows }, (_, j) => i + j),
        ),
      );
    }
    buffer.enqueue(Uint32Array.from([0, 0]));
    buffer.display();
  });
});
