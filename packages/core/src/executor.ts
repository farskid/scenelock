import type { VirtualClock, ClockOptions } from "./clock.js";
import type { Seed, SeedInput, SeededRandom, SeedManager } from "./seed.js";
import type { ExecutionTier } from "./failure.js";

/**
 * Deterministic executor (thesis leg 1).
 * Virtual time + seeded randomness + step-driven host loops.
 * Every run is a seed; failures are replay tokens.
 */

/**
 * Hosts that own their animation/render loop (Creator frame worker, many canvas apps)
 * expose a step driver instead of relying on CDP virtual time.
 */
export interface StepLoopDriver {
  /**
   * Advance the host by one (or N) logical frames with an explicit delta.
   * Must not depend on wall-clock rAF for correctness.
   */
  step(deltaMs: number): void | Promise<void>;
  /** True when queues are drained and the last stepped frame is committed. */
  settled(): Promise<void>;
}

export interface ExecutorContext {
  readonly seed: Seed;
  readonly clock: VirtualClock;
  readonly random: SeededRandom;
  readonly tier: ExecutionTier;
  /** Present when the host registered a step-driven loop. */
  readonly stepLoop?: StepLoopDriver;
  /**
   * Convenience: step(delta) then await settled().
   * Throws if no stepLoop is registered.
   */
  tick(deltaMs: number): Promise<void>;
}

export interface ExecutorOptions {
  seed?: SeedInput;
  clock?: ClockOptions;
  tier?: ExecutionTier;
  stepLoop?: StepLoopDriver;
  /** Optional seed manager override (tests / custom PRNG). */
  seeds?: SeedManager;
}

export interface DeterministicExecutor {
  readonly seed: Seed;
  readonly clock: VirtualClock;
  readonly random: SeededRandom;
  readonly tier: ExecutionTier;

  /** Run a body under this executor's seed/clock/random bindings. */
  run<T>(fn: (ctx: ExecutorContext) => T | Promise<T>): Promise<T>;

  /** Attach or replace the step-driven host loop. */
  withStepLoop(driver: StepLoopDriver): DeterministicExecutor;
}

export interface DeterministicExecutorFactory {
  create(options?: ExecutorOptions): DeterministicExecutor;
}
