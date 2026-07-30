import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { buildChildEnv } from "./env.js";
import { collectTestFiles } from "./files.js";
import { computeIncludeGlobs } from "./globs.js";
import type { BudgetSpec, ReplayArgs, RunArgs } from "./parse-args.js";
import { findVitestConfig, resolveVitestCli } from "./resolve-vitest.js";
import {
  buildRunSummary,
  parseVitestJson,
  type ScenelockRunSummary,
} from "./vitest-json.js";

export interface RunResult {
  readonly exitCode: number;
  readonly summary?: ScenelockRunSummary;
  readonly vitestArgs: readonly string[];
  readonly reproduction: string;
  readonly files: readonly string[];
}

export function formatReproduction(options: {
  readonly seed?: string;
  readonly globs: readonly string[];
  readonly tier?: string;
}): string {
  const parts = ["scenelock", "replay"];
  if (options.seed !== undefined) {
    parts.push("--seed", options.seed);
  }
  if (options.tier !== undefined) {
    parts.push("--tier", options.tier);
  }
  for (const g of options.globs) {
    parts.push(g);
  }
  return parts.join(" ");
}

async function spawnVitest(
  vitestCli: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [vitestCli, ...args], {
      cwd,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * Resolve which test files to pass to vitest from tier + user globs.
 * Exported for unit tests.
 */
export function resolveRunFiles(options: {
  readonly cwd: string;
  readonly tier?: RunArgs["tier"];
  readonly globs: readonly string[];
}): string[] {
  const tier =
    options.tier ?? (options.globs.length === 0 ? ("scene" as const) : undefined);
  return collectTestFiles({
    cwd: options.cwd,
    ...(tier !== undefined ? { tier } : {}),
    ...(options.globs.length > 0 ? { filters: options.globs } : {}),
  });
}

export async function runCommand(
  args: RunArgs | ReplayArgs,
  options: { readonly cwd?: string } = {},
): Promise<RunResult> {
  const cwd = options.cwd ?? process.cwd();
  const globs = args.globs;
  const tier = args.tier;
  const seed = args.seed;
  const updateGoldens = args.command === "run" ? args.updateGoldens : false;
  const budget: BudgetSpec | undefined = args.command === "run" ? args.budget : undefined;
  const wantJson = args.reporter === "json" || args.jsonFile !== undefined;

  // Document include globs even though we expand to concrete files.
  const _include = computeIncludeGlobs({
    ...(tier !== undefined ? { tier } : {}),
    ...(globs.length > 0 ? { globs } : {}),
  });
  void _include;

  const files = resolveRunFiles({
    cwd,
    ...(tier !== undefined ? { tier } : {}),
    globs,
  });

  if (files.length === 0) {
    process.stderr.write("scenelock run: no test files matched\n");
    return {
      exitCode: 1,
      vitestArgs: [],
      reproduction: formatReproduction({
        ...(seed !== undefined ? { seed } : {}),
        globs,
        ...(tier !== undefined ? { tier } : {}),
      }),
      files: [],
    };
  }

  const tmp = mkdtempSync(join(tmpdir(), "scenelock-out-"));
  const jsonOutputFile = join(tmp, "vitest.json");
  const config = findVitestConfig(cwd);

  const vitestArgs = ["run"];
  if (config !== undefined) {
    vitestArgs.push("--config", config);
  }
  // cac dot notation: --outputFile.json=<path> (vitest multi-reporter)
  vitestArgs.push("--reporter=json", `--outputFile.json=${jsonOutputFile}`);
  if (args.reporter === "line") {
    vitestArgs.push("--reporter=default");
  }
  for (const f of files) {
    vitestArgs.push(relative(cwd, f));
  }

  const env = buildChildEnv({
    ...(seed !== undefined ? { seed } : {}),
    updateGoldens,
  });

  const vitestCli = resolveVitestCli();
  const exitFromVitest = await spawnVitest(vitestCli, vitestArgs, env, cwd);

  let summary: ScenelockRunSummary | undefined;
  try {
    const raw = readFileSync(jsonOutputFile, "utf8");
    const report = parseVitestJson(raw);
    summary = buildRunSummary(report, {
      ...(seed !== undefined ? { seed } : {}),
      ...(budget !== undefined ? { budget } : {}),
    });
  } catch {
    summary = undefined;
  }

  if (wantJson && summary !== undefined) {
    const payload = `${JSON.stringify(summary, null, 2)}\n`;
    if (args.jsonFile !== undefined) {
      mkdirSync(dirname(args.jsonFile), { recursive: true });
      writeFileSync(args.jsonFile, payload, "utf8");
    }
    if (args.reporter === "json") {
      process.stdout.write(payload);
    }
  }

  const reproduction = formatReproduction({
    ...(seed !== undefined ? { seed } : {}),
    globs,
    ...(tier !== undefined ? { tier } : {}),
  });

  let exitCode = exitFromVitest;
  if (
    summary !== undefined &&
    summary.budget !== undefined &&
    summary.budget.violations.length > 0
  ) {
    exitCode = 1;
    if (args.reporter === "line") {
      for (const v of summary.budget.violations) {
        process.stderr.write(`scenelock budget: ${v.message}\n`);
      }
    }
  }
  if (summary !== undefined && !summary.ok && exitCode === 0) {
    exitCode = 1;
  }

  return {
    exitCode,
    ...(summary !== undefined ? { summary } : {}),
    vitestArgs,
    reproduction,
    files,
  };
}
