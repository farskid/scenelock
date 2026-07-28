import { describe, expect, it } from "vitest";
import type { SceneNode } from "@scenelock/core";
import {
  createFakeAdapter,
  isDegenerateBBox,
  resolvePointerTarget,
  SceneTargetError,
  transformBBox,
} from "../index.js";

const node: SceneNode = {
  id: "rect",
  role: "shape",
  name: "Rect",
  bbox: { x: 10, y: 20, width: 40, height: 20 },
};

describe("targeting", () => {
  it("resolves bbox center with identity transform", async () => {
    const adapter = createFakeAdapter([node]);
    await expect(resolvePointerTarget(adapter, "rect")).resolves.toEqual({
      x: 30,
      y: 30,
    });
    await expect(resolvePointerTarget(adapter, node)).resolves.toEqual({ x: 30, y: 30 });
  });

  it("applies worldToScreen camera transform", async () => {
    // pan (-100,-50), zoom 2 — applied only in targeting options (locate stays world)
    const adapter = createFakeAdapter([node], { locateInScreenSpace: false });
    const worldToScreen = (p: { x: number; y: number }) => ({
      x: (p.x - 100) * 2,
      y: (p.y - 50) * 2,
    });
    // world center (30,30) → ((30-100)*2, (30-50)*2) = (-140, -40)
    await expect(
      resolvePointerTarget(adapter, "rect", { worldToScreen }),
    ).resolves.toEqual({ x: -140, y: -40 });
  });

  it("transformBBox maps corners to screen AABB", () => {
    const screen = transformBBox(
      { x: 0, y: 0, width: 10, height: 10 },
      (p) => ({ x: p.x * 2 + 5, y: p.y * 2 + 5 }),
    );
    expect(screen).toEqual({ x: 5, y: 5, width: 20, height: 20 });
  });

  it("errors on missing / degenerate / offscreen", async () => {
    const adapter = createFakeAdapter([
      node,
      {
        id: "zero",
        role: "shape",
        name: "Z",
        bbox: { x: 0, y: 0, width: 0, height: 10 },
      },
    ]);

    await expect(resolvePointerTarget(adapter, "gone")).rejects.toBeInstanceOf(
      SceneTargetError,
    );

    expect(isDegenerateBBox({ x: 0, y: 0, width: 0, height: 10 })).toBe(true);
    await expect(resolvePointerTarget(adapter, "zero")).rejects.toThrow(/degenerate/);

    await expect(
      resolvePointerTarget(adapter, "rect", {
        viewport: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).rejects.toThrow(/offscreen/);
  });

  it("locateInScreenSpace applies adapter camera before targeting", async () => {
    const adapter = createFakeAdapter([node], {
      worldToScreen: (p) => ({ x: p.x + 100, y: p.y + 200 }),
      locateInScreenSpace: true,
    });
    // locate returns translated bbox; center (30,30) → (130,230)
    await expect(resolvePointerTarget(adapter, "rect")).resolves.toEqual({
      x: 130,
      y: 230,
    });
  });
});
