import type {
  CoverageCriterion,
  DiscoveryReport,
  DiscoveryRunner,
  ExecutorContext,
  Harness,
  Invariant,
  ModelEvent,
  ModelState,
  Seed,
  StateModel,
  VirtualClock,
  Walk,
} from "@scenelock/core";
import {
  InvariantViolationError,
  type InvariantViolation,
  type SnapshotContext,
  type SnapshotInvariant,
  type SnapshotInvariantArgs,
} from "./invariants.js";
import { enumerateStates, enumerateTransitions, stateKey, transitionKey } from "./model.js";
import { mulberry32 } from "./random.js";
import {
  coveredStates,
  coveredTransitions,
  createWalkGenerator,
  type DiscoveryWalkGenerator,
  type ExtendedCoverageCriterion,
} from "./walks.js";

/**
 * Abstract walk execution — harness/DSL binds real interactions later.
 * Discovery only needs apply + optional speculative probe for combinators.
 */
export interface WalkExecutor {
  /** Called once before steps; default snapshot is `null`. */
  begin?(walk: Walk, initial: ModelState): SnapshotContext | Promise<SnapshotContext>;
  /** Apply one event; return snapshot context for invariant checks. */
  applyEvent(
    event: ModelEvent,
    state: ModelState,
  ): SnapshotContext | Promise<SnapshotContext>;
  /**
   * Speculative: snapshot after `events` from the current committed state
   * without permanently advancing the walk (fork or undo). Needed by
   * `roundTrip` / `idempotent`.
   */
  probe?(events: readonly ModelEvent[]): unknown | Promise<unknown>;
}

export interface WalkRunResult {
  readonly walk: Walk;
  readonly passed: boolean;
  readonly violation?: InvariantViolation;
  /** States visited during this walk (model keys). */
  readonly statesVisited: readonly string[];
  /** Transition keys hit during this walk. */
  readonly transitionsHit: readonly string[];
}

export interface ExtendedDiscoveryReport extends DiscoveryReport {
  readonly violations: readonly InvariantViolation[];
  readonly walkResults: readonly WalkRunResult[];
  /** transitionsHit / transitionsTotal */
  readonly transitionCoverageRatio: number;
  readonly transitionsHit: number;
  readonly transitionsTotal: number;
  readonly statesVisited: number;
  readonly statesTotal: number;
}

export interface DiscoveryRunnerOptions {
  readonly executor: WalkExecutor;
  readonly generator?: DiscoveryWalkGenerator;
  /**
   * Optional real harness/ctx for core {@link Invariant} compatibility.
   * When omitted, stubs are used (DSL methods throw).
   */
  readonly harness?: Harness;
  readonly createExecutorContext?: (seed: Seed) => ExecutorContext;
}

export interface DiscoveryRunnerApi extends DiscoveryRunner {
  /** Run one walk against {@link SnapshotInvariant}s (preferred API). */
  runWalkSnapshots(
    walk: Walk,
    model: StateModel,
    invariants: readonly SnapshotInvariant[],
  ): Promise<WalkRunResult>;
  /** Generate + run with extended criteria and snapshot invariants. */
  runAllSnapshots(
    model: StateModel,
    criterion: ExtendedCoverageCriterion,
    invariants: readonly SnapshotInvariant[],
    seed: Seed,
  ): Promise<ExtendedDiscoveryReport>;
}

function stubClock(): VirtualClock {
  let now = 0;
  return {
    now: () => now,
    set(ms: number) {
      now = ms;
    },
    advance(ms: number) {
      now += ms;
    },
    install() {
      /* no-op stub */
    },
    uninstall() {
      /* no-op stub */
    },
  };
}

function stubExecutorContext(seed: Seed): ExecutorContext {
  const clock = stubClock();
  const rng = mulberry32(seed.numeric);
  return {
    seed,
    clock,
    random: {
      next: () => rng.next(),
      int: (min, max) => rng.int(min, max),
      shuffle<T>(items: readonly T[]): T[] {
        const out = items.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = rng.int(0, i + 1);
          const tmp = out[i]!;
          out[i] = out[j]!;
          out[j] = tmp;
        }
        return out;
      },
    },
    tier: "engine",
    async tick() {
      throw new Error("@scenelock/discovery: stub ExecutorContext has no stepLoop");
    },
  };
}

function stubHarness(ctx: ExecutorContext): Harness {
  const fail = (): never => {
    throw new Error(
      "@scenelock/discovery: Harness not bound; use SnapshotInvariant + WalkExecutor",
    );
  };
  return {
    locate: fail,
    getByRole: fail,
    getByLabel: fail,
    getByText: fail,
    getByTestId: fail,
    getBySceneId: fail,
    scene: fail,
    snapshotScene: async () => [],
    settled: async () => undefined,
    ctx: () => ctx,
  };
}

async function evalSnapshots(
  invariants: readonly SnapshotInvariant[],
  args: SnapshotInvariantArgs,
  walk: Walk,
  stepIndex: number,
): Promise<InvariantViolation | undefined> {
  for (const inv of invariants) {
    const result = await inv.check(args);
    if (!result.ok) {
      return {
        invariantName: inv.name,
        message: result.message,
        walkId: walk.id,
        seed: walk.seed.value,
        reproSteps: walk.steps.slice(0, stepIndex + 1).map((s) => s.event),
        stepIndex,
      };
    }
  }
  return undefined;
}

export function createDiscoveryRunner(options: DiscoveryRunnerOptions): DiscoveryRunnerApi {
  const generator = options.generator ?? createWalkGenerator();
  const { executor } = options;

  const runWalkSnapshots = async (
    walk: Walk,
    model: StateModel,
    invariants: readonly SnapshotInvariant[],
  ): Promise<WalkRunResult> => {
    const statesVisited: string[] = [];
    const transitionsHit: string[] = [];
    let state = model.initialState();
    statesVisited.push(stateKey(state));

    const history: SnapshotContext[] = [];
    const beginSnap = executor.begin
      ? await executor.begin(walk, state)
      : { snapshot: null as unknown };
    history.push(beginSnap);

    const probe = executor.probe?.bind(executor);

    // Invariants run after every walk step (not at begin), per ticket 15 / plan.

    for (let i = 0; i < walk.steps.length; i++) {
      const step = walk.steps[i]!;
      const from = state;
      const next = model.transition(state, step.event);
      if (!next) {
        return {
          walk,
          passed: false,
          violation: {
            invariantName: "(model)",
            message: `illegal transition ${step.event.type} from ${stateKey(state)}`,
            walkId: walk.id,
            seed: walk.seed.value,
            reproSteps: walk.steps.slice(0, i + 1).map((s) => s.event),
            stepIndex: i,
          },
          statesVisited,
          transitionsHit,
        };
      }

      transitionsHit.push(transitionKey(from, step.event));
      const snap = await executor.applyEvent(step.event, next);
      history.push(snap);
      state = next;
      statesVisited.push(stateKey(state));

      const args: SnapshotInvariantArgs = {
        snapshot: snap.snapshot,
        walk,
        stepIndex: i,
        history: history.slice(),
        ...(snap.meta !== undefined ? { meta: snap.meta } : {}),
        ...(probe ? { probe } : {}),
      };
      const violation = await evalSnapshots(invariants, args, walk, i);
      if (violation) {
        return {
          walk,
          passed: false,
          violation,
          statesVisited,
          transitionsHit,
        };
      }
    }

    return { walk, passed: true, statesVisited, transitionsHit };
  };

  const aggregate = (
    model: StateModel,
    results: WalkRunResult[],
    planned: number,
  ): ExtendedDiscoveryReport => {
    const allTransitions = enumerateTransitions(model);
    const allStates = enumerateStates(model);
    const walks = results.map((r) => r.walk);
    const hitT = coveredTransitions(model, walks);
    const hitS = coveredStates(model, walks);
    const violations = results
      .filter((r) => r.violation !== undefined)
      .map((r) => r.violation!);
    const failed = results.filter((r) => !r.passed);
    const transitionsTotal = allTransitions.length;
    const transitionsHit = hitT.size;
    const statesTotal = allStates.length;
    const statesVisited = hitS.size;

    return {
      walksPlanned: planned,
      walksPassed: results.filter((r) => r.passed).length,
      walksFailed: failed.length,
      coverage: {
        transitionsHit,
        transitionsTotal,
        statesVisited,
        statesTotal,
        transitionCoverage:
          transitionsTotal === 0 ? 1 : transitionsHit / transitionsTotal,
        stateCoverage: statesTotal === 0 ? 1 : statesVisited / statesTotal,
      },
      failedSeeds: failed.map((r) => r.walk.seed.value),
      violations,
      walkResults: results,
      transitionCoverageRatio:
        transitionsTotal === 0 ? 1 : transitionsHit / transitionsTotal,
      transitionsHit,
      transitionsTotal,
      statesVisited,
      statesTotal,
    };
  };

  const runAllSnapshots = async (
    model: StateModel,
    criterion: ExtendedCoverageCriterion,
    invariants: readonly SnapshotInvariant[],
    seed: Seed,
  ): Promise<ExtendedDiscoveryReport> => {
    const walks = generator.generate(model, criterion, seed);
    const results: WalkRunResult[] = [];
    for (const walk of walks) {
      results.push(await runWalkSnapshots(walk, model, invariants));
    }
    return aggregate(model, results, walks.length);
  };

  return {
    async runWalk(walk, model, invariants) {
      const result = await runWalkWithCoreInvariants(walk, model, invariants, options, executor);
      if (!result.passed && result.violation) {
        throw new InvariantViolationError(result.violation);
      }
    },

    async runAll(model, criterion, invariants, seed): Promise<DiscoveryReport> {
      const walks = generator.generate(model, criterion as CoverageCriterion, seed);
      const results: WalkRunResult[] = [];
      for (const walk of walks) {
        results.push(
          await runWalkWithCoreInvariants(walk, model, invariants, options, executor),
        );
      }
      const report = aggregate(model, results, walks.length);
      // Return core-shaped report (extra fields are OK structurally for callers that want them,
      // but DiscoveryReport type only guarantees the base fields).
      return {
        walksPlanned: report.walksPlanned,
        walksPassed: report.walksPassed,
        walksFailed: report.walksFailed,
        coverage: report.coverage,
        failedSeeds: report.failedSeeds,
      };
    },

    runWalkSnapshots,
    runAllSnapshots,
  };
}

async function runWalkWithCoreInvariants(
  walk: Walk,
  model: StateModel,
  invariants: readonly Invariant[],
  options: DiscoveryRunnerOptions,
  executor: WalkExecutor,
): Promise<WalkRunResult> {
  const ctx = options.createExecutorContext?.(walk.seed) ?? stubExecutorContext(walk.seed);
  const harness = options.harness ?? stubHarness(ctx);
  const statesVisited: string[] = [];
  const transitionsHit: string[] = [];
  let state = model.initialState();
  statesVisited.push(stateKey(state));

  if (executor.begin) {
    await executor.begin(walk, state);
  }

  for (let i = 0; i < walk.steps.length; i++) {
    const step = walk.steps[i]!;
    const from = state;
    const next = model.transition(state, step.event);
    if (!next) {
      return {
        walk,
        passed: false,
        violation: {
          invariantName: "(model)",
          message: `illegal transition ${step.event.type} from ${stateKey(state)}`,
          walkId: walk.id,
          seed: walk.seed.value,
          reproSteps: walk.steps.slice(0, i + 1).map((s) => s.event),
          stepIndex: i,
        },
        statesVisited,
        transitionsHit,
      };
    }
    transitionsHit.push(transitionKey(from, step.event));
    await executor.applyEvent(step.event, next);
    state = next;
    statesVisited.push(stateKey(state));

    try {
      for (const inv of invariants) {
        await inv.check({
          harness,
          ctx,
          walk,
          stepIndex: i,
          state,
        });
      }
    } catch (err) {
      if (err instanceof InvariantViolationError) {
        return {
          walk,
          passed: false,
          violation: err.violation,
          statesVisited,
          transitionsHit,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        walk,
        passed: false,
        violation: {
          invariantName: "(thrown)",
          message,
          walkId: walk.id,
          seed: walk.seed.value,
          reproSteps: walk.steps.slice(0, i + 1).map((s) => s.event),
          stepIndex: i,
        },
        statesVisited,
        transitionsHit,
      };
    }
  }

  return { walk, passed: true, statesVisited, transitionsHit };
}
