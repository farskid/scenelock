import { describe, expect, it } from "vitest";
import { createExecutor } from "@scenelock/executor";
import {
  ToyCanvasApp,
  createToySceneAdapter,
  createToyStepLoop,
} from "../index.js";

describe("toy-canvas-app", () => {
  it("exposes a scene adapter and steps under the executor", async () => {
    const app = new ToyCanvasApp();
    app.add({
      id: "r1",
      role: "shape",
      name: "Rect",
      x: 4,
      y: 4,
      width: 8,
      height: 8,
      fill: [255, 0, 0, 255],
    });

    const adapter = createToySceneAdapter(app);
    const snap = await adapter.snapshot();
    expect(snap).toHaveLength(1);
    expect(adapter.locate("r1")).toEqual({ x: 4, y: 4, width: 8, height: 8 });

    const ex = createExecutor({ seed: "toy-1", stepLoop: createToyStepLoop(app) });
    await ex.run(async (ctx) => {
      await ctx.tick(16);
    });
    expect(app.frameIndex).toBe(1);
    expect(app.currentTime).toBe(16);
  });
});
