import type { TimerHandle, VirtualClock } from "@scenelock/core";

/**
 * Real-time passthrough clock for the smoke tier (determinism pack off).
 * `advance` / `set` do not warp wall time; timers use real `setTimeout`.
 */
export function createRealClockShim(): VirtualClock {
  const handles = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  const clear = (handle: TimerHandle): void => {
    const t = handles.get(handle.id);
    if (t !== undefined) {
      clearTimeout(t);
      handles.delete(handle.id);
    }
  };

  return {
    now: () => Date.now(),
    advance(_deltaMs: number): void {
      /* wall clock advances itself — no-op for smoke */
    },
    set(_ms: number): void {
      /* cannot set wall clock — no-op for smoke */
    },
    setTimeout(fn: () => void, delayMs: number): TimerHandle {
      const id = nextId++;
      const timer = setTimeout(() => {
        handles.delete(id);
        fn();
      }, delayMs);
      handles.set(id, timer);
      return { id };
    },
    setInterval(fn: () => void, intervalMs: number): TimerHandle {
      const id = nextId++;
      const timer = setInterval(fn, intervalMs);
      handles.set(id, timer as unknown as ReturnType<typeof setTimeout>);
      return { id };
    },
    clearTimeout: clear,
    clearInterval: clear,
    pendingTimers: () => handles.size,
  };
}
