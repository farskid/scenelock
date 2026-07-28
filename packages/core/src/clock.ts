/**
 * Virtual clock owned by the deterministic executor.
 * Hosts that own their rAF use step-driven loops; CDP virtual time is an
 * optional accelerator for main-thread hosts only (ticket 12).
 *
 * Timer API: due callbacks fire in `(dueTime, insertionOrder)` on advance/set.
 */

/** Opaque handle returned by {@link VirtualClock.setTimeout} / setInterval. */
export interface TimerHandle {
  readonly id: number;
}

export interface VirtualClock {
  /** Current virtual time in milliseconds since epoch-or-zero (harness-defined origin). */
  now(): number;
  /** Advance virtual time by deltaMs; fires due timers in deterministic order. */
  advance(deltaMs: number): void;
  /** Set absolute virtual time; advancing forward fires due timers. */
  set(ms: number): void;
  /** Schedule a one-shot callback after `delayMs` virtual milliseconds. */
  setTimeout(fn: () => void, delayMs: number): TimerHandle;
  /** Schedule a repeating callback every `intervalMs` virtual milliseconds. */
  setInterval(fn: () => void, intervalMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  clearInterval(handle: TimerHandle): void;
  /** Number of pending (non-cleared) timers. */
  pendingTimers(): number;
  /** Install into a realm (Date.now / performance.now hooks) when supported. */
  install?(): void | Promise<void>;
  /** Uninstall realm hooks. */
  uninstall?(): void | Promise<void>;
}

export interface ClockOptions {
  /** Starting virtual time. Default 0. */
  startMs?: number;
  /** Freeze Date/performance when install() is called. Default true. */
  freezeWallClock?: boolean;
}
