import type { Locator } from "./locators.js";

/**
 * Agent failure envelope (research 04).
 * One schema across Node+WASM scene tier and Playwright browser tier.
 * Artifacts are pointers, never blobs. Seed is the replay token.
 */

export type TestStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted";

export interface FailureError {
  message: string;
  expected?: unknown;
  received?: unknown;
  stack?: string;
  /** Matcher / assertion name when known. */
  matcher?: string;
}

export interface FailureArtifacts {
  /** Path to trace archive or CLI-exportable excerpt. */
  trace?: string;
  /** Path to screenshot (optional; never primary agent payload). */
  screenshot?: string;
  /** Path or inline compact AX / scene snapshot at failure. */
  axSnapshot?: string;
  /** Path to scene snapshot JSON at failure. */
  sceneSnapshot?: string;
  /** Path to golden diff report (JSON) when visual tier fails. */
  goldenDiff?: string;
  /** Path to actual raster golden written on mismatch. */
  actualGolden?: string;
  /** Path to expected (baseline) golden copied for inspection. */
  expectedGolden?: string;
}

export interface FailureEnvelope {
  /** Stable id: typically file::title or harness-assigned. */
  testId: string;
  file: string;
  line?: number;
  title: string;
  status: Exclude<TestStatus, "passed" | "skipped">;
  durationMs: number;
  retryIndex: number;
  error: FailureError;
  /** Failing locator when the step was locator-bound. */
  locator?: Locator;
  /** Human/agent step name from the DSL. */
  step?: string;
  /**
   * Determinism seed for this run.
   * Failures are replay tokens: re-run with the same seed to reproduce.
   */
  seed: string;
  /** Tier that produced the failure. */
  tier: ExecutionTier;
  artifacts: FailureArtifacts;
  /** ISO-8601 wall time of the report (not the virtual clock). */
  reportedAt: string;
}

export type ExecutionTier =
  /** Node + WASM / engine scene tests — no browser. */
  | "engine"
  /** Full integration in real Chromium via Playwright. */
  | "browser"
  /** Optional main-thread CDP virtual-time accelerator (not Creator default). */
  | "virtual-time"
  /** Bit-exact golden / visual claim under a pinned software rasterizer. */
  | "golden";

/** Minimal JSON Schema draft-07 for FailureEnvelope (agent parsers). */
export const FAILURE_ENVELOPE_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://scenelock.dev/schemas/failure-envelope.json",
  title: "ScenelockFailureEnvelope",
  type: "object",
  required: [
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
  ],
  properties: {
    testId: { type: "string" },
    file: { type: "string" },
    line: { type: "integer", minimum: 1 },
    title: { type: "string" },
    status: { type: "string", enum: ["failed", "timedOut", "interrupted"] },
    durationMs: { type: "number", minimum: 0 },
    retryIndex: { type: "integer", minimum: 0 },
    error: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        expected: {},
        received: {},
        stack: { type: "string" },
        matcher: { type: "string" },
      },
      additionalProperties: false,
    },
    locator: { type: "object" },
    step: { type: "string" },
    seed: { type: "string" },
    tier: { type: "string", enum: ["engine", "browser", "virtual-time", "golden"] },
    artifacts: {
      type: "object",
      properties: {
        trace: { type: "string" },
        screenshot: { type: "string" },
        axSnapshot: { type: "string" },
        sceneSnapshot: { type: "string" },
        goldenDiff: { type: "string" },
        actualGolden: { type: "string" },
        expectedGolden: { type: "string" },
      },
      additionalProperties: false,
    },
    reportedAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const;
