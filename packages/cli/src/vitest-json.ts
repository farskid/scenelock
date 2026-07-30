import type { FailureEnvelope, ExecutionTier } from "@scenelock/core";
import { TierBudget, tierFromFilename, type TierBudgetReport } from "@scenelock/harness";
import type { BudgetSpec } from "./parse-args.js";

/** Minimal vitest JSON reporter shape (v2). */
export interface VitestJsonAssertion {
  readonly fullName?: string;
  readonly title?: string;
  readonly status?: string;
  readonly duration?: number;
  readonly failureMessages?: readonly string[];
  readonly ancestorTitles?: readonly string[];
}

export interface VitestJsonFileResult {
  readonly name?: string;
  readonly status?: string;
  readonly assertionResults?: readonly VitestJsonAssertion[];
  readonly startTime?: number;
  readonly endTime?: number;
}

export interface VitestJsonReport {
  readonly numTotalTests?: number;
  readonly numFailedTests?: number;
  readonly numPassedTests?: number;
  readonly numPendingTests?: number;
  readonly success?: boolean;
  readonly testResults?: readonly VitestJsonFileResult[];
  readonly startTime?: number;
}

export interface ScenelockRunSummary {
  readonly ok: boolean;
  readonly numTotalTests: number;
  readonly numFailedTests: number;
  readonly numPassedTests: number;
  readonly seed: string;
  readonly failures: readonly FailureEnvelope[];
  readonly budget?: TierBudgetReport;
}

const ARTIFACT_PATH_RE =
  /(?:^|[\s"'`])((?:\/|\.\/|\.\.\/)[^\s"'`]+\.(?:png|webp|json|zip|webm|trace|golden|txt|html))/gi;

function detectArtifacts(messages: readonly string[]): FailureEnvelope["artifacts"] {
  const artifacts: FailureEnvelope["artifacts"] = {};
  for (const msg of messages) {
    for (const match of msg.matchAll(ARTIFACT_PATH_RE)) {
      const p = match[1];
      if (p === undefined) continue;
      // Prefer golden/diff classification before generic screenshot.
      if (/diff/i.test(p) && artifacts.goldenDiff === undefined) {
        artifacts.goldenDiff = p;
      } else if (/actual/i.test(p) && artifacts.actualGolden === undefined) {
        artifacts.actualGolden = p;
      } else if (/expected/i.test(p) && artifacts.expectedGolden === undefined) {
        artifacts.expectedGolden = p;
      } else if (/trace/i.test(p) && artifacts.trace === undefined) {
        artifacts.trace = p;
      } else if (/scene/i.test(p) && artifacts.sceneSnapshot === undefined) {
        artifacts.sceneSnapshot = p;
      } else if (
        /\.(png|webp|jpe?g)$/i.test(p) &&
        artifacts.screenshot === undefined
      ) {
        artifacts.screenshot = p;
      }
    }
  }
  return artifacts;
}

function assertionTitle(a: VitestJsonAssertion): string {
  if (a.fullName !== undefined && a.fullName.length > 0) return a.fullName;
  const parts = [...(a.ancestorTitles ?? []), a.title ?? "test"].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return parts.join(" > ");
}

function mapStatus(status: string | undefined): FailureEnvelope["status"] {
  if (status === "timedOut" || status === "interrupted") return status;
  return "failed";
}

/** Parse vitest JSON reporter output (object or string). */
export function parseVitestJson(input: string | VitestJsonReport): VitestJsonReport {
  if (typeof input !== "string") return input;
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Empty vitest JSON report");
  }
  // Vitest may print non-JSON lines before the payload; take last `{…}` block.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find JSON object in vitest reporter output");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as VitestJsonReport;
}

/** Collect FailureEnvelope-shaped failures from a vitest JSON report. */
export function failuresFromVitestJson(
  report: VitestJsonReport,
  options: { readonly seed?: string; readonly reportedAt?: string } = {},
): FailureEnvelope[] {
  const seed = options.seed ?? "unknown";
  const reportedAt = options.reportedAt ?? new Date().toISOString();
  const out: FailureEnvelope[] = [];

  for (const fileResult of report.testResults ?? []) {
    const file = fileResult.name ?? "unknown";
    const tier: ExecutionTier = tierFromFilename(file);
    for (const a of fileResult.assertionResults ?? []) {
      if (a.status !== "failed" && a.status !== "timedOut" && a.status !== "interrupted") {
        continue;
      }
      const title = assertionTitle(a);
      const messages = a.failureMessages ?? ["Test failed"];
      out.push({
        testId: `${file}::${title}`,
        file,
        title,
        status: mapStatus(a.status),
        durationMs: a.duration ?? 0,
        retryIndex: 0,
        error: { message: messages.join("\n") },
        seed,
        tier,
        artifacts: detectArtifacts(messages),
        reportedAt,
      });
    }
  }
  return out;
}

/** Build TierBudget from vitest JSON (one count per assertion / test). */
export function tierBudgetFromVitestJson(report: VitestJsonReport): TierBudget {
  const budget = new TierBudget();
  for (const fileResult of report.testResults ?? []) {
    const file = fileResult.name ?? "";
    const tier = tierFromFilename(file);
    const assertions = fileResult.assertionResults ?? [];
    if (assertions.length === 0) {
      // File-level row with no assertions — still count as one observation.
      budget.record(tier);
    } else {
      budget.recordMany(tier, assertions.length);
    }
  }
  return budget;
}

export function buildRunSummary(
  report: VitestJsonReport,
  options: {
    readonly seed?: string;
    readonly budget?: BudgetSpec;
    readonly reportedAt?: string;
  } = {},
): ScenelockRunSummary {
  const failures = failuresFromVitestJson(report, {
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.reportedAt !== undefined ? { reportedAt: options.reportedAt } : {}),
  });
  const tierBudget = tierBudgetFromVitestJson(report);
  const budgetReport =
    options.budget !== undefined
      ? tierBudget.report({ maxBrowserSmokeRatio: options.budget.maxBrowserSmokeRatio })
      : undefined;

  const numTotalTests = report.numTotalTests ?? tierBudget.total();
  const numFailedTests = report.numFailedTests ?? failures.length;
  const numPassedTests =
    report.numPassedTests ?? Math.max(0, numTotalTests - numFailedTests);

  const budgetViolated = (budgetReport?.violations.length ?? 0) > 0;
  const ok = report.success !== false && failures.length === 0 && !budgetViolated;

  return {
    ok,
    numTotalTests,
    numFailedTests,
    numPassedTests,
    seed: options.seed ?? "unknown",
    failures,
    ...(budgetReport !== undefined ? { budget: budgetReport } : {}),
  };
}
