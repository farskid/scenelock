import { describe, expect, it } from "vitest";
import { createExecutor, createSeed, createVirtualClock, hashSeed } from "../index.js";

describe("@scenelock/executor", () => {
  it("creates stable seeds and a virtual clock", async () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    const seed = createSeed("replay-1");
    expect(seed.value).toBe("replay-1");
    const clock = createVirtualClock({ startMs: 1000 });
    clock.advance(16);
    expect(clock.now()).toBe(1016);

    const ex = createExecutor({ seed: "replay-1" });
    expect(ex.seed.value).toBe("replay-1");
    const result = await ex.run(async (ctx) => {
      ctx.clock.advance(1);
      return ctx.clock.now();
    });
    expect(result).toBe(1);
  });
});
