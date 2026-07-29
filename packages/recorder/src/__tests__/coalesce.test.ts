import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { createRecorder } from "../recorder.js";
import { createFakeDomResolver } from "../dom-resolver.js";

describe("recorder event coalescing", () => {
  it("coalesces pointerdown+up into click", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 20, height: 20 } },
    ]);
    const rec = createRecorder({ adapter, tier: "scene", seed: "c1" });
    await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "canvas" });
    await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 16, surface: "canvas" });
    await rec.flush();
    expect(rec.session().actions).toEqual([
      {
        kind: "click",
        target: { kind: "scene", locator: { kind: "role", role: "rect", name: "Box" } },
        timestamp: 0,
      },
    ]);
  });

  it("coalesces two clicks into dblclick within window", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 20, height: 20 } },
    ]);
    const rec = createRecorder({ adapter, tier: "scene", dblclickWindowMs: 300 });
    await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "canvas" });
    await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 50, surface: "canvas" });
    await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 100, surface: "canvas" });
    await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 150, surface: "canvas" });
    await rec.flush();
    expect(rec.session().actions.map((a) => a.kind)).toEqual(["dblclick"]);
  });

  it("coalesces down+move+up into drag", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "A", bbox: { x: 0, y: 0, width: 10, height: 10 } },
      { id: "r2", role: "rect", name: "B", bbox: { x: 40, y: 40, width: 10, height: 10 } },
    ]);
    const rec = createRecorder({ adapter, tier: "scene", dragThresholdPx: 4 });
    await rec.feed({ type: "pointerdown", x: 5, y: 5, timestamp: 0, surface: "canvas" });
    await rec.feed({ type: "pointermove", x: 20, y: 20, timestamp: 8, surface: "canvas" });
    await rec.feed({ type: "pointerup", x: 45, y: 45, timestamp: 16, surface: "canvas" });
    await rec.flush();
    const actions = rec.session().actions;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "drag",
      from: { kind: "scene", locator: { kind: "role", role: "rect", name: "A" } },
      to: { kind: "scene", locator: { kind: "role", role: "rect", name: "B" } },
    });
  });

  it("coalesces keystrokes into type after click", async () => {
    const dom = createFakeDomResolver([
      {
        id: "i1",
        role: "textbox",
        name: "Name",
        testId: "name",
        bbox: { x: 0, y: 0, width: 100, height: 20 },
      },
    ]);
    const rec = createRecorder({ domResolver: dom, tier: "browser", seed: "t1" });
    await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "dom" });
    await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 10, surface: "dom" });
    await rec.feed({ type: "keydown", key: "h", timestamp: 20 });
    await rec.feed({ type: "keydown", key: "i", timestamp: 30 });
    await rec.flush();
    expect(rec.session().actions).toEqual([
      {
        kind: "click",
        target: {
          kind: "dom",
          locator: { kind: "role", role: "textbox", name: "Name", exact: true },
        },
        timestamp: 0,
      },
      {
        kind: "type",
        target: {
          kind: "dom",
          locator: { kind: "role", role: "textbox", name: "Name", exact: true },
        },
        text: "hi",
        timestamp: 20,
      },
    ]);
  });

  it("emits press for Enter / Escape", async () => {
    const rec = createRecorder({ tier: "scene" });
    await rec.feed({ type: "keydown", key: "Enter", timestamp: 0 });
    await rec.feed({ type: "keydown", key: "Escape", timestamp: 10 });
    await rec.flush();
    expect(rec.session().actions.map((a) => (a.kind === "press" ? a.key : a.kind))).toEqual([
      "Enter",
      "Escape",
    ]);
  });

  it("records checkpoint markers", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 20, height: 20 } },
    ]);
    const rec = createRecorder({ adapter, tier: "scene" });
    await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "canvas" });
    await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 10, surface: "canvas" });
    rec.checkpoint("after-click");
    await rec.flush();
    expect(rec.session().actions.map((a) => a.kind)).toEqual(["click", "checkpoint"]);
    expect(rec.session().actions[1]).toMatchObject({ kind: "checkpoint", name: "after-click" });
  });
});
