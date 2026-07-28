import type { SceneAdapter } from "@scenelock/core";
import { SceneSettledTimeoutError } from "./errors.js";

/** Drive host frames while waiting for settledness (executor step loop). */
export type SettledStepCallback = (deltaMs: number) => void | Promise<void>;

export interface AwaitSettledOptions {
  /** Wall-clock timeout in ms. Default 5000. */
  timeoutMs?: number;
  /**
   * Optional frame driver invoked while `adapter.settled()` is pending.
   * Use to pump `StepLoopDriver.step` / host clocks during the wait.
   */
  step?: SettledStepCallback;
  /** Delta passed to `step` each iteration. Default 16. */
  stepDeltaMs?: number;
  /**
   * Host diagnostic when timing out — what was still mutating
   * (queue depth, dirty flags, pending animations, …).
   */
  diagnose?: () => string | Promise<string>;
  /** Clock for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Yield between step pumps; defaults to `setTimeout(0)`. */
  yieldMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function buildDiagnostic(
  diagnose: AwaitSettledOptions["diagnose"],
): Promise<string> {
  if (diagnose === undefined) {
    return "adapter.settled() still pending (no diagnose() provided)";
  }
  return Promise.resolve(diagnose());
}

/**
 * Await `adapter.settled()` with timeout + structured diagnostic.
 *
 * When `step` is provided, frames are pumped until settled resolves or timeout.
 * Without `step`, races the settled promise against the timeout only.
 */
export async function awaitSettled(
  adapter: SceneAdapter,
  options?: AwaitSettledOptions,
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const stepDeltaMs = options?.stepDeltaMs ?? 16;
  const now = options?.now ?? Date.now;
  const yieldMs = options?.yieldMs ?? 0;
  const start = now();

  let settledOk = false;
  let settleError: unknown;
  const settledPromise = Promise.resolve(adapter.settled()).then(
    () => {
      settledOk = true;
    },
    (err: unknown) => {
      settleError = err;
      settledOk = true;
    },
  );

  const throwTimeout = async (): Promise<never> => {
    const diagnostic = await buildDiagnostic(options?.diagnose);
    throw new SceneSettledTimeoutError(timeoutMs, diagnostic);
  };

  const finish = async (): Promise<void> => {
    if (settleError !== undefined) throw settleError;
    if (settledOk) return;
    await throwTimeout();
  };

  if (options?.step === undefined) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        settledPromise,
        new Promise<void>((_resolve, reject) => {
          timer = setTimeout(() => {
            void throwTimeout().catch(reject);
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    return finish();
  }

  const step = options.step;
  while (!settledOk) {
    if (now() - start >= timeoutMs) {
      await throwTimeout();
    }
    await Promise.resolve(step(stepDeltaMs));
    await Promise.race([settledPromise, delay(yieldMs)]);
  }
  return finish();
}
