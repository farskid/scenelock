import { describe, expect, it } from "vitest";
import {
  RASTERIZER_ASSUMPTIONS,
  createGoldenCompare,
  createMemoryGoldenStore,
  framesEqual,
} from "../index.js";

describe("@scenelock/golden", () => {
  it("compares RGBA frames bit-exactly", async () => {
    expect(RASTERIZER_ASSUMPTIONS.tolerance).toBe("none");
    const frame = {
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 255]),
    };
    expect(framesEqual(frame, frame).verdict).toBe("match");

    const store = createMemoryGoldenStore({ a: frame });
    const cmp = createGoldenCompare(store);
    const ok = await cmp.compare("a", frame);
    expect(ok.verdict).toBe("match");

    const bad = await cmp.compare("a", {
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([9, 2, 3, 255]),
    });
    expect(bad.verdict).toBe("mismatch");
  });
});
