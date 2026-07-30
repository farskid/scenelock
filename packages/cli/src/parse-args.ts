import type { ExecutionTier } from "@scenelock/core";

export type ReporterKind = "json" | "line";

export type CliCommand = "run" | "replay" | "budget" | "record" | "help" | "version";

export interface BudgetSpec {
  /** Max fraction of tests that may be browser + smoke combined. */
  readonly maxBrowserSmokeRatio: number;
}

export interface RunArgs {
  readonly command: "run";
  readonly globs: readonly string[];
  readonly tier?: ExecutionTier;
  readonly seed?: string;
  readonly updateGoldens: boolean;
  readonly budget?: BudgetSpec;
  readonly reporter: ReporterKind;
  readonly jsonFile?: string;
}

export interface ReplayArgs {
  readonly command: "replay";
  readonly seed: string;
  readonly globs: readonly string[];
  readonly tier?: ExecutionTier;
  readonly reporter: ReporterKind;
  readonly jsonFile?: string;
}

export interface BudgetArgs {
  readonly command: "budget";
  readonly reportPath: string;
  readonly budget: BudgetSpec;
}

export interface RecordArgs {
  readonly command: "record";
  readonly out: string;
  readonly session: string;
  readonly log?: string;
}

export interface HelpArgs {
  readonly command: "help";
  readonly topic?: string;
}

export interface VersionArgs {
  readonly command: "version";
}

export type ParsedArgs = RunArgs | ReplayArgs | BudgetArgs | RecordArgs | HelpArgs | VersionArgs;

const TIERS = new Set<string>(["scene", "browser", "golden", "smoke"]);

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

function parseBudgetValue(raw: string): BudgetSpec {
  // `browser+smoke=<ratio>` or bare `<ratio>`
  const trimmed = raw.trim();
  const eq = trimmed.indexOf("=");
  if (eq === -1) {
    const ratio = Number(trimmed);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      throw new ParseError(
        `Invalid --budget value "${raw}"; expected browser+smoke=<0..1>`,
      );
    }
    return { maxBrowserSmokeRatio: ratio };
  }
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (key !== "browser+smoke") {
    throw new ParseError(
      `Unsupported --budget key "${key}"; only browser+smoke=<ratio> is supported`,
    );
  }
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new ParseError(
      `Invalid --budget ratio "${value}"; expected a number in [0, 1]`,
    );
  }
  return { maxBrowserSmokeRatio: ratio };
}

function takeValue(argv: readonly string[], i: number, flag: string): { value: string; next: number } {
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("-")) {
    throw new ParseError(`Missing value for ${flag}`);
  }
  return { value: next, next: i + 2 };
}

/** Default CI ratio when `budget` command omits `--budget`. */
export const DEFAULT_BUDGET_RATIO = 0.35;

/**
 * Hand-rolled argv parser (no commander).
 * `argv` should be process.argv.slice(2) (no node/bin).
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", ...(argv[1] !== undefined ? { topic: argv[1] } : {}) };
  }
  if (argv[0] === "version" || argv[0] === "--version" || argv[0] === "-v") {
    return { command: "version" };
  }

  const command = argv[0];
  if (
    command !== "run" &&
    command !== "replay" &&
    command !== "budget" &&
    command !== "record"
  ) {
    throw new ParseError(`Unknown command "${command}". Try: run | replay | budget | record`);
  }

  const rest = argv.slice(1);
  const positionals: string[] = [];
  let tier: ExecutionTier | undefined;
  let seed: string | undefined;
  let updateGoldens = false;
  let budget: BudgetSpec | undefined;
  let reporter: ReporterKind = "line";
  let jsonFile: string | undefined;
  let reportPath: string | undefined;
  let out: string | undefined;
  let session: string | undefined;
  let log: string | undefined;

  let i = 0;
  while (i < rest.length) {
    const tok = rest[i]!;
    if (tok === "--tier") {
      const { value, next } = takeValue(rest, i, "--tier");
      if (!TIERS.has(value)) {
        throw new ParseError(`Invalid --tier "${value}"; expected scene|browser|golden|smoke`);
      }
      tier = value as ExecutionTier;
      i = next;
      continue;
    }
    if (tok === "--seed") {
      const { value, next } = takeValue(rest, i, "--seed");
      seed = value;
      i = next;
      continue;
    }
    if (tok === "--update-goldens") {
      updateGoldens = true;
      i += 1;
      continue;
    }
    if (tok === "--budget") {
      const { value, next } = takeValue(rest, i, "--budget");
      budget = parseBudgetValue(value);
      i = next;
      continue;
    }
    if (tok === "--reporter") {
      const { value, next } = takeValue(rest, i, "--reporter");
      if (value !== "json" && value !== "line") {
        throw new ParseError(`Invalid --reporter "${value}"; expected json|line`);
      }
      reporter = value;
      i = next;
      continue;
    }
    if (tok === "--json-file") {
      const { value, next } = takeValue(rest, i, "--json-file");
      jsonFile = value;
      i = next;
      continue;
    }
    if (tok === "--report") {
      const { value, next } = takeValue(rest, i, "--report");
      reportPath = value;
      i = next;
      continue;
    }
    if (tok === "--out") {
      const { value, next } = takeValue(rest, i, "--out");
      out = value;
      i = next;
      continue;
    }
    if (tok === "--session") {
      const { value, next } = takeValue(rest, i, "--session");
      session = value;
      i = next;
      continue;
    }
    if (tok === "--log") {
      const { value, next } = takeValue(rest, i, "--log");
      log = value;
      i = next;
      continue;
    }
    if (tok === "--help" || tok === "-h") {
      return { command: "help", topic: command };
    }
    if (tok.startsWith("-")) {
      throw new ParseError(`Unknown flag "${tok}"`);
    }
    positionals.push(tok);
    i += 1;
  }

  if (command === "run") {
    return {
      command: "run",
      globs: positionals,
      ...(tier !== undefined ? { tier } : {}),
      ...(seed !== undefined ? { seed } : {}),
      updateGoldens,
      ...(budget !== undefined ? { budget } : {}),
      reporter,
      ...(jsonFile !== undefined ? { jsonFile } : {}),
    };
  }

  if (command === "replay") {
    if (seed === undefined) {
      throw new ParseError("replay requires --seed <s>");
    }
    return {
      command: "replay",
      seed,
      globs: positionals,
      ...(tier !== undefined ? { tier } : {}),
      reporter,
      ...(jsonFile !== undefined ? { jsonFile } : {}),
    };
  }

  if (command === "budget") {
    if (reportPath === undefined) {
      throw new ParseError("budget requires --report <vitest-json>");
    }
    return {
      command: "budget",
      reportPath,
      budget: budget ?? { maxBrowserSmokeRatio: DEFAULT_BUDGET_RATIO },
    };
  }

  // record
  if (out === undefined) {
    throw new ParseError("record requires --out <file.test.ts>");
  }
  if (session === undefined) {
    throw new ParseError("record requires --session <session.json>");
  }
  return {
    command: "record",
    out,
    session,
    ...(log !== undefined ? { log } : {}),
  };
}
