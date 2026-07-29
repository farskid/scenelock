import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { FakePageDriver } from "@scenelock/browser";
import {
  createHarness,
  TierPromotionError,
  TIER_CAPABILITIES,
  type CreateHarnessOptions,
} from "../index.js";
import type { ExecutionTier } from "@scenelock/core";

const TIERS: ExecutionTier[] = ["scene", "browser", "golden", "smoke"];
const SUBSURFACES = ["ui", "scene", "user", "clock", "rng", "expect", "golden"] as const;

async function harnessFor(tier: ExecutionTier) {
  const adapter = createFakeAdapter([
    {
      id: "n1",
      role: "shape",
      name: "Box",
      bbox: { x: 0, y: 0, width: 10, height: 10 },
    },
  ]);
  const opts: CreateHarnessOptions = {
    tier,
    adapter,
    seed: `gate-${tier}`,
    driver: new FakePageDriver({
      elements: [{ id: "btn", role: "button", name: "Go", testId: "go" }],
    }),
    pointer: {
      click() {
        /* sink */
      },
    },
    goldenStore: {
      async compare() {
        return {
          verdict: "match",
          testId: "x",
          diff: { verdict: "match" },
        };
      },
    },
  };
  return createHarness(opts);
}

describe("tier gating matrix", () => {
  for (const tier of TIERS) {
    describe(`tier=${tier}`, () => {
      for (const surface of SUBSURFACES) {
        const caps = TIER_CAPABILITIES[tier];
        const live =
          surface === "ui"
            ? caps.ui
            : surface === "golden"
              ? caps.golden
              : true;

        it(`${surface} is ${live ? "live" : "TierPromotionError"}`, async () => {
          const t = await harnessFor(tier);
          try {
            if (surface === "ui") {
              if (live) {
                expect(t.ui.getByTestId("go").kind).toBe("ui");
              } else {
                expect(() => t.ui).toThrow(TierPromotionError);
                try {
                  void t.ui;
                } catch (err) {
                  expect(err).toBeInstanceOf(TierPromotionError);
                  const e = err as TierPromotionError;
                  expect(e.message).toContain("browser");
                  expect(e.message).toContain(".browser.test.ts");
                }
              }
            } else if (surface === "golden") {
              if (live) {
                const result = await t.golden.compare("x", {
                  width: 1,
                  height: 1,
                  pixels: new Uint8ClampedArray(4),
                });
                expect(result.verdict).toBe("match");
              } else {
                expect(() => t.golden).toThrow(TierPromotionError);
                try {
                  void t.golden;
                } catch (err) {
                  expect(err).toBeInstanceOf(TierPromotionError);
                  const e = err as TierPromotionError;
                  expect(e.message).toContain("golden");
                  expect(e.message).toContain(".golden.test.ts");
                }
              }
            } else if (surface === "scene") {
              const box = t.scene.getByRole("shape", { name: "Box" });
              expect(box.id).toBe("n1");
            } else if (surface === "user") {
              const box = t.scene.getBySceneId("n1");
              await t.user.click(box);
            } else if (surface === "clock") {
              expect(typeof t.clock.now()).toBe("number");
              t.clock.advance(1);
            } else if (surface === "rng") {
              expect(typeof t.rng.next()).toBe("number");
            } else if (surface === "expect") {
              const box = t.scene.getBySceneId("n1");
              await t.expect(box).toBeVisible();
            }
          } finally {
            await t.dispose();
          }
        });
      }
    });
  }
});
