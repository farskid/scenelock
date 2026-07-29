import type { ExecutionTier, StepLoopDriver, VirtualClock } from "@scenelock/core";
import { AutoWaitTimeoutError, pollUntil } from "@scenelock/browser";

export interface HarnessPollOptions {
  readonly tier: ExecutionTier;
  readonly clock: VirtualClock;
  readonly stepLoop?: StepLoopDriver;
  readonly timeoutMs: number;
  readonly message: string;
  /** Fixed dt for deterministic poll stepping. Default 16. */
  readonly stepDeltaMs?: number;
}

/**
 * Retry until `probe` is truthy. Browser/smoke use wall-clock polling;
 * scene/golden advance the virtual clock / step loop (no public sleep API).
 */
export async function harnessPoll(
  probe: () => Promise<boolean>,
  options: HarnessPollOptions,
): Promise<void> {
  const { tier, timeoutMs, message } = options;

  if (tier === "browser" || tier === "smoke") {
    await pollUntil(
      async () => {
        const ok = await probe();
        return ok ? true : null;
      },
      { timeoutMs, message, intervalMs: 20 },
    );
    return;
  }

  const stepDeltaMs = options.stepDeltaMs ?? 16;
  const maxSteps = Math.max(1, Math.ceil(timeoutMs / stepDeltaMs));
  let lastError: unknown;

  for (let i = 0; i < maxSteps; i++) {
    try {
      if (await probe()) return;
    } catch (err) {
      lastError = err;
    }
    if (options.stepLoop !== undefined) {
      await options.stepLoop.step(stepDeltaMs);
      await options.stepLoop.settled();
    } else {
      options.clock.advance(stepDeltaMs);
    }
  }

  const detail =
    lastError instanceof Error
      ? ` Last error: ${lastError.message}`
      : lastError
        ? ` Last error: ${String(lastError)}`
        : "";
  throw new AutoWaitTimeoutError(`${message} (timeout ${timeoutMs}ms).${detail}`, timeoutMs);
}

export { AutoWaitTimeoutError };
