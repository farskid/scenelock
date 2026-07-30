import { readFileSync } from "node:fs";
import type { BudgetArgs } from "./parse-args.js";
import {
  parseVitestJson,
  tierBudgetFromVitestJson,
} from "./vitest-json.js";
import type { TierBudgetReport } from "@scenelock/harness";

export interface BudgetCommandResult {
  readonly exitCode: number;
  readonly report: TierBudgetReport;
}

/** CI gate: tier distribution from vitest JSON + budget ratios. */
export function budgetCommand(args: BudgetArgs): BudgetCommandResult {
  const raw = readFileSync(args.reportPath, "utf8");
  const vitest = parseVitestJson(raw);
  const tierBudget = tierBudgetFromVitestJson(vitest);
  const report = tierBudget.report({
    maxBrowserSmokeRatio: args.budget.maxBrowserSmokeRatio,
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.violations.length > 0) {
    for (const v of report.violations) {
      process.stderr.write(`scenelock budget: ${v.message}\n`);
    }
    return { exitCode: 1, report };
  }
  return { exitCode: 0, report };
}
