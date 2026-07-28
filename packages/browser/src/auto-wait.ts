/**
 * Auto-wait / poll helpers — web-first expects without exposing sleep APIs.
 */

export interface PollOptions {
  /** Wall-clock budget for the poll loop. Default 5000. */
  readonly timeoutMs?: number;
  /** Delay between polls. Default 20 (fake-driver friendly; PW has its own waits). */
  readonly intervalMs?: number;
}

export class AutoWaitTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "AutoWaitTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Poll `probe` until it returns a truthy value or the timeout elapses.
 * Uses real wall-clock (`Date.now` / `setTimeout`) — browser tier is not VT-based.
 */
export async function pollUntil<T>(
  probe: () => Promise<T | null | undefined | false>,
  options: PollOptions & { readonly message: string },
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 20;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      const value = await probe();
      if (value !== null && value !== undefined && value !== false) {
        return value;
      }
    } catch (err) {
      lastError = err;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(intervalMs, remaining));
  }

  const detail =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : lastError ? ` Last error: ${String(lastError)}` : "";
  throw new AutoWaitTimeoutError(`${options.message} (timeout ${timeoutMs}ms).${detail}`, timeoutMs);
}

/** Internal delay — never exported as a public waitForTimeout. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
