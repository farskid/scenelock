/**
 * Library surface for `@scenelock/cli`.
 * The `scenelock` bin entry is `./dist/bin.js`.
 */

export { main } from "./main.js";
export { parseArgs, ParseError, DEFAULT_BUDGET_RATIO } from "./parse-args.js";
export type {
  ParsedArgs,
  RunArgs,
  ReplayArgs,
  BudgetArgs,
  RecordArgs,
  BudgetSpec,
  ReporterKind,
} from "./parse-args.js";
export { computeIncludeGlobs } from "./globs.js";
export { assembleReplayCommand } from "./replay.js";
export { buildChildEnv, SCENELOCK_SEED_ENV, UPDATE_GOLDENS_ENV } from "./env.js";
export {
  parseVitestJson,
  buildRunSummary,
  failuresFromVitestJson,
  tierBudgetFromVitestJson,
} from "./vitest-json.js";
export type { ScenelockRunSummary, VitestJsonReport } from "./vitest-json.js";
export { recordCommand } from "./record.js";
export { budgetCommand } from "./budget-cmd.js";
export { resolveRunFiles, formatReproduction } from "./run.js";
export { VERSION } from "./help.js";
