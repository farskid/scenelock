import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { createHarness, HarnessFailure } from "../index.js";

describe("expect retry loop", () => {
  it("polls until predicate passes (scene / virtual clock)", async () => {
    let ready = false;
    const adapter = createFakeAdapter([
      {
        id: "n1",
        role: "shape",
        name: "Box",
        bbox: { x: 0, y: 0, width: 4, height: 4 },
      },
    ]);

    const t = await createHarness({
      tier: "scene",
      adapter,
      seed: "retry-1",
      timeoutMs: 2000,
      stepLoop: {
        async step() {
          ready = true;
        },
        async settled() {
          /* sync */
        },
      },
    });

    try {
      await t.expect(() => ready).toPass(() => ready, "become ready");
      expect(ready).toBe(true);
    } finally {
      await t.dispose();
    }
  });

  it("times out into HarnessFailure without a sleep API", async () => {
    const t = await createHarness({
      tier: "scene",
      seed: "retry-fail",
      timeoutMs: 48,
    });
    try {
      await t.expect(() => false).toPass(() => false, "never");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessFailure);
      expect((err as HarnessFailure).envelope.status).toBe("timedOut");
    } finally {
      await t.dispose();
    }
  });
});
