import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPkg = join(here, "../../");
const repoRoot = join(cliPkg, "../..");
const cliBin = join(cliPkg, "dist/bin.js");

describe("scenelock run integration", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], {
      cwd: cliPkg,
      stdio: "pipe",
      encoding: "utf8",
    });
    expect(existsSync(cliBin)).toBe(true);
  }, 120_000);

  it("spawns CLI against toy scene-tier harness test and emits JSON summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "scenelock-run-"));
    const jsonFile = join(dir, "summary.json");

    const result = spawnSync(
      process.execPath,
      [
        cliBin,
        "run",
        "--tier",
        "scene",
        "examples/toy-canvas-app/src/__tests__/harness.test.ts",
        "--reporter",
        "json",
        "--json-file",
        jsonFile,
        "--seed",
        "cli-integration-seed",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env },
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const summary = JSON.parse(readFileSync(jsonFile, "utf8")) as {
      ok: boolean;
      numTotalTests: number;
      numFailedTests: number;
      numPassedTests: number;
      seed: string;
      failures: unknown[];
    };

    expect(summary.ok).toBe(true);
    expect(summary.seed).toBe("cli-integration-seed");
    expect(summary.numTotalTests).toBeGreaterThan(0);
    expect(summary.numFailedTests).toBe(0);
    expect(summary.numPassedTests).toBeGreaterThan(0);
    expect(Array.isArray(summary.failures)).toBe(true);
    expect(summary.failures).toHaveLength(0);

    // stdout should also carry the JSON summary when --reporter json
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain("cli-integration-seed");
  }, 180_000);
});
