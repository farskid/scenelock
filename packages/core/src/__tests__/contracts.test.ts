import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCATOR_PRIORITY,
  FAILURE_ENVELOPE_JSON_SCHEMA,
  bboxCenter,
  bboxContains,
  type FailureEnvelope,
  type SceneAdapter,
  type SceneNode,
} from "../index.js";

describe("@scenelock/core contracts", () => {
  it("exposes a11y-primary locator priority ending in testId", () => {
    expect(DEFAULT_LOCATOR_PRIORITY[0]).toBe("role");
    expect(DEFAULT_LOCATOR_PRIORITY.at(-1)).toBe("testId");
  });

  it("defines a failure envelope schema with seed + tier including golden", () => {
    expect(FAILURE_ENVELOPE_JSON_SCHEMA.required).toContain("seed");
    expect(FAILURE_ENVELOPE_JSON_SCHEMA.required).toContain("tier");
    expect(FAILURE_ENVELOPE_JSON_SCHEMA.properties.tier.enum).toContain("golden");
    const sample: FailureEnvelope = {
      testId: "demo::settled",
      file: "demo.test.ts",
      title: "settled",
      status: "failed",
      durationMs: 12,
      retryIndex: 0,
      error: { message: "boom" },
      seed: "abc123",
      tier: "engine",
      artifacts: { actualGolden: "/tmp/a.golden", expectedGolden: "/tmp/e.golden" },
      reportedAt: new Date(0).toISOString(),
    };
    expect(sample.seed).toBe("abc123");
    expect(sample.artifacts.actualGolden).toBeDefined();
  });

  it("scene adapter surface is snapshot / locate / settled", () => {
    const nodes: SceneNode[] = [
      {
        id: "rect-1",
        role: "shape",
        name: "Rectangle",
        bbox: { x: 0, y: 0, width: 100, height: 50 },
      },
    ];
    const adapter: SceneAdapter = {
      snapshot: () => nodes,
      locate: (id) => nodes.find((n) => n.id === id)?.bbox ?? null,
      settled: async () => {},
    };
    expect(adapter.snapshot()).toHaveLength(1);
    expect(adapter.locate("rect-1")).toEqual(nodes[0]?.bbox);
    expect(bboxCenter(nodes[0]!.bbox)).toEqual({ x: 50, y: 25 });
    expect(bboxContains(nodes[0]!.bbox, 10, 10)).toBe(true);
  });
});
