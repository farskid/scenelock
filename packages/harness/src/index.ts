/**
 * @scenelock/harness — unified tiered DSL (tickets 06 + 07).
 *
 * One entrypoint {@link createHarness}; tier decides which subsurfaces are live.
 * Dead members throw {@link TierPromotionError} (never `undefined`).
 * Failures normalize to core {@link FailureEnvelope} with seed + tier.
 */

export type { ExecutionTier, FailureEnvelope, SeededRandom, VirtualClock } from "@scenelock/core";

export {
  TierPromotionError,
  tierFromFilename,
  assertTierCapability,
  TIER_CAPABILITIES,
  TIER_FILENAME_SUFFIX,
  EXECUTION_TIERS,
  type TierCapabilities,
  type HarnessSubsurface,
} from "./tiers.js";

export {
  TierBudget,
  type TierBudgets,
  type TierBudgetViolation,
  type TierBudgetReport,
} from "./budget.js";

export {
  TIER_FILENAME_CONVENTION,
  tierIncludeGlobs,
  scenelockVitestTierProjects,
  describeTierFilenameConvention,
} from "./vitest.js";

export { createRealClockShim } from "./clock-shim.js";
export { harnessPoll, AutoWaitTimeoutError } from "./poll.js";

export { createHarness } from "./create-harness.js";

export {
  HarnessFailure,
  type CreateHarnessOptions,
  type TestHarness,
  type UiHandle,
  type SceneHandle,
  type TargetHandle,
  type UiSurface,
  type SceneSurface,
  type UserSurface,
  type Expectation,
  type ExpectSurface,
  type GoldenSurface,
  type PointerSink,
  type HarnessGoldenStore,
} from "./types.js";
