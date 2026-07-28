import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bboxCenter } from "@scenelock/core";
import {
  ExecutorFailure,
  createExecutor,
  runWithSeed,
} from "@scenelock/executor";
import {
  SceneQueryError,
  awaitSettled,
  createSceneQuery,
  queryAdapter,
  resolvePointerTarget,
} from "@scenelock/scene";
import {
  DirectoryGoldenStore,
  toFailureEnvelope,
} from "@scenelock/golden";
import {
  createDiscoveryRunner,
  createWalkGenerator,
} from "@scenelock/discovery";
import {
  TOY_RASTER_FINGERPRINT,
  ToyCanvasApp,
  createToySceneAdapter,
  createToyStepLoop,
  createToyWalkExecutor,
  toyEditorStateModel,
  toyUndoRedoIdentity,
} from "../index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, "../../goldens");

describe("integration: flow (scene + executor)", () => {
  it("queries getByRole(rect), locates, applies ops, awaitSettled with stepping", async () => {
    const app = new ToyCanvasApp();
    const rect = app.add("rect", {
      name: "Box",
      x: 10,
      y: 10,
      width: 16,
      height: 16,
      fill: [240, 80, 80, 255],
    });
    app.add("ellipse", {
      name: "Oval",
      x: 32,
      y: 32,
      width: 20,
      height: 14,
      fill: [80, 120, 240, 255],
    });

    const adapter = createToySceneAdapter(app);
    const q = createSceneQuery(await adapter.snapshot());
    const found = q.getByRole("rect", { name: "Box" });
    expect(found.id).toBe(rect.id);

    const target = await resolvePointerTarget(adapter, found.id);
    expect(target).toEqual(bboxCenter({ x: 10, y: 10, width: 16, height: 16 }));

    const stepLoop = createToyStepLoop(app);
    const ex = createExecutor({ seed: "flow-1", stepLoop });

    await ex.run(async (ctx) => {
      app.select(found.id);
      app.tweenTo(found.id, 20, 20, 48);
      expect(app.isSettled()).toBe(false);

      await awaitSettled(adapter, {
        timeoutMs: 2000,
        step: async (dt) => {
          await ctx.stepLoop!.step(dt);
        },
        stepDeltaMs: 16,
      });

      expect(app.isSettled()).toBe(true);
      expect(app.bboxOf(found.id)).toEqual({ x: 20, y: 20, width: 16, height: 16 });
    });
  });

  it("strict-mode query throws SceneQueryError on ambiguous role", async () => {
    const app = new ToyCanvasApp();
    app.add("rect", { name: "A", x: 0, y: 0, width: 4, height: 4 });
    app.add("rect", { name: "B", x: 8, y: 8, width: 4, height: 4 });
    const adapter = createToySceneAdapter(app);
    const q = await queryAdapter(adapter);
    expect(() => q.getByRole("rect")).toThrow(SceneQueryError);
  });
});

describe("integration: golden", () => {
  it("matches committed golden via DirectoryGoldenStore (toy-raster-v1)", async () => {
    const app = new ToyCanvasApp();
    app.add("rect", {
      id: "r1",
      name: "Box",
      x: 8,
      y: 8,
      width: 20,
      height: 16,
      fill: [220, 60, 60, 255],
    });
    app.add("ellipse", {
      id: "e1",
      name: "Oval",
      x: 28,
      y: 24,
      width: 24,
      height: 24,
      fill: [60, 120, 220, 255],
    });

    const store = new DirectoryGoldenStore({
      directory: GOLDEN_DIR,
      rasterizerFingerprint: TOY_RASTER_FINGERPRINT,
    });
    const result = await store.compare("toy-scene", app.render());
    expect(result.verdict).toBe("match");
    expect(result.runFingerprint).toBe(TOY_RASTER_FINGERPRINT);
  });

  it("deliberate mismatch exposes pixel-level GoldenDiff report shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scenelock-toy-golden-"));
    const store = new DirectoryGoldenStore({
      directory: dir,
      rasterizerFingerprint: TOY_RASTER_FINGERPRINT,
    });

    const app = new ToyCanvasApp();
    app.add("rect", {
      id: "r1",
      name: "Box",
      x: 8,
      y: 8,
      width: 20,
      height: 16,
      fill: [220, 60, 60, 255],
    });
    await store.compare("scene", app.render(), { update: true });

    // Deliberate drift: move one pixel
    app.move("r1", 9, 8);
    const result = await store.compare("scene", app.render());
    expect(result.verdict).toBe("mismatch");
    expect(result.diff.verdict).toBe("mismatch");
    expect(result.diff.differingPixelCount).toBeGreaterThan(0);
    expect(result.diff.boundingBox).toBeTruthy();
    expect(result.diff.samples?.length).toBeGreaterThan(0);
    expect(result.diff.samples![0]).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      actual: expect.any(Array),
      expected: expect.any(Array),
    });
    expect(result.diff.firstDiffByte).toBeGreaterThanOrEqual(0);

    const envelope = toFailureEnvelope(result, {
      testId: "toy::mismatch",
      file: "integration.test.ts",
      title: "mismatch",
      seed: "g1",
    });
    expect(envelope.tier).toBe("golden");
    expect(envelope.artifacts.actualGolden).toBeDefined();
    expect(envelope.artifacts.expectedGolden).toBeDefined();
  });
});

describe("integration: discovery", () => {
  it("transitionCoverage walks via WalkExecutor; undoRedoIdentity; seed-stable", async () => {
    const model = toyEditorStateModel();
    const seed = { value: "discover-fixed", numeric: 0x51ced01 };
    const gen = createWalkGenerator();

    const walksA = gen.generate(model, { kind: "transition", minCoverage: 1 }, seed);
    const walksB = gen.generate(model, { kind: "transition", minCoverage: 1 }, seed);
    expect(walksA.map((w) => w.steps.map((s) => s.event.type))).toEqual(
      walksB.map((w) => w.steps.map((s) => s.event.type)),
    );
    expect(walksA.length).toBeGreaterThan(0);

    const app = new ToyCanvasApp();
    const runner = createDiscoveryRunner({
      executor: createToyWalkExecutor(app),
    });

    const report = await runner.runAllSnapshots(
      model,
      { kind: "transition", minCoverage: 1 },
      [toyUndoRedoIdentity()],
      seed,
    );

    expect(report.walksFailed).toBe(0);
    expect(report.walksPassed).toBe(report.walksPlanned);
    expect(report.transitionCoverageRatio).toBeGreaterThan(0);
    expect(report.failedSeeds).toEqual([]);
  });
});

describe("integration: seed replay", () => {
  it("FailureEnvelope seed reproduces via runWithSeed", async () => {
    const envelopes: string[] = [];
    let capturedSeed = "";

    try {
      await runWithSeed(
        "replay-me-42",
        async (ctx) => {
          const a = ctx.random.next();
          const b = ctx.random.next();
          // Force failure after consuming RNG
          throw new Error(`forced fail a=${a} b=${b}`);
        },
        {
          tier: "engine",
          onFailureEnvelope: (env) => {
            envelopes.push(env.seed);
            capturedSeed = env.seed;
          },
        },
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExecutorFailure);
      const failure = err as ExecutorFailure;
      expect(failure.envelope.seed).toBe("replay-me-42");
      expect(capturedSeed).toBe("replay-me-42");
    }

    const seq: number[] = [];
    await runWithSeed(capturedSeed, async (ctx) => {
      seq.push(ctx.random.next(), ctx.random.next());
    });

    // Same seed → same first two draws that preceded the forced failure
    const again: number[] = [];
    await runWithSeed("replay-me-42", async (ctx) => {
      again.push(ctx.random.next(), ctx.random.next());
    });
    expect(seq).toEqual(again);

    // Also via DeterministicExecutor.runWithSeed
    const ex = createExecutor({ seed: "other" });
    const viaMethod: number[] = [];
    await ex.runWithSeed("replay-me-42", async (ctx) => {
      viaMethod.push(ctx.random.next(), ctx.random.next());
    });
    expect(viaMethod).toEqual(again);
  });
});
