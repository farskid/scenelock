import { budgetCommand } from "./budget-cmd.js";
import { printHelp, VERSION } from "./help.js";
import { ParseError, parseArgs } from "./parse-args.js";
import { recordCommand } from "./record.js";
import { replayCommand } from "./replay.js";
import { runCommand } from "./run.js";

export interface MainOptions {
  readonly argv?: readonly string[];
  readonly cwd?: string;
}

/**
 * CLI entry — returns process exit code.
 */
export async function main(options: MainOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    const msg = err instanceof ParseError ? err.message : String(err);
    process.stderr.write(`scenelock: ${msg}\n`);
    return 2;
  }

  const cwd = options.cwd ?? process.cwd();

  switch (parsed.command) {
    case "help":
      printHelp(parsed.topic);
      return 0;
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    case "run": {
      const result = await runCommand(parsed, { cwd });
      return result.exitCode;
    }
    case "replay": {
      const result = await replayCommand(parsed, { cwd });
      return result.exitCode;
    }
    case "budget": {
      const result = budgetCommand(parsed);
      return result.exitCode;
    }
    case "record": {
      const result = recordCommand(parsed);
      if (result.exitCode === 0) {
        process.stderr.write(
          `scenelock record: wrote ${result.outPath}` +
            (result.logPath !== undefined ? ` (log ${result.logPath})` : "") +
            "\n",
        );
      }
      return result.exitCode;
    }
    default: {
      const _exhaustive: never = parsed;
      void _exhaustive;
      return 2;
    }
  }
}
