import { describe, expect, it } from "vitest";
import {
  createAdapterConformanceTests,
  createFakeAdapter,
  defineRasterSurface,
  defineSceneAdapter,
  renderRasterSurface,
} from "../index.js";

const sample = [
  {
    id: "n1",
    role: "shape",
    name: "One",
    bbox: { x: 1, y: 2, width: 3, height: 4 },
    state: { selected: false },
  },
];

createAdapterConformanceTests(() => createFakeAdapter(sample), {
  suiteName: "FakeSceneAdapter conformance",
});

describe("adapter helpers", () => {
  it("defineSceneAdapter rejects incomplete objects", () => {
    expect(() =>
      defineSceneAdapter({
        snapshot: () => [],
        locate: () => null,
        settled: async () => {},
      } as never),
    ).toThrow(/Invalid SceneAdapter/);
  });

  it("defineSceneAdapter rejects missing contractVersion", () => {
    expect(() =>
      defineSceneAdapter({
        snapshot: () => [],
        locate: () => null,
        settled: async () => {},
      } as never),
    ).toThrow(/contractVersion/);
  });

  it("renderRasterSurface normalizes sync frames", async () => {
    const surface = defineRasterSurface(() => ({
      width: 2,
      height: 2,
      pixels: new Uint8ClampedArray(16),
    }));
    const frame = await renderRasterSurface(surface);
    expect(frame.width).toBe(2);
    expect(frame.pixels.length).toBe(16);

    const fake = createFakeAdapter(sample);
    const cleared = await renderRasterSurface(fake.asRasterSurface(4, 4));
    expect(cleared.pixels.length).toBe(64);
  });

  it("fake setNodes + markDirty mutate model", async () => {
    const adapter = createFakeAdapter(sample);
    adapter.setNodes([
      {
        id: "n2",
        role: "textbox",
        name: "Hi",
        bbox: { x: 0, y: 0, width: 8, height: 8 },
      },
    ]);
    expect((await Promise.resolve(adapter.snapshot()))[0]?.id).toBe("n2");
    adapter.markDirty(2, "resync");
    expect(adapter.model.pendingMutations).toBe(2);
    adapter.step();
    adapter.step();
    expect(adapter.model.pendingMutations).toBe(0);
    await expect(adapter.settled()).resolves.toBeUndefined();
  });
});
