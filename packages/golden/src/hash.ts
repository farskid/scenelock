import { createHash } from "node:crypto";
import type { RasterFrame } from "@scenelock/core";

/**
 * SHA-256 of raw RGBA bytes (row-major). Used as the content hash inside
 * `.golden` files and as the bit-exact compare fast path.
 */
export function hashPixels(pixels: Uint8ClampedArray | Uint8Array): string {
  return createHash("sha256").update(pixels).digest("hex");
}

/** Content hash for a {@link RasterFrame}. */
export function hashFrame(frame: RasterFrame): string {
  assertFrameShape(frame);
  return hashPixels(frame.pixels);
}

/** Throws if width/height/pixel length are inconsistent. */
export function assertFrameShape(frame: RasterFrame): void {
  const expected = frame.width * frame.height * 4;
  if (frame.width < 0 || frame.height < 0) {
    throw new Error(
      `RasterFrame dimensions must be non-negative (got ${frame.width}×${frame.height})`,
    );
  }
  if (frame.pixels.length !== expected) {
    throw new Error(
      `RasterFrame pixel length ${frame.pixels.length} !== width*height*4 (${expected})`,
    );
  }
}
