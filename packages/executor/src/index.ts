/**
 * @scenelock/executor — deterministic executor (thesis leg 1).
 *
 * Virtual clock + seeded randomness + step-driven host loops.
 * Every run is a seed; failures are replay tokens via {@link FailureEnvelope}.
 */

export type {
  DeterministicExecutor,
  DeterministicExecutorFactory,
  ExecutorContext,
  ExecutorOptions,
  StepLoopDriver,
  StepUntilOptions,
  VirtualClock,
  TimerHandle,
  Seed,
  SeedInput,
  SeedManager,
  SeededRandom,
  ClockOptions,
  ExecutionTier,
  FailureEnvelope,
} from "@scenelock/core";

export { hashSeed } from "./hash.js";
export {
  createSeed,
  deriveSeed,
  createSeedManager,
  defaultSeedManager,
} from "./seed.js";
export { createSeededRandom } from "./random.js";
export {
  createVirtualClock,
  type ScheduledVirtualClock,
} from "./clock.js";
export {
  createStepLoopDriver,
  StepStarvationError,
  DEFAULT_STEP_UNTIL_MAX_STEPS,
  type HostStepLoop,
  type StepLoopDriverOptions,
  type StepLoopController,
} from "./step-loop.js";
export {
  buildFailureEnvelope,
  toFailureError,
  ExecutorFailure,
  type BuildFailureEnvelopeOptions,
} from "./failure.js";
export {
  exploreSeeds,
  type ExploreSeedsOptions,
  type ExploreSeedFailure,
  type ExploreSeedsResult,
} from "./explore.js";
export {
  createExecutor,
  runWithSeed,
  executorFactory,
} from "./executor.js";
