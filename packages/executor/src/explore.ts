import type {
  ExecutionTier,
  FailureEnvelope,
  Seed,
  SeedInput,
  SeedManager,
} from "@scenelock/core";
import { buildFailureEnvelope, ExecutorFailure } from "./failure.js";
import { defaultSeedManager } from "./seed.js";

export interface ExploreSeedsOptions {
  /** Parent seed; children are derived as `fuzz-0` … `fuzz-(count-1)`. */
  readonly base: SeedInput;
  /** Number of child seeds to explore (deterministic order). */
  readonly count: number;
  /**
   * Body for each child seed. Sync or async.
   * Throw to record a failure (prefer {@link ExecutorFailure} with a seeded envelope).
   */
  readonly run: (seed: Seed) => void | Promise<void>;
  readonly seeds?: SeedManager;
  /** Tier stamped on synthesized failure envelopes. Default `"scene"`. */
  readonly tier?: ExecutionTier;
  readonly testId?: string;
  readonly file?: string;
  readonly title?: string;
}

export interface ExploreSeedFailure {
  readonly seed: Seed;
  readonly envelope: FailureEnvelope;
}

export interface ExploreSeedsResult {
  readonly passed: number;
  /** Failures in derivation order (`fuzz-0` …). */
  readonly failed: readonly ExploreSeedFailure[];
}

/**
 * Derive `count` child seeds from `base` and run `run(seed)` for each, in order.
 *
 * Same `(base, count)` → same child seed list. Failures collect
 * {@link FailureEnvelope} with the derived seed as the replay token; the explorer
 * does not stop on the first failure.
 */
export async function exploreSeeds(
  options: ExploreSeedsOptions,
): Promise<ExploreSeedsResult> {
  const { count, run } = options;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("exploreSeeds: count must be a non-negative integer");
  }

  const seeds = options.seeds ?? defaultSeedManager;
  const tier = options.tier ?? "scene";
  const testId = options.testId ?? "exploreSeeds";
  const file = options.file ?? "unknown";
  const title = options.title ?? "exploreSeeds";

  const parent = seeds.create(options.base);
  let passed = 0;
  const failed: ExploreSeedFailure[] = [];

  for (let i = 0; i < count; i++) {
    const seed = seeds.derive(parent, `fuzz-${i}`);
    try {
      await run(seed);
      passed += 1;
    } catch (error) {
      const baseEnvelope =
        error instanceof ExecutorFailure
          ? error.envelope
          : buildFailureEnvelope({
              testId,
              file,
              title,
              seed,
              tier,
              error,
              status: "failed",
            });
      // Canonical replay token is the derived explore seed.
      const envelope: FailureEnvelope = { ...baseEnvelope, seed: seed.value };
      failed.push({ seed, envelope });
    }
  }

  return { passed, failed };
}
