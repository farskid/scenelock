import type {
  BBox,
  GoldenDiff,
  GoldenVerdict,
  PixelDiffSample,
  RasterFrame,
  Rgba,
} from "@scenelock/core";
import { assertFrameShape, hashFrame } from "./hash.js";

export type { Rgba, PixelDiffSample };

/** @deprecated Use {@link BBox} from `@scenelock/core`. */
export type DiffBoundingBox = BBox;

/**
 * Token-cheap structured pixel diff (research 04 — pointers/text, not image blobs).
 * Prefer folding into {@link GoldenDiff}; kept for package-local compare helpers.
 */
export interface DiffReport {
  differingPixelCount: number;
  /** Null when zero differing pixels. */
  boundingBox: BBox | null;
  /** First N differing coordinates with actual/expected RGBA. */
  samples: PixelDiffSample[];
  firstDiffByte: number;
  /** Count of differing *bytes* (≤ 4 × differingPixelCount). */
  diffByteCount: number;
}

export interface CompareFramesOptions {
  /** Max samples in the report (default 16). */
  maxSamples?: number;
}

export interface FrameCompareResult {
  verdict: Extract<GoldenVerdict, "match" | "mismatch" | "dimension-mismatch">;
  /** Present on mismatch. */
  report?: DiffReport;
  /** Content hashes when dimensions match. */
  actualHash?: string;
  expectedHash?: string;
  /** Fast-path: hashes equal ⇒ match without scanning pixels. */
  usedHashFastPath?: boolean;
  expected?: { width: number; height: number };
  actual?: { width: number; height: number };
}

function rgbaAt(pixels: Uint8ClampedArray, byteOffset: number): Rgba {
  return [
    pixels[byteOffset] ?? 0,
    pixels[byteOffset + 1] ?? 0,
    pixels[byteOffset + 2] ?? 0,
    pixels[byteOffset + 3] ?? 0,
  ];
}

/**
 * Bit-exact frame comparison.
 *
 * Fast path: SHA-256 equality ⇒ match (no pixel scan).
 * On mismatch: pixel-level report with count, bbox, and first N samples.
 * No tolerance — any byte difference is a mismatch.
 */
export function compareFrames(
  actual: RasterFrame,
  expected: RasterFrame,
  options: CompareFramesOptions = {},
): FrameCompareResult {
  assertFrameShape(actual);
  assertFrameShape(expected);

  if (actual.width !== expected.width || actual.height !== expected.height) {
    return {
      verdict: "dimension-mismatch",
      actual: { width: actual.width, height: actual.height },
      expected: { width: expected.width, height: expected.height },
    };
  }

  const actualHash = hashFrame(actual);
  const expectedHash = hashFrame(expected);
  if (actualHash === expectedHash) {
    return {
      verdict: "match",
      actualHash,
      expectedHash,
      usedHashFastPath: true,
    };
  }

  const maxSamples = options.maxSamples ?? 16;
  const { width, height } = actual;
  const a = actual.pixels;
  const e = expected.pixels;
  const n = a.length;

  let firstDiffByte = -1;
  let diffByteCount = 0;
  let differingPixelCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const samples: PixelDiffSample[] = [];

  for (let i = 0; i < n; i += 4) {
    const dr = a[i] !== e[i];
    const dg = a[i + 1] !== e[i + 1];
    const db = a[i + 2] !== e[i + 2];
    const da = a[i + 3] !== e[i + 3];
    if (!dr && !dg && !db && !da) continue;

    if (firstDiffByte < 0) {
      if (dr) firstDiffByte = i;
      else if (dg) firstDiffByte = i + 1;
      else if (db) firstDiffByte = i + 2;
      else firstDiffByte = i + 3;
    }
    if (dr) diffByteCount++;
    if (dg) diffByteCount++;
    if (db) diffByteCount++;
    if (da) diffByteCount++;

    differingPixelCount++;
    const pixelIndex = i / 4;
    const x = pixelIndex % width;
    const y = (pixelIndex / width) | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;

    if (samples.length < maxSamples) {
      samples.push({
        x,
        y,
        byteOffset: i,
        actual: rgbaAt(a, i),
        expected: rgbaAt(e, i),
      });
    }
  }

  const boundingBox: DiffBoundingBox | null =
    differingPixelCount === 0
      ? null
      : {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        };

  return {
    verdict: "mismatch",
    actualHash,
    expectedHash,
    usedHashFastPath: false,
    actual: { width, height },
    expected: { width, height },
    report: {
      differingPixelCount,
      boundingBox,
      samples,
      firstDiffByte,
      diffByteCount,
    },
  };
}

/** Map a {@link FrameCompareResult} onto the core {@link GoldenDiff} shape. */
export function toGoldenDiff(result: FrameCompareResult, diffPath?: string): GoldenDiff {
  const base: GoldenDiff = { verdict: result.verdict };
  if (result.report) {
    return {
      ...base,
      differingPixelCount: result.report.differingPixelCount,
      boundingBox: result.report.boundingBox,
      samples: result.report.samples,
      firstDiffByte: result.report.firstDiffByte,
      diffByteCount: result.report.diffByteCount,
      ...(result.expected !== undefined ? { expected: result.expected } : {}),
      ...(result.actual !== undefined ? { actual: result.actual } : {}),
      ...(diffPath !== undefined ? { diffPath } : {}),
    };
  }
  return {
    ...base,
    ...(result.expected !== undefined ? { expected: result.expected } : {}),
    ...(result.actual !== undefined ? { actual: result.actual } : {}),
    ...(diffPath !== undefined ? { diffPath } : {}),
  };
}

/**
 * Legacy helper: bit-exact equality as {@link GoldenDiff}.
 * Prefer {@link compareFrames} for hash fast-path + structured reports.
 */
export function framesEqual(a: RasterFrame, b: RasterFrame): GoldenDiff {
  return toGoldenDiff(compareFrames(a, b));
}
