import { describe, expect, it } from "vitest";
import {
  createStepLoopDriver,
  createVirtualClock,
  StepStarvationError,
} from "../index.js";

describe("StepLoopDriver", () => {
  it("steps with fixed dt and integrates the virtual clock", async () => {
    const clock = createVirtualClock();
    let frames = 0;
    const driver = createStepLoopDriver(
      {
        step(dt) {
          expect(dt).toBe(16);
          frames++;
        },
      },
      { fixedDtMs: 16, clock },
    );

    await driver.stepN(3);
    expect(frames).toBe(3);
    expect(clock.now()).toBe(48);
  });

  it("stepUntil resolves when predicate becomes true", async () => {
    let n = 0;
    const driver = createStepLoopDriver(
      {
        step() {
          n++;
        },
      },
      { fixedDtMs: 1 },
    );

    await driver.stepUntil(() => n >= 4, { maxSteps: 10 });
    expect(n).toBe(4);
  });

  it("stepUntil trips starvation cap", async () => {
    const driver = createStepLoopDriver(
      { step() {} },
      { fixedDtMs: 1, maxSteps: 5 },
    );

    await expect(
      driver.stepUntil(() => false, { maxSteps: 3 }),
    ).rejects.toBeInstanceOf(StepStarvationError);

    try {
      await driver.stepUntil(() => false, { maxSteps: 3 });
    } catch (e) {
      expect(e).toBeInstanceOf(StepStarvationError);
      const err = e as StepStarvationError;
      expect(err.maxSteps).toBe(3);
      expect(err.stepsTaken).toBe(3);
    }
  });

  it("tick-compatible: step then settled", async () => {
    const order: string[] = [];
    const driver = createStepLoopDriver(
      {
        step() {
          order.push("step");
        },
        async settled() {
          order.push("settled");
        },
      },
      { fixedDtMs: 16 },
    );
    await driver.step(16);
    await driver.settled();
    expect(order).toEqual(["step", "settled"]);
  });
});
