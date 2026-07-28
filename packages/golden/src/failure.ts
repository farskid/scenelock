import type { FailureEnvelope } from "@scenelock/core";
import { FINGERPRINT_DRIFT_CODE } from "./assumptions.js";
import {
  fingerprintDriftMessage,
  type GoldenRunResult,
} from "./store.js";

export interface GoldenFailureContext {
  /** Stable test id (file::title or harness-assigned). */
  testId: string;
  file: string;
  title: string;
  /** Determinism seed for replay (empty string when unused). */
  seed?: string;
  durationMs?: number;
  retryIndex?: number;
  line?: number;
  step?: string;
}

/**
 * Map a non-match {@link GoldenRunResult} to a core {@link FailureEnvelope}.
 *
 * Core `ExecutionTier` has no `"golden"` variant — goldens are a thin opt-in
 * under the engine tier (research 02). We set `tier: "engine"` and
 * `error.matcher: "golden"` so parsers can discriminate the visual claim.
 * Artifact paths point at actual / expected / diff-report files (never blobs).
 */
export function toFailureEnvelope(
  result: GoldenRunResult,
  ctx: GoldenFailureContext,
): FailureEnvelope {
  if (result.verdict === "match") {
    throw new Error("toFailureEnvelope called for a matching golden result");
  }

  const { message, matcher, expected, received } = describeFailure(result);
  const artifacts: FailureEnvelope["artifacts"] = {};
  if (result.artifacts?.diffReport !== undefined) {
    artifacts.goldenDiff = result.artifacts.diffReport;
  }
  // Core FailureArtifacts only has goldenDiff for visual paths; stash actual/
  // expected pointers on error.received so agents still get all three paths.
  const pathBag = {
    ...(result.artifacts?.actual !== undefined ? { actual: result.artifacts.actual } : {}),
    ...(result.artifacts?.expected !== undefined
      ? { expected: result.artifacts.expected }
      : {}),
    ...(result.artifacts?.diffReport !== undefined
      ? { diffReport: result.artifacts.diffReport }
      : {}),
  };

  return {
    testId: ctx.testId,
    file: ctx.file,
    title: ctx.title,
    status: "failed",
    durationMs: ctx.durationMs ?? 0,
    retryIndex: ctx.retryIndex ?? 0,
    error: {
      message,
      matcher,
      ...(expected !== undefined ? { expected } : {}),
      received: {
        ...pathBag,
        ...(received !== undefined && typeof received === "object"
          ? (received as Record<string, unknown>)
          : received !== undefined
            ? { value: received }
            : {}),
        verdict: result.verdict,
      },
    },
    seed: ctx.seed ?? "",
    /**
     * Nearest core tier: goldens run under engine (pinned software raster).
     * Discriminator: error.matcher === "golden".
     */
    tier: "engine",
    artifacts,
    reportedAt: new Date().toISOString(),
    ...(ctx.line !== undefined ? { line: ctx.line } : {}),
    ...(ctx.step !== undefined ? { step: ctx.step } : {}),
  };
}

function describeFailure(result: GoldenRunResult): {
  message: string;
  matcher: string;
  expected?: unknown;
  received?: unknown;
} {
  switch (result.verdict) {
    case "fingerprint-drift":
      return {
        message: fingerprintDriftMessage(result),
        matcher: FINGERPRINT_DRIFT_CODE,
        expected: { rasterizerFingerprint: result.storedFingerprint },
        received: { rasterizerFingerprint: result.runFingerprint },
      };
    case "missing-baseline":
      return {
        message: result.wroteBaseline
          ? `New golden written for "${result.testId}"; re-run without update to assert.`
          : `Missing golden baseline for "${result.testId}" (not an auto-pass).`,
        matcher: "golden",
        expected: "baseline on disk",
        received: { actualHash: result.actualHash, wroteBaseline: result.wroteBaseline },
      };
    case "updated":
      return {
        message: `Golden baseline updated for "${result.testId}"; re-run without update to assert.`,
        matcher: "golden",
        expected: { hash: result.expectedHash },
        received: { hash: result.actualHash },
      };
    case "dimension-mismatch":
      return {
        message: `Golden dimension mismatch for "${result.testId}".`,
        matcher: "golden",
        expected: result.diff.expected,
        received: result.diff.actual,
      };
    case "mismatch":
      return {
        message: formatMismatchMessage(result),
        matcher: "golden",
        expected: {
          hash: result.expectedHash,
          dimensions: result.diff.expected,
        },
        received: {
          hash: result.actualHash,
          dimensions: result.diff.actual,
          differingPixelCount: result.report?.differingPixelCount,
          boundingBox: result.report?.boundingBox,
          samples: result.report?.samples,
        },
      };
    default:
      return {
        message: `Golden failure (${result.verdict}) for "${result.testId}".`,
        matcher: "golden",
      };
  }
}

function formatMismatchMessage(result: GoldenRunResult): string {
  const n = result.report?.differingPixelCount ?? result.diff.diffByteCount ?? "?";
  const bbox = result.report?.boundingBox;
  const bboxStr = bbox
    ? ` bbox=(${bbox.x},${bbox.y},${bbox.width}×${bbox.height})`
    : "";
  return `Golden mismatch for "${result.testId}": ${n} differing pixels${bboxStr}.`;
}
