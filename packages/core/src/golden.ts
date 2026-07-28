import type { BBox } from "./bbox.js";

/**
 * Bit-exact golden comparison contracts.
 * Tolerance-based visual diffs are out of scope (map).
 * Pin a software rasterizer; document OS/font assumptions in @scenelock/golden.
 */

export interface RasterFrame {
  width: number;
  height: number;
  /** RGBA, row-major, length === width * height * 4. */
  pixels: Uint8ClampedArray;
}

/** RGBA tuple. */
export type Rgba = readonly [number, number, number, number];

/** One differing pixel sample for agent-readable reports (no image dumps). */
export interface PixelDiffSample {
  x: number;
  y: number;
  /** Byte index of the R channel in the flat RGBA buffer. */
  byteOffset: number;
  actual: Rgba;
  expected: Rgba;
}

export type GoldenVerdict =
  | "match"
  | "mismatch"
  | "missing-baseline"
  | "dimension-mismatch"
  /** Stored rasterizer fingerprint ≠ run fingerprint (env drift, not regression). */
  | "fingerprint-drift"
  /** Baseline was overwritten via update=true; clean re-run still required. */
  | "updated";

/**
 * Pixel-level golden report (research 04 — pointers/text, not image blobs).
 * Byte-oriented fields remain for agents that prefer flat-buffer indexing.
 */
export interface GoldenDiff {
  verdict: GoldenVerdict;
  /** Count of differing pixels when verdict === "mismatch". */
  differingPixelCount?: number;
  /** Axis-aligned bbox of differing pixels (null when zero). */
  boundingBox?: BBox | null;
  /** First N differing coordinates with actual/expected RGBA. */
  samples?: readonly PixelDiffSample[];
  /** Byte index of first mismatch when verdict === "mismatch". */
  firstDiffByte?: number;
  /** Count of differing bytes. */
  diffByteCount?: number;
  expected?: { width: number; height: number };
  actual?: { width: number; height: number };
  /** Path written for human/agent inspection when mismatch. */
  diffPath?: string;
  /** Fingerprints when verdict === "fingerprint-drift". */
  storedFingerprint?: string;
  runFingerprint?: string;
}

export interface GoldenStore {
  read(name: string): Promise<RasterFrame | null>;
  write(name: string, frame: RasterFrame): Promise<void>;
}

export interface GoldenCompareOptions {
  /** When true, write actual as the new baseline on missing-baseline. */
  update?: boolean;
  /** Directory or logical store key prefix. */
  suite?: string;
}

export interface GoldenCompare {
  compare(name: string, actual: RasterFrame, options?: GoldenCompareOptions): Promise<GoldenDiff>;
}
