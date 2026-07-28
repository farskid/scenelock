import { describe, expect, it } from "vitest";
import {
  createDiscoveryRunner,
  createWalkGenerator,
  fail,
  snapshotStable,
  type SnapshotInvariant,
} from "../index.js";
import { createMemoryExecutor, seedA, toy5Model } from "./fixtures.js";

describe("DiscoveryRunner", () => {
  it("runs transition-cover walks and reports full coverage", async () => {
    const model = toy5Model();
    const executor = createMemoryExecutor();
    const runner = createDiscoveryRunner({ executor });
    const report = await runner.runAllSnapshots(
      model,
      { kind: "transition", minCoverage: 1 },
      [snapshotStable()],
      seedA,
    );
    expect(report.walksPlanned).toBeGreaterThan(0);
    expect(report.walksFailed).toBe(0);
    expect(report.walksPassed).toBe(report.walksPlanned);
    expect(report.transitionsHit).toBe(report.transitionsTotal);
    expect(report.transitionCoverageRatio).toBe(1);
    expect(report.statesVisited).toBe(5);
    expect(report.failedSeeds).toHaveLength(0);
  });

  it("records violation with walk prefix repro and seed", async () => {
    const model = toy5Model();
    const executor = createMemoryExecutor();
    const boom: SnapshotInvariant = {
      name: "alwaysFail",
      check: () => fail("forced"),
    };
    const runner = createDiscoveryRunner({ executor });
    const walks = createWalkGenerator().transitionCoverage(model, seedA);
    const walk = walks.find((w) => w.steps.length >= 1) ?? walks[0]!;
    const result = await runner.runWalkSnapshots(walk, model, [boom]);
    expect(result.passed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.invariantName).toBe("alwaysFail");
    expect(result.violation!.seed).toBe(walk.seed.value);
    expect(result.violation!.stepIndex).toBe(0);
    expect(result.violation!.reproSteps).toEqual([walk.steps[0]!.event]);
  });

  it("repro prefix is the exact action sequence up to the failing step", async () => {
    const model = toy5Model();
    const executor = createMemoryExecutor();
    let calls = 0;
    const afterSecondStep: SnapshotInvariant = {
      name: "afterSecond",
      check: () => {
        calls++;
        if (calls >= 2) return fail("boom-at-1");
        return { ok: true };
      },
    };
    const runner = createDiscoveryRunner({ executor });
    const walk =
      createWalkGenerator()
        .transitionCoverage(model, seedA)
        .find((w) => w.steps.length >= 2) ??
      createWalkGenerator().generate(model, { kind: "walk-count", count: 1 }, seedA)[0]!;
    expect(walk.steps.length).toBeGreaterThanOrEqual(2);
    const result = await runner.runWalkSnapshots(walk, model, [afterSecondStep]);
    expect(result.passed).toBe(false);
    expect(result.violation!.stepIndex).toBe(1);
    expect(result.violation!.reproSteps).toEqual([
      walk.steps[0]!.event,
      walk.steps[1]!.event,
    ]);
    expect(result.violation!.seed).toBe(walk.seed.value);
  });

  it("runAll failedSeeds non-empty on forced fail", async () => {
    const model = toy5Model();
    const executor = createMemoryExecutor();
    const boom: SnapshotInvariant = {
      name: "nope",
      check: () => fail("x"),
    };
    const runner = createDiscoveryRunner({ executor });
    const report = await runner.runAllSnapshots(
      model,
      { kind: "walk-count", count: 2 },
      [boom],
      seedA,
    );
    expect(report.walksFailed).toBe(report.walksPlanned);
    expect(report.failedSeeds.length).toBe(report.walksPlanned);
    expect(report.violations.length).toBe(report.walksPlanned);
  });

  it("core runAll returns DiscoveryReport with failedSeeds", async () => {
    const model = toy5Model();
    const executor = createMemoryExecutor();
    const runner = createDiscoveryRunner({ executor });
    const report = await runner.runAll(
      model,
      { kind: "walk-count", count: 1 },
      [
        {
          name: "thrower",
          check() {
            throw new Error("core-fail");
          },
        },
      ],
      seedA,
    );
    expect(report.walksFailed).toBe(1);
    expect(report.failedSeeds.length).toBe(1);
    expect(report.failedSeeds[0]).toBeTruthy();
  });
});
