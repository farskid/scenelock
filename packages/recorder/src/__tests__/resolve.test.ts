import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { createFakeDomResolver } from "../dom-resolver.js";
import {
  hitTestScene,
  resolveDomTarget,
  resolvePointTarget,
  resolveSceneLocator,
} from "../resolve.js";
import type { RecorderSceneAdapter } from "../types.js";

describe("locator ladder resolution", () => {
  it("prefers unique role+name over testId", async () => {
    const dom = createFakeDomResolver([
      {
        id: "b1",
        role: "button",
        name: "Save",
        testId: "save-btn",
        bbox: { x: 0, y: 0, width: 40, height: 20 },
      },
    ]);
    const info = await Promise.resolve(dom.atPoint(5, 5));
    expect(info).not.toBeNull();
    const target = await resolveDomTarget(dom, info!);
    expect(target).toEqual({
      kind: "dom",
      locator: { kind: "role", role: "button", name: "Save", exact: true },
    });
  });

  it("falls back to testId when role+name is ambiguous", async () => {
    const dom = createFakeDomResolver([
      {
        id: "b1",
        role: "button",
        name: "Save",
        testId: "save-a",
        bbox: { x: 0, y: 0, width: 40, height: 20 },
      },
      {
        id: "b2",
        role: "button",
        name: "Save",
        testId: "save-b",
        bbox: { x: 100, y: 0, width: 40, height: 20 },
      },
    ]);
    const info = await Promise.resolve(dom.atPoint(5, 5));
    expect(info).not.toBeNull();
    const target = await resolveDomTarget(dom, info!);
    expect(target).toEqual({
      kind: "dom",
      locator: { kind: "testId", testId: "save-a" },
    });
  });

  it("falls back to label when role is ambiguous and label unique", async () => {
    const dom = createFakeDomResolver([
      {
        id: "i1",
        role: "textbox",
        name: "Field",
        label: "Email",
        bbox: { x: 0, y: 0, width: 40, height: 20 },
      },
      {
        id: "i2",
        role: "textbox",
        name: "Field",
        label: "Phone",
        bbox: { x: 100, y: 0, width: 40, height: 20 },
      },
    ]);
    const info = await Promise.resolve(dom.atPoint(5, 5));
    expect(info).not.toBeNull();
    const target = await resolveDomTarget(dom, info!);
    expect(target).toEqual({
      kind: "dom",
      locator: { kind: "label", label: "Email", exact: true },
    });
  });

  it("hit-tests scene via bbox containment (no native hitTest)", async () => {
    const adapter = createFakeAdapter([
      { id: "back", role: "rect", name: "Back", bbox: { x: 0, y: 0, width: 100, height: 100 } },
      { id: "front", role: "rect", name: "Front", bbox: { x: 10, y: 10, width: 20, height: 20 } },
    ]);
    const hit = await hitTestScene(adapter, { x: 15, y: 15 });
    expect(hit?.id).toBe("front");
  });

  it("delegates to adapter.hitTest when present", async () => {
    const base = createFakeAdapter([
      { id: "a", role: "rect", name: "A", bbox: { x: 0, y: 0, width: 50, height: 50 } },
      { id: "b", role: "rect", name: "B", bbox: { x: 0, y: 0, width: 50, height: 50 } },
    ]);
    const adapter: RecorderSceneAdapter = {
      ...base,
      contractVersion: "1",
      hitTest: () => "b",
    };
    const hit = await hitTestScene(adapter, { x: 10, y: 10 });
    expect(hit?.id).toBe("b");
  });

  it("emits sceneId when role+name is not unique", async () => {
    const adapter = createFakeAdapter([
      { id: "a1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 10, height: 10 } },
      { id: "a2", role: "rect", name: "Box", bbox: { x: 20, y: 0, width: 10, height: 10 } },
    ]);
    const node = (await adapter.snapshot())[0]!;
    const loc = await resolveSceneLocator(adapter, node);
    expect(loc).toEqual({ kind: "sceneId", id: "a1" });
  });

  it("flags raw-point fallback when no scene node matched", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
    const target = await resolvePointTarget(
      { x: 99, y: 99 },
      { adapter, surface: "canvas" },
    );
    expect(target).toEqual({
      kind: "point",
      x: 99,
      y: 99,
      reason: "no-scene-match",
      flagged: true,
    });
  });

  it("prefers DOM over scene in auto surface when both exist", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 100, height: 100 } },
    ]);
    const dom = createFakeDomResolver([
      {
        id: "b1",
        role: "button",
        name: "Go",
        bbox: { x: 0, y: 0, width: 40, height: 20 },
      },
    ]);
    const target = await resolvePointTarget(
      { x: 5, y: 5 },
      { adapter, domResolver: dom, surface: "auto" },
    );
    expect(target.kind).toBe("dom");
  });
});
