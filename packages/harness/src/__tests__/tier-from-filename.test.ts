import { describe, expect, it } from "vitest";
import {
  describeTierFilenameConvention,
  tierFromFilename,
  tierIncludeGlobs,
  TIER_FILENAME_CONVENTION,
} from "../index.js";

describe("tierFromFilename", () => {
  it("defaults unmarked *.test.ts to scene", () => {
    expect(tierFromFilename("foo.test.ts")).toBe("scene");
    expect(tierFromFilename("packages/app/src/flow.test.ts")).toBe("scene");
  });

  it("maps browser / golden / smoke suffixes", () => {
    expect(tierFromFilename("login.browser.test.ts")).toBe("browser");
    expect(tierFromFilename("visual.golden.test.ts")).toBe("golden");
    expect(tierFromFilename("health.smoke.test.ts")).toBe("smoke");
    expect(tierFromFilename("a/b/c.browser.test.tsx")).toBe("browser");
  });

  it("documents vitest include helpers", () => {
    expect(TIER_FILENAME_CONVENTION.browser).toContain(".browser.test.ts");
    expect(tierIncludeGlobs("scene")).toContain("!**/*.browser.test.ts");
    expect(describeTierFilenameConvention()).toContain("scene");
  });
});
