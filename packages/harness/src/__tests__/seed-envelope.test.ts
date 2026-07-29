import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { createHarness, HarnessFailure } from "../index.js";

describe("seed propagation into FailureEnvelope", () => {
  it("records seed + tier on expect timeout", async () => {
    const adapter = createFakeAdapter([
      {
        id: "gone",
        role: "shape",
        name: "X",
        bbox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ]);
    // Make locate always miss so toBeVisible times out.
    adapter.locate = () => null;

    const t = await createHarness({
      tier: "scene",
      adapter,
      seed: "envelope-seed-99",
      timeoutMs: 40,
      testId: "seed::expect",
      file: "seed-envelope.test.ts",
      title: "records seed",
    });

    try {
      const handle = t.scene.getBySceneId("gone");
      await t.expect(handle).toBeVisible();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessFailure);
      const failure = err as HarnessFailure;
      expect(failure.envelope.seed).toBe("envelope-seed-99");
      expect(failure.envelope.tier).toBe("scene");
      expect(failure.envelope.testId).toBe("seed::expect");
      expect(failure.envelope.step).toBe("toBeVisible");
      expect(failure.envelope.locator).toEqual({ kind: "scene", id: "gone" });
    } finally {
      await t.dispose();
    }
  });

  it("toFailureEnvelope always includes seed", async () => {
    const t = await createHarness({
      tier: "browser",
      seed: "browser-seed",
    });
    try {
      const env = t.toFailureEnvelope(new Error("boom"), { step: "manual" });
      expect(env.seed).toBe("browser-seed");
      expect(env.tier).toBe("browser");
      expect(env.step).toBe("manual");
    } finally {
      await t.dispose();
    }
  });

  it("rng draws are seed-stable across harnesses", async () => {
    const a = await createHarness({ tier: "scene", seed: "same" });
    const b = await createHarness({ tier: "scene", seed: "same" });
    try {
      expect([a.rng.next(), a.rng.next()]).toEqual([b.rng.next(), b.rng.next()]);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });
});
