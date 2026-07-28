import type {
  FailureArtifacts,
  FailureEnvelope,
  FailureError,
  Locator,
} from "@scenelock/core";

/**
 * Browser-tier failure capture — artifacts are path pointers, never blobs.
 */

export interface BuildFailureOptions {
  readonly testId: string;
  readonly file: string;
  readonly title: string;
  readonly seed: string;
  readonly error: FailureError;
  readonly locator?: Locator;
  readonly step?: string;
  readonly status?: Exclude<FailureEnvelope["status"], never>;
  readonly durationMs?: number;
  readonly retryIndex?: number;
  readonly line?: number;
  /** Screenshot filesystem path (pointer). */
  readonly screenshotPath?: string;
  readonly tracePath?: string;
  readonly axSnapshotPath?: string;
  readonly sceneSnapshotPath?: string;
}

/** Error thrown by harness actions; carries a structured {@link FailureEnvelope}. */
export class BrowserActionError extends Error {
  readonly envelope: FailureEnvelope;

  constructor(envelope: FailureEnvelope) {
    super(envelope.error.message);
    this.name = "BrowserActionError";
    this.envelope = envelope;
    if (envelope.error.stack !== undefined) {
      this.stack = envelope.error.stack;
    }
  }
}

/**
 * Build a core {@link FailureEnvelope} for the browser tier.
 * Required keys match {@link FAILURE_ENVELOPE_JSON_SCHEMA}.
 */
export function buildBrowserFailure(options: BuildFailureOptions): FailureEnvelope {
  const artifacts: FailureArtifacts = {};
  if (options.screenshotPath !== undefined) artifacts.screenshot = options.screenshotPath;
  if (options.tracePath !== undefined) artifacts.trace = options.tracePath;
  if (options.axSnapshotPath !== undefined) artifacts.axSnapshot = options.axSnapshotPath;
  if (options.sceneSnapshotPath !== undefined) artifacts.sceneSnapshot = options.sceneSnapshotPath;

  const envelope: FailureEnvelope = {
    testId: options.testId,
    file: options.file,
    title: options.title,
    status: options.status ?? "failed",
    durationMs: options.durationMs ?? 0,
    retryIndex: options.retryIndex ?? 0,
    error: options.error,
    seed: options.seed,
    tier: "browser",
    artifacts,
    reportedAt: new Date().toISOString(),
  };

  if (options.line !== undefined) envelope.line = options.line;
  if (options.locator !== undefined) envelope.locator = options.locator;
  if (options.step !== undefined) envelope.step = options.step;

  return envelope;
}

/** True when `value` has every required FailureEnvelope key (schema required array). */
export function isFailureEnvelopeShape(value: unknown): value is FailureEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const required = [
    "testId",
    "file",
    "title",
    "status",
    "durationMs",
    "retryIndex",
    "error",
    "seed",
    "tier",
    "artifacts",
    "reportedAt",
  ] as const;
  for (const key of required) {
    if (!(key in v)) return false;
  }
  if (typeof v["error"] !== "object" || v["error"] === null) return false;
  if (typeof (v["error"] as FailureError).message !== "string") return false;
  if (v["tier"] !== "browser" && v["tier"] !== "engine" && v["tier"] !== "virtual-time") return false;
  if (typeof v["artifacts"] !== "object" || v["artifacts"] === null) return false;
  return true;
}
