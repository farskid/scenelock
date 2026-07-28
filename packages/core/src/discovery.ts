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

/** One edge in a {@link DeclarativeStateModel} transition table. */
export interface TransitionEdge {
  readonly from: string;
  readonly event: string;
  readonly to: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/**
 * Declarative transition-table form of a state model.
 * Compile to the method-form {@link StateModel} for walk generation / runners.
 */
export interface DeclarativeStateModel {
  readonly id: string;
  readonly initial: string;
  readonly states: readonly string[];
  readonly transitions: readonly TransitionEdge[];
}

/**
 * Method-form statechart surface. Compatible in spirit with XState v5 machines
 * without hard-depending on xstate at the core layer.
 *
 * Authoring may use {@link DeclarativeStateModel}; runners consume this interface.
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
  | { kind: "walk-count"; count: number }
  /** All simple paths from initial with edge length ≤ maxDepth. */
  | { kind: "path"; maxDepth: number }
  /** Seeded random walks — same seed ⇒ same walks. */
  | { kind: "random"; count: number; maxLength: number };

export interface WalkGenerator {
  generate(model: StateModel, criterion: CoverageCriterion, seed: Seed): Walk[];
}

/**
 * Structured invariant violation for discovery reports / repro.
 * `reproSteps` is the walk-prefix (inclusive) that reached the failure.
 */
export interface DiscoveryViolation {
  readonly invariantName: string;
  readonly message: string;
  readonly walkId: string;
  /** Seed of the failing walk (replay token). */
  readonly seed: string;
  /** Exact action sequence prefix that reached the violation (inclusive). */
  readonly reproSteps: readonly ModelEvent[];
  readonly stepIndex: number;
}

/**
 * Context passed to {@link Invariant.check}.
 *
 * Pure model-level invariants may omit `harness` / `ctx` (optional).
 * Harness-bound invariants require both.
 */
export interface InvariantContext {
  readonly harness?: Harness;
  readonly ctx?: ExecutorContext;
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

/**
 * Abstract walk execution seam — harness/DSL binds real interactions.
 * Discovery applies events through this hook and optionally probes for combinators.
 */
export interface WalkExecutor {
  /** Called once before steps. */
  begin?(walk: Walk, initial: ModelState): unknown | Promise<unknown>;
  /** Apply one event; may return a snapshot context for invariant checks. */
  applyEvent(event: ModelEvent, state: ModelState): unknown | Promise<unknown>;
  /**
   * Speculative: snapshot after `events` from the current committed state
   * without permanently advancing the walk (fork or undo).
   */
  probe?(events: readonly ModelEvent[]): unknown | Promise<unknown>;
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
  /** Structured violations with walk-prefix repro + seed. */
  violations?: readonly DiscoveryViolation[];
}
