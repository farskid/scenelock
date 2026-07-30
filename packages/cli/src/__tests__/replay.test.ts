import { describe, expect, it } from "vitest";
import { assembleReplayCommand } from "../replay.js";
import { buildChildEnv, SCENELOCK_SEED_ENV, UPDATE_GOLDENS_ENV } from "../env.js";
import { formatReproduction } from "../run.js";

describe("replay command assembly", () => {
  it("builds reproduction command with seed + globs + tier", () => {
    expect(
      assembleReplayCommand({
        seed: "replay-42",
        globs: ["examples/toy-canvas-app"],
        tier: "scene",
      }),
    ).toBe(
      "scenelock replay --seed replay-42 --tier scene examples/toy-canvas-app",
    );
  });

  it("formatReproduction matches assembleReplayCommand", () => {
    expect(
      formatReproduction({
        seed: "s",
        globs: ["a.test.ts"],
      }),
    ).toBe("scenelock replay --seed s a.test.ts");
  });

  it("buildChildEnv sets SCENELOCK_SEED and UPDATE_GOLDENS", () => {
    const env = buildChildEnv({
      seed: "pinned",
      updateGoldens: true,
      base: {},
    });
    expect(env[SCENELOCK_SEED_ENV]).toBe("pinned");
    expect(env[UPDATE_GOLDENS_ENV]).toBe("1");
  });
});
