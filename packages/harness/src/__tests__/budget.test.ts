import { describe, expect, it } from "vitest";
import { TierBudget } from "../index.js";

describe("TierBudget", () => {
  it("counts per tier and marks smoke quarantined", () => {
    const budget = new TierBudget();
    budget.record("scene");
    budget.record("scene");
    budget.record("browser");
    budget.record("smoke");
    budget.record("golden");

    const report = budget.report();
    expect(report.counts).toEqual({
      scene: 2,
      browser: 1,
      golden: 1,
      smoke: 1,
    });
    expect(report.total).toBe(5);
    expect(report.quarantined.smoke).toBe(1);
    expect(TierBudget.isQuarantined("smoke")).toBe(true);
    expect(TierBudget.isQuarantined("scene")).toBe(false);
  });

  it("returns violations when browser+smoke ratio exceeds budget", () => {
    const budget = new TierBudget();
    budget.recordMany("scene", 6);
    budget.recordMany("browser", 3);
    budget.recordMany("smoke", 1);

    const violations = budget.check({ maxBrowserSmokeRatio: 0.3 });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.code).toBe("maxBrowserSmokeRatio");
    expect(violations[0]?.message).toMatch(/0\.400/);
  });

  it("returns absolute max violations", () => {
    const budget = new TierBudget();
    budget.recordMany("browser", 5);
    budget.recordMany("smoke", 2);
    budget.recordMany("golden", 4);

    const violations = budget.check({
      maxBrowser: 3,
      maxSmoke: 1,
      maxGolden: 2,
    });
    expect(violations.map((v) => v.code).sort()).toEqual([
      "maxBrowser",
      "maxGolden",
      "maxSmoke",
    ]);
  });

  it("empty budgets never violate", () => {
    const budget = new TierBudget();
    budget.record("browser");
    expect(budget.check()).toEqual([]);
    expect(budget.check({})).toEqual([]);
  });
});
