import type { ExecutorContext } from "./executor.js";
import type { Harness } from "./dsl.js";
import type { Seed } from "./seed.js";

/**
 * Model-driven discovery (thesis leg 3).
 * Statecharts (or agent-inferred models) generate walks; invariants run on every walk.
 */

export interface ModelEvent {
  type: string;
  payload?: Readonly<Record<string, unknown>>;
}

export interface ModelState {
  /** Dot-path or flat id of the active state(s). */
  value: string | Readonly<Record<string, unknown>>;
  context?: Readonly<Record<string, unknown>>;
}

/**
 * Minimal statechart surface. Compatible in spirit with XState v5 machines
 * without hard-depending on xstate at the core layer.
 */
export interface StateModel {
  readonly id: string;
  initialState(): ModelState;
  /** Legal transitions from a state (for walk generation / transition coverage). */
  transitions(from: ModelState): readonly ModelEvent[];
  /** Apply an event; returns next state or null if illegal. */
  transition(from: ModelState, event: ModelEvent): ModelState | null;
}

export interface WalkStep {
  event: ModelEvent;
  /** Optional human label for failure envelopes. */
  label?: string;
}

export interface Walk {
  id: string;
  seed: Seed;
  steps: readonly WalkStep[];
  /** Coverage tags (e.g. "transition:idle->drawing"). */
  tags?: readonly string[];
}

export type CoverageCriterion =
  | { kind: "transition"; minCoverage: number }
  | { kind: "state"; minCoverage: number }
  | { kind: "boundary-seeds"; count: number }
  | { kind: "walk-count"; count: number };

export interface WalkGenerator {
  generate(model: StateModel, criterion: CoverageCriterion, seed: Seed): Walk[];
}

export interface InvariantContext {
  readonly harness: Harness;
  readonly ctx: ExecutorContext;
  readonly walk: Walk;
  readonly stepIndex: number;
  readonly state: ModelState;
}

/**
 * Checked after every walk step (and optionally at walk end).
 * Examples: undo/redo identity, mirror-vs-engine consistency, scrub idempotence.
 */
export interface Invariant {
  readonly name: string;
  check(inv: InvariantContext): void | Promise<void>;
}

export interface DiscoveryRunner {
  runWalk(walk: Walk, model: StateModel, invariants: readonly Invariant[]): Promise<void>;
  runAll(
    model: StateModel,
    criterion: CoverageCriterion,
    invariants: readonly Invariant[],
    seed: Seed,
  ): Promise<DiscoveryReport>;
}

export interface DiscoveryReport {
  walksPlanned: number;
  walksPassed: number;
  walksFailed: number;
  coverage: Readonly<Record<string, number>>;
  /** Seeds of failed walks for replay. */
  failedSeeds: readonly string[];
}
