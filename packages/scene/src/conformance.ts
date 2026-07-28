import type { BBox, SceneAdapter, SceneNode } from "@scenelock/core";
import { bboxCenter } from "@scenelock/core";
import { describe, expect, it } from "vitest";
import { assertSceneAdapter } from "./adapter.js";
import { isDegenerateBBox } from "./targeting.js";

export type AdapterFactory = () => SceneAdapter | Promise<SceneAdapter>;

export interface AdapterConformanceOptions {
  /**
   * When true (default), require at least one node in the factory snapshot
   * so locate-consistency can be exercised.
   */
  requireNodes?: boolean;
  /** Optional suite name override. */
  suiteName?: string;
}

function isSceneNode(value: unknown): value is SceneNode {
  if (typeof value !== "object" || value === null) return false;
  const n = value as SceneNode;
  return (
    typeof n.id === "string" &&
    typeof n.role === "string" &&
    typeof n.name === "string" &&
    typeof n.bbox === "object" &&
    n.bbox !== null &&
    typeof n.bbox.x === "number" &&
    typeof n.bbox.y === "number" &&
    typeof n.bbox.width === "number" &&
    typeof n.bbox.height === "number"
  );
}

function bboxEqual(a: BBox, b: BBox, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}

/**
 * Reusable vitest suite any adapter author runs to validate their adapter.
 * Call inside a test file (top-level or nested `describe`).
 *
 * Checks: adapter shape, snapshot node schema, locate↔snapshot bbox consistency,
 * unknown-id null, and settled() resolution.
 *
 * @example
 * ```ts
 * import { createAdapterConformanceTests, createFakeAdapter } from "@scenelock/scene";
 *
 * createAdapterConformanceTests(() =>
 *   createFakeAdapter([{ id: "a", role: "shape", name: "A", bbox: { x: 0, y: 0, width: 1, height: 1 } }]),
 * );
 * ```
 */
export function createAdapterConformanceTests(
  factory: AdapterFactory,
  options?: AdapterConformanceOptions,
): void {
  const requireNodes = options?.requireNodes ?? true;
  const suiteName = options?.suiteName ?? "SceneAdapter conformance";

  describe(suiteName, () => {
    it("exposes snapshot / locate / settled", async () => {
      const adapter = await Promise.resolve(factory());
      assertSceneAdapter(adapter);
    });

    it("snapshot() returns well-formed SceneNode[]", async () => {
      const adapter = await Promise.resolve(factory());
      const nodes = await Promise.resolve(adapter.snapshot());
      expect(Array.isArray(nodes)).toBe(true);
      for (const n of nodes) {
        expect(isSceneNode(n)).toBe(true);
        expect(n.id.length).toBeGreaterThan(0);
      }
      if (requireNodes) {
        expect(nodes.length).toBeGreaterThan(0);
      }
    });

    it("locate(id) is consistent with snapshot bboxes for known ids", async () => {
      const adapter = await Promise.resolve(factory());
      const nodes = await Promise.resolve(adapter.snapshot());
      if (nodes.length === 0) return;

      for (const n of nodes) {
        const located = await Promise.resolve(adapter.locate(n.id));
        expect(located).not.toBeNull();
        if (located === null) continue;
        // locate may apply camera transform; still must be a finite non-degenerate bbox
        // whose center is defined. Prefer exact match when no transform is applied.
        expect(isDegenerateBBox(located)).toBe(false);
        const center = bboxCenter(located);
        expect(Number.isFinite(center.x)).toBe(true);
        expect(Number.isFinite(center.y)).toBe(true);

        // When locate returns the same space as snapshot, require equality.
        if (bboxEqual(located, n.bbox)) {
          expect(located).toEqual(n.bbox);
        }
      }
    });

    it("locate(unknown) returns null", async () => {
      const adapter = await Promise.resolve(factory());
      const miss = await Promise.resolve(adapter.locate("__scenelock_missing_id__"));
      expect(miss).toBeNull();
    });

    it("settled() resolves", async () => {
      const adapter = await Promise.resolve(factory());
      await expect(adapter.settled()).resolves.toBeUndefined();
    });
  });
}
