import type {
  DiscoveryViolation,
  Invariant,
  InvariantContext,
  ModelEvent,
  Walk,
} from "@scenelock/core";
import { jsonStableEqual } from "./equal.js";

/**
 * Abstract snapshot after a walk step (harness/DSL supplies real data later).
 */
export interface SnapshotContext {
  readonly snapshot: unknown;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export type InvariantCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export interface SnapshotInvariantArgs {
  readonly snapshot: unknown;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly walk: Walk;
  readonly stepIndex: number;
  /** Snapshots after begin and each step (index 0 = post-begin). */
  readonly history: readonly SnapshotContext[];
  /**
   * Speculative apply: return snapshot after `events` from the current state
   * without committing to the walk (fork or restore). Required by combinators.
   */
  readonly probe?: (events: readonly ModelEvent[]) => unknown | Promise<unknown>;
}

/**
 * Package-native invariant: name + check → ok/violation.
 *
 * Core {@link InvariantContext} harness/ctx are optional (v2) so pure model
 * invariants work. Prefer {@link SnapshotInvariant} for walk executors;
 * bridge with {@link toCoreInvariant} when needed.
 */
export interface SnapshotInvariant {
  readonly name: string;
  check(ctx: SnapshotInvariantArgs): InvariantCheckResult | Promise<InvariantCheckResult>;
}

/** @deprecated Use {@link DiscoveryViolation} from `@scenelock/core`. */
export type InvariantViolation = DiscoveryViolation;

export class InvariantViolationError extends Error {
  readonly violation: InvariantViolation;

  constructor(violation: InvariantViolation) {
    super(
      `Invariant "${violation.invariantName}" violated at step ${violation.stepIndex}: ${violation.message}`,
    );
    this.name = "InvariantViolationError";
    this.violation = violation;
  }
}

export function ok(): InvariantCheckResult {
  return { ok: true };
}

export function fail(message: string): InvariantCheckResult {
  return { ok: false, message };
}

/**
 * Round-trip identity: probing `action` then `inverse` yields the current
 * snapshot (JSON-stable). Undo/redo shape.
 *
 * Requires `probe` on the check context (see {@link WalkExecutor.probe}).
 */
export function roundTrip(action: ModelEvent, inverse: ModelEvent): SnapshotInvariant {
  return {
    name: `roundTrip(${action.type},${inverse.type})`,
    async check(ctx) {
      if (!ctx.probe) {
        return fail("roundTrip requires WalkExecutor.probe on invariant context");
      }
      const after = await ctx.probe([action, inverse]);
      if (!jsonStableEqual(ctx.snapshot, after)) {
        return fail(
          `roundTrip: snapshot after ${action.type}+${inverse.type} differs from before (JSON-stable)`,
        );
      }
      return ok();
    },
  };
}

/**
 * Undo/redo identity — plan sample name. Checks `redo` then `undo` restores
 * the current snapshot (same as {@link roundTrip}(redo, undo)).
 */
export function undoRedoIdentity(redo: ModelEvent, undo: ModelEvent): SnapshotInvariant {
  const inner = roundTrip(redo, undo);
  return {
    name: "undoRedoIdentity",
    check(ctx) {
      return inner.check(ctx);
    },
  };
}

/**
 * Idempotence: probing `[action]` vs `[action, action]` yields equal snapshots
 * (JSON-stable). Requires `probe`.
 */
export function idempotent(action: ModelEvent): SnapshotInvariant {
  return {
    name: `idempotent(${action.type})`,
    async check(ctx) {
      if (!ctx.probe) {
        return fail("idempotent requires WalkExecutor.probe on invariant context");
      }
      const once = await ctx.probe([action]);
      const twice = await ctx.probe([action, action]);
      if (!jsonStableEqual(once, twice)) {
        return fail(`idempotent: second ${action.type} changed snapshot (JSON-stable)`);
      }
      return ok();
    },
  };
}

/**
 * Snapshot is JSON-round-trip stable (serializable).
 * Plan sample name: `snapshotStable`.
 */
export function snapshotStable(): SnapshotInvariant {
  return {
    name: "snapshotStable",
    check(ctx) {
      try {
        const again = JSON.parse(JSON.stringify(ctx.snapshot)) as unknown;
        if (!jsonStableEqual(ctx.snapshot, again)) {
          return fail("snapshotStable: snapshot is not JSON-round-trip stable");
        }
        return ok();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail(`snapshotStable: snapshot not JSON-serializable (${msg})`);
      }
    },
  };
}

/**
 * Bridge {@link SnapshotInvariant} → core {@link Invariant} (throws on violation).
 * Check body uses a side-channel getter for {@link SnapshotInvariantArgs}.
 */
export function toCoreInvariant(
  inv: SnapshotInvariant,
  getArgs: () => SnapshotInvariantArgs,
): Invariant {
  return {
    name: inv.name,
    async check(coreCtx: InvariantContext): Promise<void> {
      const args = getArgs();
      const result = await inv.check({
        ...args,
        walk: coreCtx.walk,
        stepIndex: coreCtx.stepIndex,
      });
      if (!result.ok) {
        throw new InvariantViolationError({
          invariantName: inv.name,
          message: result.message,
          walkId: coreCtx.walk.id,
          seed: coreCtx.walk.seed.value,
          reproSteps: coreCtx.walk.steps.slice(0, coreCtx.stepIndex + 1).map((s) => s.event),
          stepIndex: coreCtx.stepIndex,
        });
      }
    },
  };
}
