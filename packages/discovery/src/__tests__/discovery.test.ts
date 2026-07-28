import { describe, expect, it } from "vitest";
import { createWalkGenerator, defineStateModel, enumerateTransitions } from "../index.js";
import type { ModelEvent, ModelState, Seed } from "@scenelock/core";

describe("@scenelock/discovery", () => {
  it("enumerates transitions from a tiny state model", () => {
    const model = defineStateModel({
      id: "toggle",
      initialState: (): ModelState => ({ value: "off" }),
      transitions(from): ModelEvent[] {
        return from.value === "off" ? [{ type: "TOGGLE" }] : [{ type: "TOGGLE" }];
      },
      transition(from, event): ModelState | null {
        if (event.type !== "TOGGLE") return null;
        return { value: from.value === "off" ? "on" : "off" };
      },
    });

    const edges = enumerateTransitions(model);
    expect(edges.length).toBeGreaterThanOrEqual(1);

    const seed: Seed = { value: "s", numeric: 1 };
    const walks = createWalkGenerator().generate(model, { kind: "walk-count", count: 1 }, seed);
    expect(walks).toHaveLength(1);
    expect(walks[0]?.seed.value).toBe("s");
  });
});
