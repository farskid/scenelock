import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_RATIO, ParseError, parseArgs } from "../parse-args.js";

describe("parseArgs", () => {
  it("parses run with tier, seed, budget, reporters", () => {
    const args = parseArgs([
      "run",
      "examples/**/*.test.ts",
      "--tier",
      "scene",
      "--seed",
      "abc",
      "--update-goldens",
      "--budget",
      "browser+smoke=0.25",
      "--reporter",
      "json",
      "--json-file",
      "out.json",
    ]);
    expect(args).toEqual({
      command: "run",
      globs: ["examples/**/*.test.ts"],
      tier: "scene",
      seed: "abc",
      updateGoldens: true,
      budget: { maxBrowserSmokeRatio: 0.25 },
      reporter: "json",
      jsonFile: "out.json",
    });
  });

  it("requires --seed for replay", () => {
    expect(() => parseArgs(["replay", "foo.test.ts"])).toThrow(ParseError);
    const args = parseArgs(["replay", "--seed", "s1", "foo.test.ts"]);
    expect(args.command).toBe("replay");
    if (args.command === "replay") {
      expect(args.seed).toBe("s1");
      expect(args.globs).toEqual(["foo.test.ts"]);
    }
  });

  it("parses budget with default ratio", () => {
    const args = parseArgs(["budget", "--report", "report.json"]);
    expect(args).toEqual({
      command: "budget",
      reportPath: "report.json",
      budget: { maxBrowserSmokeRatio: DEFAULT_BUDGET_RATIO },
    });
  });

  it("parses record with optional --log", () => {
    const args = parseArgs([
      "record",
      "--out",
      "flow.test.ts",
      "--session",
      "s.json",
      "--log",
      "s.log.json",
    ]);
    expect(args).toEqual({
      command: "record",
      out: "flow.test.ts",
      session: "s.json",
      log: "s.log.json",
    });
  });

  it("rejects unknown flags and commands", () => {
    expect(() => parseArgs(["explode"])).toThrow(/Unknown command/);
    expect(() => parseArgs(["run", "--nope"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["run", "--tier", "heavy"])).toThrow(/Invalid --tier/);
  });
});
