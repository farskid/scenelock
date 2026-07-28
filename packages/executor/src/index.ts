import type {
  ClockOptions,
  DeterministicExecutor,
  DeterministicExecutorFactory,
  ExecutorContext,
  ExecutorOptions,
  Seed,
  SeedInput,
  SeedManager,
  SeededRandom,
  StepLoopDriver,
  VirtualClock,
} from "@scenelock/core";

/**
 * @scenelock/executor — implements DeterministicExecutor from @scenelock/core.
 * Scaffold only: signatures + stub factory. Real PRNG/clock/step orchestration TBD.
 */

export type {
  DeterministicExecutor,
  DeterministicExecutorFactory,
  ExecutorContext,
  ExecutorOptions,
  StepLoopDriver,
  VirtualClock,
  Seed,
  SeedManager,
  SeededRandom,
};

/** FNV-1a 32-bit — stable, dependency-free seed materialization. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createSeed(input?: SeedInput): Seed {
  const value = input === undefined ? `seed-${Date.now().toString(36)}` : String(input);
  return { value, numeric: hashSeed(value) };
}

export function createVirtualClock(options: ClockOptions = {}): VirtualClock {
  let t = options.startMs ?? 0;
  return {
    now: () => t,
    advance: (deltaMs: number) => {
      if (deltaMs < 0) throw new Error("VirtualClock.advance: deltaMs must be >= 0");
      t += deltaMs;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

/**
 * Placeholder executor. `run` binds seed/clock/random but does not yet install
 * realm hooks or schedule-fuzz. See IMPLEMENTATION_PLAN.md.
 */
export function createExecutor(options: ExecutorOptions = {}): DeterministicExecutor {
  const seed = createSeed(options.seed);
  const clock = createVirtualClock(options.clock);
  const random: SeededRandom = {
    next: () => {
      throw new Error("@scenelock/executor: SeededRandom not implemented yet");
    },
    int: () => {
      throw new Error("@scenelock/executor: SeededRandom not implemented yet");
    },
    shuffle: () => {
      throw new Error("@scenelock/executor: SeededRandom not implemented yet");
    },
  };
  let stepLoop = options.stepLoop;
  const tier = options.tier ?? "engine";

  const api: DeterministicExecutor = {
    seed,
    clock,
    random,
    tier,
    async run<T>(fn: (ctx: ExecutorContext) => T | Promise<T>): Promise<T> {
      const ctx: ExecutorContext = {
        seed,
        clock,
        random,
        tier,
        ...(stepLoop !== undefined ? { stepLoop } : {}),
        async tick(deltaMs: number) {
          if (!stepLoop) {
            throw new Error("ExecutorContext.tick: no StepLoopDriver registered");
          }
          await stepLoop.step(deltaMs);
          await stepLoop.settled();
        },
      };
      return fn(ctx);
    },
    withStepLoop(driver: StepLoopDriver) {
      stepLoop = driver;
      return api;
    },
  };
  return api;
}

export const executorFactory: DeterministicExecutorFactory = {
  create: createExecutor,
};
