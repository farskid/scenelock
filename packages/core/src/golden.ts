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

export type GoldenVerdict = "match" | "mismatch" | "missing-baseline" | "dimension-mismatch";

export interface GoldenDiff {
  verdict: GoldenVerdict;
  /** Byte index of first mismatch when verdict === "mismatch". */
  firstDiffByte?: number;
  /** Count of differing bytes. */
  diffByteCount?: number;
  expected?: { width: number; height: number };
  actual?: { width: number; height: number };
  /** Path written for human/agent inspection when mismatch. */
  diffPath?: string;
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
