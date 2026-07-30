/**
 * Env-var contract between the CLI and harness / golden consumers.
 *
 * | Variable         | Set by CLI              | Consumed by                                      |
 * | ---------------- | ----------------------- | ------------------------------------------------ |
 * | `SCENELOCK_SEED` | `--seed` / `replay`     | **Documented** default for `createHarness({seed})` — harness does **not** read this yet (G5 gap) |
 * | `UPDATE_GOLDENS` | `--update-goldens` → `1`| Toy / host tests that pass `update` into golden stores; DirectoryGoldenStore itself does **not** auto-read env |
 */

export const SCENELOCK_SEED_ENV = "SCENELOCK_SEED";
export const UPDATE_GOLDENS_ENV = "UPDATE_GOLDENS";

/** Build child-process env with optional seed + golden update flags. */
export function buildChildEnv(options: {
  readonly seed?: string;
  readonly updateGoldens?: boolean;
  readonly base?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...(options.base ?? process.env) };
  if (options.seed !== undefined) {
    env[SCENELOCK_SEED_ENV] = options.seed;
  }
  if (options.updateGoldens === true) {
    env[UPDATE_GOLDENS_ENV] = "1";
  }
  return env;
}
