import type {
  GoldenCompare,
  GoldenCompareOptions,
  GoldenDiff,
  GoldenStore,
  GoldenVerdict,
  RasterFrame,
} from "@scenelock/core";

/**
 * @scenelock/golden — bit-exact RGBA golden comparison.
 *
 * ## Pinned rasterizer assumptions
 * Frames must come from a **pinned software rasterizer**. Pass an explicit
 * `rasterizerFingerprint` string; it is stored inside each `.golden` file.
 * Fingerprint mismatch is **environment drift**, not a visual regression.
 *
 * - Prefer software raster (ThorVG SW, Cairo, host `render()→RGBA`).
 * - Do **not** claim cross-machine bit-exact from GPU/compositor paths.
 * - Font/text determinism requires host-pinned fonts + hinting.
 * - Tolerance / perceptual diffs are out of scope (determinism makes them unnecessary).
 * - Thin opt-in tier (research 02): a11y/scene asserts are primary UI truth.
 *
 * ## Format
 * Self-contained `.golden` binary: header + optional zlib payload + SHA-256
 * content hash. No pngjs/sharp — Node `zlib` + `crypto` only.
 */

export type {
  GoldenCompare,
  GoldenCompareOptions,
  GoldenDiff,
  GoldenStore,
  GoldenVerdict,
  RasterFrame,
};

export {
  RASTERIZER_ASSUMPTIONS,
  FINGERPRINT_DRIFT_CODE,
} from "./assumptions.js";

export { hashFrame, hashPixels, assertFrameShape } from "./hash.js";

export {
  GOLDEN_MAGIC,
  GOLDEN_FORMAT_VERSION,
  GOLDEN_FLAG_DEFLATE,
  GOLDEN_FILE_EXT,
  serializeGolden,
  deserializeGolden,
  writeGoldenFile,
  readGoldenFile,
  type GoldenFile,
  type SerializeGoldenOptions,
} from "./format.js";

export {
  compareFrames,
  framesEqual,
  toGoldenDiff,
  type Rgba,
  type PixelDiffSample,
  type DiffBoundingBox,
  type DiffReport,
  type CompareFramesOptions,
  type FrameCompareResult,
} from "./compare.js";

export {
  DirectoryGoldenStore,
  createMemoryGoldenStore,
  createGoldenCompare,
  sanitizeTestId,
  isFingerprintDrift,
  fingerprintDriftMessage,
  type DirectoryGoldenStoreOptions,
  type GoldenRunResult,
  type GoldenRunVerdict,
} from "./store.js";

export { toFailureEnvelope, type GoldenFailureContext } from "./failure.js";
