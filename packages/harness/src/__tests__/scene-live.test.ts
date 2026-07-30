import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { createHarness } from "../index.js";

describe("t.scene live queries", () => {
  it("re-snapshots between queries (live-by-default)", async () => {
    const adapter = createFakeAdapter([
      {
        id: "n1",
        role: "shape",
        name: "Box",
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        state: { selected: false },
      },
    ]);

    const t = await createHarness({
      tier: "scene",
      adapter,
      seed: "live-1",
    });

    try {
      expect(t.scene.getByState((n) => n.state?.selected === false).id).toBe("n1");

      adapter.setNodes([
        {
          id: "n1",
          role: "shape",
          name: "Box",
          bbox: { x: 0, y: 0, width: 10, height: 10 },
          state: { selected: true },
        },
      ]);

      // Live: mutation is visible without refresh().
      expect(t.scene.getByState((n) => n.state?.selected === true).id).toBe("n1");
      const snap = await t.scene.snapshot();
      expect(snap[0]?.state?.selected).toBe(true);
    } finally {
      await t.dispose();
    }
  });

  it("freeze() pins the snapshot until refresh()", async () => {
    const adapter = createFakeAdapter([
      {
        id: "n1",
        role: "shape",
        name: "Box",
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        state: { selected: false },
      },
    ]);

    const t = await createHarness({
      tier: "scene",
      adapter,
      seed: "freeze-1",
    });

    try {
      t.scene.freeze();
      adapter.setNodes([
        {
          id: "n1",
          role: "shape",
          name: "Box",
          bbox: { x: 0, y: 0, width: 10, height: 10 },
          state: { selected: true },
        },
      ]);

      // Pinned: still sees pre-mutation state.
      expect(t.scene.getByState((n) => n.state?.selected === false).id).toBe("n1");
      const frozen = await t.scene.snapshot();
      expect(frozen[0]?.state?.selected).toBe(false);

      await t.scene.refresh();
      expect(t.scene.getByState((n) => n.state?.selected === true).id).toBe("n1");
    } finally {
      await t.dispose();
    }
  });
});
