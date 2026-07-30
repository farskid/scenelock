import { describe, expect, it } from "vitest";
import type { SceneNode } from "@scenelock/core";
import {
  createSceneQuery,
  defineSceneAdapter,
  matchSceneNode,
} from "../index.js";

const nodes: SceneNode[] = [
  { id: "a", role: "shape", name: "Rect", bbox: { x: 0, y: 0, width: 10, height: 10 } },
  { id: "b", role: "shape", name: "Circle", bbox: { x: 20, y: 0, width: 10, height: 10 } },
];

describe("@scenelock/scene smoke", () => {
  it("queries retained-model snapshots by role/name", () => {
    const q = createSceneQuery(nodes);
    expect(q.find({ role: "shape" })).toHaveLength(2);
    expect(q.findOne({ role: "shape", name: "Circle" }).id).toBe("b");
    expect(matchSceneNode(nodes[0]!, { id: "a" })).toBe(true);

    const adapter = defineSceneAdapter({
      contractVersion: "scene-smoke-v1",
      snapshot: () => nodes,
      locate: (id) => nodes.find((n) => n.id === id)?.bbox ?? null,
      settled: async () => {},
    });
    expect(adapter.locate("a")).toEqual(nodes[0]!.bbox);
  });
});
