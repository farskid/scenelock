import { describe, expect, it } from "vitest";
import { createHarness } from "@scenelock/harness";
import {
  ToyCanvasApp,
  createToyPointerSink,
  createToySceneAdapter,
  createToyStepLoop,
} from "../index.js";

describe("toy harness e2e (scene tier)", () => {
  it("query → user action → settled → assert", async () => {
    const app = new ToyCanvasApp();
    app.add("rect", {
      name: "Box",
      x: 10,
      y: 10,
      width: 16,
      height: 16,
      fill: [240, 80, 80, 255],
    });
    app.add("ellipse", {
      name: "Oval",
      x: 40,
      y: 40,
      width: 12,
      height: 12,
      fill: [80, 120, 240, 255],
    });

    const adapter = createToySceneAdapter(app);
    const t = await createHarness({
      tier: "scene",
      adapter,
      seed: "toy-harness-1",
      stepLoop: createToyStepLoop(app),
      pointer: createToyPointerSink(app),
    });

    try {
      const box = t.scene.getByRole("rect", { name: "Box" });
      expect(box.id).toBeTruthy();

      await t.user.click(box);
      expect(app.model.selected).toBe(box.id);

      app.tweenTo(box.id, 24, 24, 48);
      await t.settled();

      expect(app.isSettled()).toBe(true);
      expect(app.bboxOf(box.id)).toEqual({ x: 24, y: 24, width: 16, height: 16 });

      await t.expect(box).toMatchScene({ role: "rect", name: "Box" });
      await t
        .expect(() => app.model.selected === box.id)
        .toPass(() => app.model.selected === box.id);
    } finally {
      await t.dispose();
    }
  });
});
