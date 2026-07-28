/**
 * `@scenelock/discovery` — model-driven test discovery.
 *
 * Generates walks from a {@link StateModel}, runs them through an abstract
 * {@link WalkExecutor}, and evaluates invariants after every step.
 *
 * XState is **not** a dependency. See the mapping guide on
 * {@link DeclarativeStateModel} / `model.ts` for converting XState v5 machines.
 */

export type {
  CoverageCriterion,
  DiscoveryReport,
  DiscoveryRunner,
  Invariant,
  InvariantContext,
  ModelEvent,
  ModelState,
  StateModel,
  Walk,
  WalkGenerator,
  WalkStep,
  Seed,
} from "@scenelock/core";

export {
  defineStateModel,
  fromDeclarativeModel,
  validateModel,
  enumerateStates,
  enumerateTransitions,
  stateKey,
  transitionKey,
  transitionTag,
} from "./model.js";
export type {
  DeclarativeStateModel,
  TransitionEdge,
  ModelValidationError,
  ModelValidationResult,
  EnumeratedTransition,
} from "./model.js";

export {
  createWalkGenerator,
  transitionCoverageWalks,
  pathCoverageWalks,
  randomWalksForModel,
  simulateWalk,
  coveredTransitions,
  coveredStates,
} from "./walks.js";
export type {
  ExtendedCoverageCriterion,
  RandomWalkOptions,
  DiscoveryWalkGenerator,
} from "./walks.js";

export { mulberry32, hashString } from "./random.js";
export type { Mulberry32 } from "./random.js";

export { jsonStableEqual, stableStringify } from "./equal.js";

export {
  roundTrip,
  undoRedoIdentity,
  idempotent,
  snapshotStable,
  toCoreInvariant,
  ok,
  fail,
  InvariantViolationError,
} from "./invariants.js";
export type {
  SnapshotContext,
  SnapshotInvariant,
  SnapshotInvariantArgs,
  InvariantCheckResult,
  InvariantViolation,
} from "./invariants.js";

export { createDiscoveryRunner } from "./runner.js";
export type {
  WalkExecutor,
  WalkRunResult,
  ExtendedDiscoveryReport,
  DiscoveryRunnerOptions,
  DiscoveryRunnerApi,
} from "./runner.js";
