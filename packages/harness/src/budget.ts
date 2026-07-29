import type { ExecutionTier } from "@scenelock/core";
import { EXECUTION_TIERS, TIER_CAPABILITIES } from "./tiers.js";

/** Optional CI budgets that fail the run when the heavy path is overused. */
export interface TierBudgets {
  /**
   * Max fraction of tests that may be browser + smoke combined.
   * Example: `0.35` fails when `(browser + smoke) / total > 0.35`.
   */
  readonly maxBrowserSmokeRatio?: number;
  /** Absolute max browser-tier tests. */
  readonly maxBrowser?: number;
  /** Absolute max smoke-tier tests. */
  readonly maxSmoke?: number;
  /** Absolute max golden-tier tests. */
  readonly maxGolden?: number;
}

export interface TierBudgetViolation {
  readonly code: string;
  readonly message: string;
}

export interface TierBudgetReport {
  readonly counts: Readonly<Record<ExecutionTier, number>>;
  readonly total: number;
  /** Smoke tests are quarantined from the PR gate by default. */
  readonly quarantined: Readonly<{ smoke: number }>;
  readonly violations: readonly TierBudgetViolation[];
}

/**
 * Reporter utility: count tests per tier and optionally fail on budget violations.
 * Wire from a vitest reporter / CLI after the run; never silently escalates tiers.
 */
export class TierBudget {
  private readonly counts: Record<ExecutionTier, number> = {
    scene: 0,
    browser: 0,
    golden: 0,
    smoke: 0,
  };

  /** Record one test observation for `tier`. */
  record(tier: ExecutionTier): void {
    this.counts[tier] += 1;
  }

  /** Record many tests (e.g. from a file-level tally). */
  recordMany(tier: ExecutionTier, n: number): void {
    if (n < 0) throw new Error("TierBudget.recordMany: n must be >= 0");
    this.counts[tier] += n;
  }

  snapshot(): Readonly<Record<ExecutionTier, number>> {
    return { ...this.counts };
  }

  total(): number {
    let n = 0;
    for (const t of EXECUTION_TIERS) n += this.counts[t];
    return n;
  }

  /**
   * Evaluate optional budgets. Returns violations the runner can fail on.
   * Empty array = within budget.
   */
  check(budgets?: TierBudgets): TierBudgetViolation[] {
    if (budgets === undefined) return [];
    const violations: TierBudgetViolation[] = [];
    const total = this.total();
    const heavy = this.counts.browser + this.counts.smoke;

    if (budgets.maxBrowserSmokeRatio !== undefined && total > 0) {
      const ratio = heavy / total;
      if (ratio > budgets.maxBrowserSmokeRatio) {
        violations.push({
          code: "maxBrowserSmokeRatio",
          message:
            `browser+smoke ratio ${ratio.toFixed(3)} exceeds budget ` +
            `${budgets.maxBrowserSmokeRatio} (${heavy}/${total})`,
        });
      }
    }
    if (budgets.maxBrowser !== undefined && this.counts.browser > budgets.maxBrowser) {
      violations.push({
        code: "maxBrowser",
        message: `browser count ${this.counts.browser} exceeds budget ${budgets.maxBrowser}`,
      });
    }
    if (budgets.maxSmoke !== undefined && this.counts.smoke > budgets.maxSmoke) {
      violations.push({
        code: "maxSmoke",
        message: `smoke count ${this.counts.smoke} exceeds budget ${budgets.maxSmoke}`,
      });
    }
    if (budgets.maxGolden !== undefined && this.counts.golden > budgets.maxGolden) {
      violations.push({
        code: "maxGolden",
        message: `golden count ${this.counts.golden} exceeds budget ${budgets.maxGolden}`,
      });
    }
    return violations;
  }

  /** Full report including quarantine annotation for smoke. */
  report(budgets?: TierBudgets): TierBudgetReport {
    return {
      counts: this.snapshot(),
      total: this.total(),
      quarantined: { smoke: this.counts.smoke },
      violations: this.check(budgets),
    };
  }

  /** True when tier is quarantined (smoke). */
  static isQuarantined(tier: ExecutionTier): boolean {
    return TIER_CAPABILITIES[tier].quarantined;
  }
}
