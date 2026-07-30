import { describe, expect, it } from "vitest";
import { computeIncludeGlobs } from "../globs.js";
import { resolveRunFiles } from "../run.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../");

describe("computeIncludeGlobs", () => {
  it("defaults to scene tier include (excludes heavy suffixes)", () => {
    expect(computeIncludeGlobs({})).toEqual([
      "**/*.test.ts",
      "!**/*.browser.test.ts",
      "!**/*.golden.test.ts",
      "!**/*.smoke.test.ts",
    ]);
  });

  it("uses browser convention for --tier browser", () => {
    expect(computeIncludeGlobs({ tier: "browser" })).toEqual([
      "**/*.browser.test.ts",
    ]);
  });

  it("prefers user globs when no tier", () => {
    expect(computeIncludeGlobs({ globs: ["a.test.ts"] })).toEqual(["a.test.ts"]);
  });
});

describe("resolveRunFiles", () => {
  it("selects toy scene-tier harness test via filter", () => {
    const files = resolveRunFiles({
      cwd: repoRoot,
      tier: "scene",
      globs: ["examples/toy-canvas-app/src/__tests__/harness.test.ts"],
    });
    expect(files.some((f) => f.endsWith("harness.test.ts"))).toBe(true);
    expect(files.every((f) => !f.includes(".golden.test."))).toBe(true);
  });

  it("excludes golden files when tier is scene under toy app", () => {
    const files = resolveRunFiles({
      cwd: repoRoot,
      tier: "scene",
      globs: ["examples/toy-canvas-app"],
    });
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => !f.includes(".golden.test."))).toBe(true);
    expect(files.every((f) => !f.includes(".browser.test."))).toBe(true);
  });
});
