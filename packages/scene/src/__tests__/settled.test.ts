import { describe, expect, it } from "vitest";
import {
  awaitSettled,
  createFakeAdapter,
  SceneSettledTimeoutError,
} from "../index.js";

describe("awaitSettled", () => {
  it("resolves immediately when adapter is quiet", async () => {
    const adapter = createFakeAdapter([]);
    await expect(awaitSettled(adapter, { timeoutMs: 200 })).resolves.toBeUndefined();
  });

  it("pumps step callback until pending mutations clear", async () => {
    const adapter = createFakeAdapter([], {
      pendingMutations: 3,
      mutatingReason: "queue depth=3",
    });
    let steps = 0;
    await awaitSettled(adapter, {
      timeoutMs: 2000,
      step: () => {
        steps += 1;
        adapter.step();
      },
      yieldMs: 0,
      diagnose: () => adapter.model.mutatingReason,
    });
    expect(steps).toBeGreaterThanOrEqual(3);
    expect(adapter.model.pendingMutations).toBe(0);
  });

  it("rejects with diagnostic on timeout", async () => {
    const adapter = createFakeAdapter([], {
      pendingMutations: 99,
      mutatingReason: "animation timeline still playing",
    });
    // No step → never settles
    await expect(
      awaitSettled(adapter, {
        timeoutMs: 50,
        diagnose: () => adapter.model.mutatingReason,
      }),
    ).rejects.toMatchObject({
      name: "SceneSettledTimeoutError",
      diagnostic: "animation timeline still playing",
      timeoutMs: 50,
    });

    try {
      await awaitSettled(adapter, {
        timeoutMs: 30,
        diagnose: () => "still dirty",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(SceneSettledTimeoutError);
      expect((e as SceneSettledTimeoutError).message).toContain("still dirty");
    }
  });

  it("uses now() for step-loop timeout", async () => {
    const adapter = createFakeAdapter([], { pendingMutations: 100 });
    let t = 0;
    await expect(
      awaitSettled(adapter, {
        timeoutMs: 100,
        now: () => t,
        step: () => {
          t += 40;
          // deliberately do not clear pending
        },
        yieldMs: 0,
        diagnose: () => "stuck",
      }),
    ).rejects.toBeInstanceOf(SceneSettledTimeoutError);
  });
});
