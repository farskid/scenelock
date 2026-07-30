import { describe, expect, it } from "vitest";
import {
  createExecutor,
  createSeedManager,
  deriveSeed,
  exploreSeeds,
  runWithSeed,
} from "../index.js";

describe("exploreSeeds", () => {
  it("runs N derived seeds and all pass", async () => {
    const seen: string[] = [];
    const result = await exploreSeeds({
      base: "explore-pass",
      count: 5,
      run(seed) {
        seen.push(seed.value);
      },
    });
    expect(result.passed).toBe(5);
    expect(result.failed).toHaveLength(0);
    expect(seen).toHaveLength(5);

    const parent = createSeedManager().create("explore-pass");
    const expected = Array.from({ length: 5 }, (_, i) =>
      deriveSeed(parent, `fuzz-${i}`).value,
    );
    expect(seen).toEqual(expected);
  });

  it("captures injected failure at a known derived seed", async () => {
    const parent = createSeedManager().create("explore-fail");
    const target = deriveSeed(parent, "fuzz-2");

    const result = await exploreSeeds({
      base: "explore-fail",
      count: 4,
      async run(seed) {
        if (seed.value === target.value) {
          throw new Error("injected fuzz failure");
        }
      },
    });

    expect(result.passed).toBe(3);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.seed.value).toBe(target.value);
    expect(result.failed[0]!.envelope.seed).toBe(target.value);
    expect(result.failed[0]!.envelope.error.message).toContain("injected fuzz failure");
  });

  it("rerun of failed seed reproduces the failure", async () => {
    const parent = createSeedManager().create("explore-replay");
    const target = deriveSeed(parent, "fuzz-1");
    const boom = (seedValue: string) => {
      if (seedValue === target.value) {
        throw new Error(`boom@${seedValue}`);
      }
    };

    const explored = await exploreSeeds({
      base: "explore-replay",
      count: 3,
      run(seed) {
        boom(seed.value);
      },
    });
    expect(explored.failed).toHaveLength(1);
    const failedSeed = explored.failed[0]!.seed;

    await expect(
      runWithSeed(failedSeed, async (ctx) => {
        boom(ctx.seed.value);
      }),
    ).rejects.toThrow(/boom@/);

    const exe = createExecutor({ seed: failedSeed.value });
    await expect(
      exe.run(async (ctx) => {
        boom(ctx.seed.value);
      }),
    ).rejects.toMatchObject({
      envelope: { seed: failedSeed.value },
    });
  });
});
