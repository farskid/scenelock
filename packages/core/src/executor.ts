import type { VirtualClock, ClockOptions } from "./clock.js";
import type { Seed, SeedInput, SeededRandom, SeedManager } from "./seed.js";
import type { ExecutionTier, FailureEnvelope } from "./failure.js";

/**
 * Deterministic executor (thesis leg 1).
 * Virtual time + seeded randomness + step-driven host loops.
 * Every run is a seed; failures are replay tokens.
 */

/** Options for {@link StepLoopDriver.stepUntil}. */
export interface StepUntilOptions {
  /** Hard cap on steps; implementations must throw when exceeded. */
  maxSteps?: number;
}

/**
 * Hosts that own their animation/render loop (Creator frame worker, many canvas apps)
 * expose a step driver instead of relying on CDP virtual time.
 *
 * Controllers also expose fixed-dt helpers (`stepN`, `stepUntil`) with a mandatory
 * starvation cap on waits.
 */
export interface StepLoopDriver {
  /**
   * Advance the host by one (or N) logical frames with an explicit delta.
   * Must not depend on wall-clock rAF for correctness.
   */
  step(deltaMs: number): void | Promise<void>;
  /** True when queues are drained and the last stepped frame is committed. */
  settled(): Promise<void>;
  /**
   * Run exactly `n` fixed-dt steps (each typically followed by settled).
   * Provided by controller wrappers (`createStepLoopDriver`); optional on bare hosts.
   */
  stepN?(n: number): Promise<void>;
  /**
   * Step with fixed dt until `predicate` is true.
   * Always bounded: throws when the starvation cap is hit.
   * Provided by controller wrappers; optional on bare hosts.
   */
  stepUntil?(
    predicate: () => boolean | Promise<boolean>,
    options?: StepUntilOptions,
  ): Promise<void>;
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
  /**
   * Invoked when `run` / `runWithSeed` wraps a thrown error into a
   * {@link FailureEnvelope} (before rethrowing).
   */
  onFailureEnvelope?: (envelope: FailureEnvelope) => void;
}

export interface DeterministicExecutor {
  readonly seed: Seed;
  readonly clock: VirtualClock;
  readonly random: SeededRandom;
  readonly tier: ExecutionTier;

  /** Run a body under this executor's seed/clock/random bindings. */
  run<T>(fn: (ctx: ExecutorContext) => T | Promise<T>): Promise<T>;

  /**
   * Reproduce a prior run: bind `seed` (replay token from a {@link FailureEnvelope})
   * and run `fn` under a fresh clock/PRNG for that seed.
   */
  runWithSeed<T>(
    seed: SeedInput,
    fn: (ctx: ExecutorContext) => T | Promise<T>,
  ): Promise<T>;

  /** Attach or replace the step-driven host loop. */
  withStepLoop(driver: StepLoopDriver): DeterministicExecutor;
}

export interface DeterministicExecutorFactory {
  create(options?: ExecutorOptions): DeterministicExecutor;
}
