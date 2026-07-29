import { describe, expect, it } from "vitest";
import { FakePageDriver } from "@scenelock/browser";
import { createFakeAdapter } from "@scenelock/scene";
import { createRecorder } from "../recorder.js";
import {
  createPageDriverEventSource,
  pushPageRecorderEvent,
} from "../browser-source.js";
import { attachRecorderSource, createFakeEventSource } from "../event-source.js";

describe("browser event source", () => {
  it("FakeEventSource feeds the recorder", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 20, height: 20 } },
    ]);
    const rec = createRecorder({ adapter, tier: "scene" });
    const source = createFakeEventSource();
    const stop = await attachRecorderSource(rec, source);
    await source.emit({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "canvas" });
    await source.emit({ type: "pointerup", x: 10, y: 10, timestamp: 10, surface: "canvas" });
    await stop();
    expect(rec.session().actions[0]?.kind).toBe("click");
  });

  it("PageDriverEventSource installs binding and accepts pushPageRecorderEvent", async () => {
    const driver = new FakePageDriver();
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 20, height: 20 } },
    ]);
    const rec = createRecorder({ adapter, tier: "scene" });
    const source = createPageDriverEventSource(driver);
    const stop = await attachRecorderSource(rec, source);

    pushPageRecorderEvent({
      type: "pointerdown",
      x: 10,
      y: 10,
      timestamp: 0,
      surface: "canvas",
    });
    pushPageRecorderEvent({
      type: "pointerup",
      x: 10,
      y: 10,
      timestamp: 10,
      surface: "canvas",
    });

    await stop();
    expect(rec.session().actions.map((a) => a.kind)).toEqual(["click"]);
    await driver.close();
  });
});
