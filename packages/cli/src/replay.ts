import type { ReplayArgs } from "./parse-args.js";
import { formatReproduction, runCommand, type RunResult } from "./run.js";

/**
 * Sugar over `run` with `SCENELOCK_SEED` pinned + printed reproduction command.
 */
export async function replayCommand(
  args: ReplayArgs,
  options: { readonly cwd?: string } = {},
): Promise<RunResult> {
  const result = await runCommand(args, options);
  const cmd = formatReproduction({
    seed: args.seed,
    globs: args.globs,
    ...(args.tier !== undefined ? { tier: args.tier } : {}),
  });
  process.stderr.write(`scenelock replay: reproduction → ${cmd}\n`);
  return { ...result, reproduction: cmd };
}

/** Pure helper for tests — assemble the printed reproduction string. */
export function assembleReplayCommand(args: {
  readonly seed: string;
  readonly globs?: readonly string[];
  readonly tier?: string;
}): string {
  return formatReproduction({
    seed: args.seed,
    globs: args.globs ?? [],
    ...(args.tier !== undefined ? { tier: args.tier } : {}),
  });
}
