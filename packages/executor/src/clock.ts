import type { ClockOptions, TimerHandle, VirtualClock } from "@scenelock/core";

type TimerKind = "timeout" | "interval";

interface TimerEntry {
  readonly id: number;
  readonly kind: TimerKind;
  readonly intervalMs: number;
  dueMs: number;
  readonly fn: () => void;
  cleared: boolean;
}

/**
 * @deprecated Use {@link VirtualClock} from `@scenelock/core` (timer API is now core).
 * Kept as a type alias for wave-1 import compatibility.
 */
export type ScheduledVirtualClock = VirtualClock;

/** Re-export core handle for package consumers. */
export type { TimerHandle };

interface RealmHooks {
  dateNow: () => number;
  performanceNow: () => number;
}

/**
 * Create a harness virtual clock. Origin defaults to 0.
 * Realm install (`Date.now` / `performance.now`) is opt-in via {@link VirtualClock.install}
 * and is off by default for the browser tier (document: do not install into the page).
 *
 * Due timers fire in `(dueTime, insertionOrder)` order on advance/set.
 */
export function createVirtualClock(options: ClockOptions = {}): VirtualClock {
  let t = options.startMs ?? 0;
  const freezeWallClock = options.freezeWallClock ?? true;
  let nextId = 1;
  const timers = new Map<number, TimerEntry>();
  let installed: RealmHooks | undefined;

  const clearHandle = (handle: TimerHandle): void => {
    const entry = timers.get(handle.id);
    if (entry !== undefined) {
      entry.cleared = true;
      timers.delete(handle.id);
    }
  };

  const fireDueTimers = (): void => {
    // Re-scan after each fire so interval reschedules and nested setTimeouts
    // that are already due in this quantum also run in deterministic order.
    for (;;) {
      const due: TimerEntry[] = [];
      for (const entry of timers.values()) {
        if (!entry.cleared && entry.dueMs <= t) {
          due.push(entry);
        }
      }
      if (due.length === 0) return;
      due.sort((a, b) => a.dueMs - b.dueMs || a.id - b.id);
      const next = due[0]!;
      if (next.cleared) {
        timers.delete(next.id);
        continue;
      }
      if (next.kind === "timeout") {
        timers.delete(next.id);
        next.cleared = true;
        next.fn();
      } else {
        // interval: fire then reschedule from previous due (not from now) to
        // avoid drift under large advances.
        next.fn();
        if (!next.cleared) {
          next.dueMs += next.intervalMs;
        }
      }
    }
  };

  const clock: VirtualClock = {
    now: () => t,
    advance(deltaMs: number): void {
      if (deltaMs < 0) {
        throw new Error("VirtualClock.advance: deltaMs must be >= 0");
      }
      if (deltaMs === 0) {
        fireDueTimers();
        return;
      }
      t += deltaMs;
      fireDueTimers();
    },
    set(ms: number): void {
      if (ms < t) {
        // Moving backward does not un-fire timers; just set the instant.
        t = ms;
        return;
      }
      const delta = ms - t;
      t = ms;
      if (delta > 0) {
        fireDueTimers();
      }
    },
    setTimeout(fn: () => void, delayMs: number): TimerHandle {
      if (delayMs < 0) {
        throw new Error("VirtualClock.setTimeout: delayMs must be >= 0");
      }
      const id = nextId++;
      timers.set(id, {
        id,
        kind: "timeout",
        intervalMs: 0,
        dueMs: t + delayMs,
        fn,
        cleared: false,
      });
      return { id };
    },
    setInterval(fn: () => void, intervalMs: number): TimerHandle {
      if (intervalMs <= 0) {
        throw new Error("VirtualClock.setInterval: intervalMs must be > 0");
      }
      const id = nextId++;
      timers.set(id, {
        id,
        kind: "interval",
        intervalMs,
        dueMs: t + intervalMs,
        fn,
        cleared: false,
      });
      return { id };
    },
    clearTimeout: clearHandle,
    clearInterval: clearHandle,
    pendingTimers: () => timers.size,
    install(): void {
      if (installed !== undefined) return;
      if (!freezeWallClock) return;

      const g = globalThis as typeof globalThis & {
        Date: DateConstructor;
        performance?: { now: () => number };
      };

      const OriginalDate = g.Date;
      // Preserve the original function reference (not a bound wrapper) so
      // uninstall restores Date.now / performance.now by identity.
      const originalDateNow = OriginalDate.now;
      const originalPerfNow =
        typeof g.performance?.now === "function"
          ? g.performance.now
          : originalDateNow;

      installed = { dateNow: originalDateNow, performanceNow: originalPerfNow };

      OriginalDate.now = () => t;
      if (g.performance !== undefined) {
        g.performance.now = () => t;
      }
    },
    uninstall(): void {
      if (installed === undefined) return;
      const g = globalThis as typeof globalThis & {
        Date: DateConstructor;
        performance?: { now: () => number };
      };
      g.Date.now = installed.dateNow;
      if (g.performance !== undefined) {
        g.performance.now = installed.performanceNow;
      }
      installed = undefined;
    },
  };

  return clock;
}
