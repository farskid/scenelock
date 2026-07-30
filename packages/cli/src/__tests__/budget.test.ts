import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budgetCommand } from "../budget-cmd.js";
import { buildRunSummary, tierBudgetFromVitestJson } from "../vitest-json.js";
import type { VitestJsonReport } from "../vitest-json.js";

function sampleReport(): VitestJsonReport {
  return {
    success: true,
    numTotalTests: 10,
    numFailedTests: 0,
    numPassedTests: 10,
    testResults: [
      {
        name: "/repo/a.test.ts",
        assertionResults: Array.from({ length: 7 }, (_, i) => ({
          fullName: `scene ${i}`,
          status: "passed",
          duration: 1,
        })),
      },
      {
        name: "/repo/b.browser.test.ts",
        assertionResults: Array.from({ length: 2 }, (_, i) => ({
          fullName: `browser ${i}`,
          status: "passed",
          duration: 1,
        })),
      },
      {
        name: "/repo/c.smoke.test.ts",
        assertionResults: [
          { fullName: "smoke 0", status: "passed", duration: 1 },
        ],
      },
    ],
  };
}

describe("budget math", () => {
  it("counts tiers from filenames and detects ratio violations", () => {
    const budget = tierBudgetFromVitestJson(sampleReport());
    expect(budget.snapshot()).toEqual({
      scene: 7,
      browser: 2,
      golden: 0,
      smoke: 1,
    });
    const report = budget.report({ maxBrowserSmokeRatio: 0.2 });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.code).toBe("maxBrowserSmokeRatio");
  });

  it("budget command exits 1 on violation", () => {
    const dir = mkdtempSync(join(tmpdir(), "scenelock-budget-"));
    const path = join(dir, "report.json");
    writeFileSync(path, JSON.stringify(sampleReport()), "utf8");

    const result = budgetCommand({
      command: "budget",
      reportPath: path,
      budget: { maxBrowserSmokeRatio: 0.2 },
    });
    expect(result.exitCode).toBe(1);
    expect(result.report.violations.length).toBeGreaterThan(0);
  });

  it("budget command exits 0 when within budget", () => {
    const dir = mkdtempSync(join(tmpdir(), "scenelock-budget-"));
    const path = join(dir, "report.json");
    writeFileSync(path, JSON.stringify(sampleReport()), "utf8");

    const result = budgetCommand({
      command: "budget",
      reportPath: path,
      budget: { maxBrowserSmokeRatio: 0.5 },
    });
    expect(result.exitCode).toBe(0);
  });

  it("buildRunSummary marks ok false when budget violated", () => {
    const summary = buildRunSummary(sampleReport(), {
      seed: "s",
      budget: { maxBrowserSmokeRatio: 0.1 },
    });
    expect(summary.ok).toBe(false);
    expect(summary.budget?.violations.length).toBeGreaterThan(0);
  });
});
