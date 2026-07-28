import type {
  StepLoopDriver,
  StepUntilOptions,
  VirtualClock,
} from "@scenelock/core";

/** Default starvation cap when {@link StepUntilOptions.maxSteps} is omitted. */
export const DEFAULT_STEP_UNTIL_MAX_STEPS = 10_000;

/**
 * Thrown when {@link StepLoopDriver.stepUntil} hits its step budget
 * without the predicate becoming true (ticket 12: budget + cap mandatory).
 */
export class StepStarvationError extends Error {
  readonly maxSteps: number;
  readonly stepsTaken: number;

  constructor(maxSteps: number, stepsTaken: number) {
    super(
      `StepLoopDriver.stepUntil: starved after ${stepsTaken} steps (maxSteps=${maxSteps})`,
    );
    this.name = "StepStarvationError";
    this.maxSteps = maxSteps;
    this.stepsTaken = stepsTaken;
  }
}

export interface HostStepLoop {
  /** Advance the host by one logical frame with an explicit delta. */
  step(deltaMs: number): void | Promise<void>;
  /** Optional; defaults to a resolved promise when omitted. */
  settled?(): Promise<void>;
}

export interface StepLoopDriverOptions {
  /** Fixed delta applied on each {@link StepLoopDriver.step} / stepUntil iteration. */
  fixedDtMs: number;
  /**
   * When set, each step also advances this virtual clock by `fixedDtMs`
   * (timers fire as part of clock.advance).
   */
  clock?: VirtualClock;
  /** Default starvation cap for stepUntil. */
  maxSteps?: number;
}

/**
 * Package driver with fixed-dt metadata on top of core {@link StepLoopDriver}.
 * Guarantees `stepN` / `stepUntil` (optional on bare {@link StepLoopDriver}).
 */
export interface StepLoopController extends StepLoopDriver {
  readonly fixedDtMs: number;
  stepN(n: number): Promise<void>;
  stepUntil(
    predicate: () => boolean | Promise<boolean>,
    options?: StepUntilOptions,
  ): Promise<void>;
}

/**
 * Wrap a host `step(dt)` loop with fixed-dt driving, optional clock integration,
 * and a mandatory starvation cap on {@link StepLoopDriver.stepUntil}.
 */
export function createStepLoopDriver(
  host: HostStepLoop,
  options: StepLoopDriverOptions,
): StepLoopController {
  if (!(options.fixedDtMs > 0)) {
    throw new Error("createStepLoopDriver: fixedDtMs must be > 0");
  }
  const defaultMaxSteps = options.maxSteps ?? DEFAULT_STEP_UNTIL_MAX_STEPS;
  if (!(defaultMaxSteps > 0)) {
    throw new Error("createStepLoopDriver: maxSteps must be > 0");
  }
  const clock = options.clock;

  const settled = async (): Promise<void> => {
    if (host.settled !== undefined) {
      await host.settled();
    }
  };

  /** Core StepLoopDriver.step — advances clock then host; does not settle. */
  const step = async (deltaMs: number): Promise<void> => {
    if (clock !== undefined) {
      clock.advance(deltaMs);
    }
    await host.step(deltaMs);
  };

  const stepAndSettle = async (deltaMs: number): Promise<void> => {
    await step(deltaMs);
    await settled();
  };

  return {
    fixedDtMs: options.fixedDtMs,
    step,
    settled,
    async stepN(n: number): Promise<void> {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error("StepLoopDriver.stepN: n must be a non-negative integer");
      }
      for (let i = 0; i < n; i++) {
        await stepAndSettle(options.fixedDtMs);
      }
    },
    async stepUntil(
      predicate: () => boolean | Promise<boolean>,
      untilOptions?: StepUntilOptions,
    ): Promise<void> {
      const maxSteps = untilOptions?.maxSteps ?? defaultMaxSteps;
      if (!(maxSteps > 0)) {
        throw new Error("stepUntil: maxSteps must be > 0");
      }
      if (await predicate()) return;
      for (let i = 0; i < maxSteps; i++) {
        await stepAndSettle(options.fixedDtMs);
        if (await predicate()) return;
      }
      throw new StepStarvationError(maxSteps, maxSteps);
    },
  };
}
