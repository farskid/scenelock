import type {
  DeterministicExecutor,
  DeterministicExecutorFactory,
  ExecutorContext,
  ExecutorOptions,
  Seed,
  SeedInput,
  SeedManager,
  SeededRandom,
  StepLoopDriver,
  ExecutionTier,
  VirtualClock,
} from "@scenelock/core";
import { createVirtualClock } from "./clock.js";
import { buildFailureEnvelope, ExecutorFailure } from "./failure.js";
import { defaultSeedManager } from "./seed.js";

interface ExecutorState {
  seed: Seed;
  tier: ExecutionTier;
  seeds: SeedManager;
  clockOptions: ExecutorOptions["clock"];
  stepLoop: StepLoopDriver | undefined;
  onFailureEnvelope: ExecutorOptions["onFailureEnvelope"];
  /** Guards concurrent run() — overlapping calls throw. */
  running: boolean;
  clock: VirtualClock;
  random: SeededRandom;
}

function createContext(state: ExecutorState): ExecutorContext {
  const stepLoop = state.stepLoop;
  const tick = async (deltaMs: number): Promise<void> => {
    if (stepLoop === undefined) {
      throw new Error("ExecutorContext.tick: no StepLoopDriver registered");
    }
    await stepLoop.step(deltaMs);
    await stepLoop.settled();
  };

  if (stepLoop !== undefined) {
    return {
      seed: state.seed,
      clock: state.clock,
      random: state.random,
      tier: state.tier,
      stepLoop,
      tick,
    };
  }
  return {
    seed: state.seed,
    clock: state.clock,
    random: state.random,
    tier: state.tier,
    tick,
  };
}

async function runBody<T>(
  state: ExecutorState,
  fn: (ctx: ExecutorContext) => T | Promise<T>,
): Promise<T> {
  if (state.running) {
    throw new Error(
      "DeterministicExecutor.run: concurrent run() is not supported; create a separate executor",
    );
  }
  state.running = true;
  const started = Date.now();
  try {
    // Per-invocation isolation: fresh clock + PRNG from the same seed.
    state.clock = createVirtualClock(state.clockOptions);
    state.random = state.seeds.random(state.seed);

    const ctx = createContext(state);
    return await fn(ctx);
  } catch (error) {
    if (error instanceof ExecutorFailure) {
      throw error;
    }
    const durationMs = Math.max(0, Date.now() - started);
    const envelope = buildFailureEnvelope({
      testId: "executor::run",
      file: "unknown",
      title: "run",
      seed: state.seed,
      tier: state.tier,
      error,
      status: "failed",
      durationMs,
    });
    state.onFailureEnvelope?.(envelope);
    throw new ExecutorFailure(envelope);
  } finally {
    state.running = false;
  }
}

/**
 * Create a {@link DeterministicExecutor} for one logical test seed.
 *
 * - `run()` installs a fresh clock + PRNG from the seed each invocation.
 * - Concurrent overlapping `run()` calls throw (create a separate executor).
 * - Body failures are rethrown as {@link ExecutorFailure} with a
 *   {@link FailureEnvelope} carrying seed + tier as the replay token.
 */
export function createExecutor(options: ExecutorOptions = {}): DeterministicExecutor {
  const seeds = options.seeds ?? defaultSeedManager;
  const seed = seeds.create(options.seed);
  const tier = options.tier ?? "scene";
  const clock = createVirtualClock(options.clock);
  const random = seeds.random(seed);

  const state: ExecutorState = {
    seed,
    tier,
    seeds,
    clockOptions: options.clock,
    stepLoop: options.stepLoop,
    onFailureEnvelope: options.onFailureEnvelope,
    running: false,
    clock,
    random,
  };

  const api: DeterministicExecutor = {
    get seed() {
      return state.seed;
    },
    get clock() {
      return state.clock;
    },
    get random() {
      return state.random;
    },
    get tier() {
      return state.tier;
    },
    run: (fn) => runBody(state, fn),
    async runWithSeed(seedInput, fn) {
      const rebound = seeds.create(seedInput);
      const saved = {
        seed: state.seed,
        random: state.random,
      };
      state.seed = rebound;
      state.random = seeds.random(rebound);
      try {
        return await runBody(state, fn);
      } finally {
        state.seed = saved.seed;
        state.random = saved.random;
      }
    },
    withStepLoop(driver: StepLoopDriver): DeterministicExecutor {
      state.stepLoop = driver;
      return api;
    },
  };

  return api;
}

/**
 * Reproduce a prior run exactly: bind an executor to `seed` and run `fn`.
 * Pass the seed string from a {@link FailureEnvelope} to replay.
 */
export async function runWithSeed<T>(
  seed: Seed | string | number | bigint,
  fn: (ctx: ExecutorContext) => T | Promise<T>,
  options: Omit<ExecutorOptions, "seed"> = {},
): Promise<T> {
  const seedInput: SeedInput =
    typeof seed === "object" && seed !== null && "value" in seed
      ? seed.value
      : seed;
  return createExecutor({ ...options, seed: seedInput }).run(fn);
}

/** Factory matching {@link DeterministicExecutorFactory}. */
export const executorFactory: DeterministicExecutorFactory = {
  create: createExecutor,
};
