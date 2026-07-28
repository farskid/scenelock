import { describe, expect, it } from "vitest";
import { createVirtualClock } from "../index.js";

describe("VirtualClock", () => {
  it("advances and sets virtual time", () => {
    const clock = createVirtualClock({ startMs: 1000 });
    expect(clock.now()).toBe(1000);
    clock.advance(16);
    expect(clock.now()).toBe(1016);
    clock.set(5000);
    expect(clock.now()).toBe(5000);
  });

  it("fires interleaved timers in (dueTime, insertionOrder)", () => {
    const clock = createVirtualClock();
    const log: string[] = [];

    clock.setTimeout(() => log.push("A@10"), 10);
    clock.setTimeout(() => log.push("B@5"), 5);
    clock.setTimeout(() => log.push("C@10"), 10); // same due as A, later insert
    clock.setTimeout(() => log.push("D@5"), 5); // same due as B, later insert

    clock.advance(10);
    expect(log).toEqual(["B@5", "D@5", "A@10", "C@10"]);
  });

  it("setInterval fires repeatedly without drift under large advance", () => {
    const clock = createVirtualClock();
    let fires = 0;
    const handle = clock.setInterval(() => {
      fires++;
    }, 10);
    // Jump past 3 interval boundaries; reschedule from prior due (not from now).
    clock.advance(35);
    expect(fires).toBe(3);
    clock.advance(4); // t=39 — next due is 40
    expect(fires).toBe(3);
    clock.advance(1); // t=40
    expect(fires).toBe(4);
    clock.clearInterval(handle);
    clock.advance(100);
    expect(fires).toBe(4);
  });

  it("clearTimeout prevents fire", () => {
    const clock = createVirtualClock();
    const log: string[] = [];
    const h = clock.setTimeout(() => log.push("x"), 5);
    clock.clearTimeout(h);
    clock.advance(100);
    expect(log).toEqual([]);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("nested setTimeout scheduled for same quantum fires deterministically", () => {
    const clock = createVirtualClock();
    const log: string[] = [];
    clock.setTimeout(() => {
      log.push("outer");
      clock.setTimeout(() => log.push("inner-0"), 0);
    }, 5);
    clock.advance(5);
    expect(log).toEqual(["outer", "inner-0"]);
  });

  it("install patches Date.now / performance.now and uninstall restores", () => {
    const clock = createVirtualClock({ startMs: 42 });
    const beforeDate = Date.now;
    const beforePerf = performance.now;

    clock.install?.();
    expect(Date.now()).toBe(42);
    expect(performance.now()).toBe(42);
    clock.advance(8);
    expect(Date.now()).toBe(50);

    clock.uninstall?.();
    expect(Date.now).toBe(beforeDate);
    expect(performance.now).toBe(beforePerf);
  });
});
