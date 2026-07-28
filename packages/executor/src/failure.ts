import type {
  ExecutionTier,
  FailureEnvelope,
  FailureError,
  FailureArtifacts,
  Locator,
  Seed,
} from "@scenelock/core";

export interface BuildFailureEnvelopeOptions {
  testId: string;
  file: string;
  title: string;
  seed: Seed | string;
  tier: ExecutionTier;
  error: FailureError | Error | unknown;
  status?: FailureEnvelope["status"];
  durationMs?: number;
  retryIndex?: number;
  line?: number;
  locator?: Locator;
  step?: string;
  artifacts?: FailureArtifacts;
  /** Wall-clock report time; defaults to now. */
  reportedAt?: string;
}

/** Normalize unknown thrown values into a {@link FailureError}. */
export function toFailureError(error: unknown): FailureError {
  if (error instanceof Error) {
    const out: FailureError = { message: error.message };
    if (error.stack !== undefined) {
      out.stack = error.stack;
    }
    return out;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return { message: (error as { message: string }).message };
  }
  return { message: String(error) };
}

/**
 * Build a {@link FailureEnvelope} with seed as the replay token.
 * Artifacts are pointers only — never blobs.
 */
export function buildFailureEnvelope(
  options: BuildFailureEnvelopeOptions,
): FailureEnvelope {
  const seed =
    typeof options.seed === "string" ? options.seed : options.seed.value;
  const envelope: FailureEnvelope = {
    testId: options.testId,
    file: options.file,
    title: options.title,
    status: options.status ?? "failed",
    durationMs: options.durationMs ?? 0,
    retryIndex: options.retryIndex ?? 0,
    error: toFailureError(options.error),
    seed,
    tier: options.tier,
    artifacts: options.artifacts ?? {},
    reportedAt: options.reportedAt ?? new Date().toISOString(),
  };
  if (options.line !== undefined) envelope.line = options.line;
  if (options.locator !== undefined) envelope.locator = options.locator;
  if (options.step !== undefined) envelope.step = options.step;
  return envelope;
}

/**
 * Error thrown by {@link DeterministicExecutor.run} when the body fails.
 * Carries a {@link FailureEnvelope} with seed + tier for replay.
 */
export class ExecutorFailure extends Error {
  readonly envelope: FailureEnvelope;

  constructor(envelope: FailureEnvelope) {
    super(envelope.error.message);
    this.name = "ExecutorFailure";
    this.envelope = envelope;
    if (envelope.error.stack !== undefined) {
      this.stack = envelope.error.stack;
    }
  }
}
