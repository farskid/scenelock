import { describe, expect, it } from "vitest";
import { createExecutor } from "@scenelock/executor";
import {
  ToyCanvasApp,
  createToySceneAdapter,
  createToyStepLoop,
  renderShapes,
} from "../index.js";

describe("toy-canvas-app unit", () => {
  it("exposes a scene adapter and steps under the executor", async () => {
    const app = new ToyCanvasApp();
    app.add("rect", {
      id: "r1",
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

  it("rasters rect and ellipse distinctly", () => {
    const rect = renderShapes(
      [
        {
          id: "r",
          kind: "rect",
          name: "R",
          x: 0,
          y: 0,
          width: 4,
          height: 4,
          fill: [255, 0, 0, 255],
        },
      ],
      8,
      8,
    );
    const ellipse = renderShapes(
      [
        {
          id: "e",
          kind: "ellipse",
          name: "E",
          x: 0,
          y: 0,
          width: 4,
          height: 4,
          fill: [255, 0, 0, 255],
        },
      ],
      8,
      8,
    );
    expect(Buffer.from(rect.pixels).equals(Buffer.from(ellipse.pixels))).toBe(false);
  });

  it("undo/redo round-trips add", () => {
    const app = new ToyCanvasApp();
    app.add("rect", { name: "A", x: 1, y: 1, width: 4, height: 4 });
    expect(app.list()).toHaveLength(1);
    app.undo();
    expect(app.list()).toHaveLength(0);
    app.redo();
    expect(app.list()).toHaveLength(1);
  });
});
