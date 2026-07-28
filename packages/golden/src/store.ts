import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  GoldenCompare,
  GoldenCompareOptions,
  GoldenDiff,
  GoldenStore,
  GoldenVerdict,
  RasterFrame,
} from "@scenelock/core";
import { FINGERPRINT_DRIFT_CODE } from "./assumptions.js";
import { compareFrames, toGoldenDiff, type DiffReport, type FrameCompareResult } from "./compare.js";
import {
  GOLDEN_FILE_EXT,
  readGoldenFile,
  writeGoldenFile,
  type GoldenFile,
} from "./format.js";
import { hashFrame } from "./hash.js";

/** @deprecated Use {@link GoldenVerdict} from `@scenelock/core`. */
export type GoldenRunVerdict = GoldenVerdict;

/**
 * Full compare result for directory store runs.
 * Core {@link GoldenDiff} is available via {@link GoldenRunResult.diff}.
 */
export interface GoldenRunResult {
  verdict: GoldenVerdict;
  testId: string;
  diff: GoldenDiff;
  /** Structured pixel report on mismatch. */
  report?: DiffReport;
  /** Paths written for agent inspection (pointers, not blobs). */
  artifacts?: {
    actual?: string;
    expected?: string;
    diffReport?: string;
  };
  actualHash?: string;
  expectedHash?: string;
  storedFingerprint?: string;
  runFingerprint?: string;
  /** True when missing baseline was written because update=true. */
  wroteBaseline?: boolean;
}

export interface DirectoryGoldenStoreOptions {
  /** Root directory for `*.golden` files. */
  directory: string;
  /**
   * Explicit pinned-rasterizer identity. Stored in every written golden;
   * compared on load. Mismatch ⇒ fingerprint-drift (env drift, not regression).
   */
  rasterizerFingerprint: string;
  /** zlib-compress pixel payloads (default true). */
  compress?: boolean;
  /** Directory for mismatch artifacts (default `<directory>/.artifacts`). */
  artifactDir?: string;
  /** Max differing-pixel samples in diff reports (default 16). */
  maxDiffSamples?: number;
}

/**
 * Filesystem golden store keyed by test id.
 *
 * - `name` / test id → `<directory>/<safe-id>.golden`
 * - Missing baseline never auto-passes (`missing-baseline`).
 * - `update` / `updateGoldens` writes the baseline but still returns
 *   `missing-baseline` / `updated` so a clean re-run is required.
 * - {@link DirectoryGoldenStore.reportStale} lists on-disk goldens with no
 *   owner in the current run (report-only; never deletes).
 */
export class DirectoryGoldenStore implements GoldenStore {
  readonly directory: string;
  readonly rasterizerFingerprint: string;
  readonly artifactDir: string;
  private readonly compress: boolean;
  private readonly maxDiffSamples: number;
  /** Test ids observed during the current run (for stale detection). */
  private readonly owned = new Set<string>();

  constructor(options: DirectoryGoldenStoreOptions) {
    if (!options.rasterizerFingerprint) {
      throw new Error("rasterizerFingerprint is required (determinism guard)");
    }
    this.directory = resolve(options.directory);
    this.rasterizerFingerprint = options.rasterizerFingerprint;
    this.artifactDir = resolve(options.artifactDir ?? join(this.directory, ".artifacts"));
    this.compress = options.compress !== false;
    this.maxDiffSamples = options.maxDiffSamples ?? 16;
  }

  /** Absolute path for a test id's `.golden` file. */
  pathFor(testId: string): string {
    return join(this.directory, `${sanitizeTestId(testId)}${GOLDEN_FILE_EXT}`);
  }

  /** Mark the start of a run (clears ownership set used by stale detection). */
  beginRun(): void {
    this.owned.clear();
  }

  /** Record that `testId` was exercised (owner of its baseline this run). */
  markOwned(testId: string): void {
    this.owned.add(testId);
  }

  /**
   * Goldens on disk whose sanitized basename was not marked owned this run.
   * Report-only — does not delete.
   */
  async reportStale(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw err;
    }

    const ownedFiles = new Set(
      [...this.owned].map((id) => `${sanitizeTestId(id)}${GOLDEN_FILE_EXT}`),
    );
    const stale: string[] = [];
    for (const name of names) {
      if (!name.endsWith(GOLDEN_FILE_EXT)) continue;
      if (!ownedFiles.has(name)) {
        stale.push(name.slice(0, -GOLDEN_FILE_EXT.length));
      }
    }
    return stale.sort();
  }

  /** Core {@link GoldenStore.read}: frame only (fingerprint checked via {@link readEntry}). */
  async read(name: string): Promise<RasterFrame | null> {
    const entry = await this.readEntry(name);
    return entry?.frame ?? null;
  }

  /** Load full golden entry including fingerprint + hash. */
  async readEntry(name: string): Promise<GoldenFile | null> {
    const path = this.pathFor(name);
    try {
      return await readGoldenFile(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  /** Core {@link GoldenStore.write} using this store's fingerprint. */
  async write(name: string, frame: RasterFrame): Promise<void> {
    await writeGoldenFile(this.pathFor(name), frame, this.rasterizerFingerprint, {
      compress: this.compress,
    });
  }

  /**
   * Compare `actual` against the baseline for `testId`.
   *
   * @param options.update / updateGoldens — write/overwrite baseline; never
   *   silently treat a new golden as a match.
   */
  async compare(
    testId: string,
    actual: RasterFrame,
    options: GoldenCompareOptions & { updateGoldens?: boolean } = {},
  ): Promise<GoldenRunResult> {
    this.markOwned(testId);
    const update = options.update === true || options.updateGoldens === true;
    const key = options.suite ? `${options.suite}/${testId}` : testId;

    const entry = await this.readEntry(key);
    if (!entry) {
      if (update) {
        await this.write(key, actual);
        const diff: GoldenDiff = { verdict: "missing-baseline" };
        return {
          verdict: "missing-baseline",
          testId: key,
          diff,
          wroteBaseline: true,
          actualHash: hashFrame(actual),
          runFingerprint: this.rasterizerFingerprint,
        };
      }
      return {
        verdict: "missing-baseline",
        testId: key,
        diff: { verdict: "missing-baseline" },
        wroteBaseline: false,
        actualHash: hashFrame(actual),
        runFingerprint: this.rasterizerFingerprint,
      };
    }

    if (entry.rasterizerFingerprint !== this.rasterizerFingerprint) {
      return {
        verdict: "fingerprint-drift",
        testId: key,
        diff: {
          verdict: "fingerprint-drift",
          expected: { width: entry.frame.width, height: entry.frame.height },
          actual: { width: actual.width, height: actual.height },
          storedFingerprint: entry.rasterizerFingerprint,
          runFingerprint: this.rasterizerFingerprint,
        },
        storedFingerprint: entry.rasterizerFingerprint,
        runFingerprint: this.rasterizerFingerprint,
        expectedHash: entry.contentHash,
        actualHash: hashFrame(actual),
      };
    }

    const compared: FrameCompareResult = compareFrames(actual, entry.frame, {
      maxSamples: this.maxDiffSamples,
    });

    const hashes = {
      ...(compared.actualHash !== undefined ? { actualHash: compared.actualHash } : {}),
      ...(compared.expectedHash !== undefined ? { expectedHash: compared.expectedHash } : {}),
    };

    if (compared.verdict === "match") {
      return {
        verdict: "match",
        testId: key,
        diff: toGoldenDiff(compared),
        ...hashes,
        storedFingerprint: entry.rasterizerFingerprint,
        runFingerprint: this.rasterizerFingerprint,
      };
    }

    if (update) {
      await this.write(key, actual);
      return {
        verdict: "updated",
        testId: key,
        diff: toGoldenDiff(compared),
        ...(compared.report !== undefined ? { report: compared.report } : {}),
        wroteBaseline: true,
        ...hashes,
        storedFingerprint: entry.rasterizerFingerprint,
        runFingerprint: this.rasterizerFingerprint,
      };
    }

    const artifacts = await this.writeMismatchArtifacts(key, actual, entry.frame, compared);
    return {
      verdict: compared.verdict,
      testId: key,
      diff: toGoldenDiff(compared, artifacts.diffReport),
      ...(compared.report !== undefined ? { report: compared.report } : {}),
      artifacts,
      ...hashes,
      storedFingerprint: entry.rasterizerFingerprint,
      runFingerprint: this.rasterizerFingerprint,
    };
  }

  private async writeMismatchArtifacts(
    testId: string,
    actual: RasterFrame,
    expected: RasterFrame,
    compared: FrameCompareResult,
  ): Promise<{ actual: string; expected: string; diffReport: string }> {
    await mkdir(this.artifactDir, { recursive: true });
    const safe = sanitizeTestId(testId);
    const actualPath = join(this.artifactDir, `${safe}.actual${GOLDEN_FILE_EXT}`);
    const expectedPath = join(this.artifactDir, `${safe}.expected${GOLDEN_FILE_EXT}`);
    const diffReportPath = join(this.artifactDir, `${safe}.diff.json`);

    await writeGoldenFile(actualPath, actual, this.rasterizerFingerprint, {
      compress: this.compress,
    });
    await writeGoldenFile(expectedPath, expected, this.rasterizerFingerprint, {
      compress: this.compress,
    });

    const payload = {
      testId,
      verdict: compared.verdict,
      actualHash: compared.actualHash,
      expectedHash: compared.expectedHash,
      report: compared.report ?? null,
      note: "Token-cheap pixel diff; no image dump (research 04).",
    };
    await writeFile(diffReportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    return { actual: actualPath, expected: expectedPath, diffReport: diffReportPath };
  }
}

/** Sanitize a test id into a single path segment. */
export function sanitizeTestId(testId: string): string {
  const cleaned = testId.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) {
    throw new Error(`test id "${testId}" sanitizes to an empty path segment`);
  }
  return cleaned;
}

/** In-memory {@link GoldenStore} for unit tests without the filesystem. */
export function createMemoryGoldenStore(
  initial: Record<string, RasterFrame> = {},
): GoldenStore {
  const map = new Map(Object.entries(initial));
  return {
    async read(name) {
      return map.get(name) ?? null;
    },
    async write(name, frame) {
      map.set(name, frame);
    },
  };
}

/**
 * Core {@link GoldenCompare} over any {@link GoldenStore}.
 * Prefer {@link DirectoryGoldenStore.compare} for fingerprint + artifacts.
 */
export function createGoldenCompare(store: GoldenStore): GoldenCompare {
  return {
    async compare(name, actual, options: GoldenCompareOptions = {}): Promise<GoldenDiff> {
      const key = options.suite ? `${options.suite}/${name}` : name;
      const expected = await store.read(key);
      if (!expected) {
        if (options.update) {
          await store.write(key, actual);
        }
        return { verdict: "missing-baseline" };
      }
      return toGoldenDiff(compareFrames(actual, expected));
    },
  };
}

/** True when the result is environment drift (not a visual regression). */
export function isFingerprintDrift(result: GoldenRunResult): boolean {
  return result.verdict === "fingerprint-drift";
}

/** Human/agent message for fingerprint drift. */
export function fingerprintDriftMessage(result: GoldenRunResult): string {
  return (
    `${FINGERPRINT_DRIFT_CODE}: rasterizer fingerprint mismatch ` +
    `(stored=${JSON.stringify(result.storedFingerprint)}, ` +
    `run=${JSON.stringify(result.runFingerprint)}). ` +
    `This is environment drift, not a visual regression.`
  );
}
