import { describe, expect, it } from "vitest";
import type { SceneNode } from "@scenelock/core";
import {
  createFakeAdapter,
  createSceneQuery,
  queryAdapter,
  SceneQueryError,
} from "../index.js";

const tree: SceneNode[] = [
  {
    id: "root",
    role: "group",
    name: "Canvas",
    bbox: { x: 0, y: 0, width: 100, height: 100 },
    childIds: ["layer1", "layer2"],
  },
  {
    id: "layer1",
    role: "layer",
    name: "Foreground",
    bbox: { x: 0, y: 0, width: 100, height: 50 },
    parentId: "root",
    childIds: ["a", "b"],
    state: { locked: false },
  },
  {
    id: "layer2",
    role: "layer",
    name: "Background",
    bbox: { x: 0, y: 50, width: 100, height: 50 },
    parentId: "root",
    childIds: ["c"],
    state: { locked: true },
  },
  {
    id: "a",
    role: "shape",
    name: "Rect A",
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    parentId: "layer1",
    state: { selected: true },
  },
  {
    id: "b",
    role: "shape",
    name: "Rect B",
    bbox: { x: 20, y: 0, width: 10, height: 10 },
    parentId: "layer1",
    state: { selected: false },
  },
  {
    id: "c",
    role: "shape",
    name: "Circle",
    bbox: { x: 0, y: 50, width: 10, height: 10 },
    parentId: "layer2",
    state: { selected: false },
  },
];

describe("SceneQuery engine", () => {
  it("getByRole with name (string + regex)", () => {
    const q = createSceneQuery(tree);
    expect(q.getByRole("shape", { name: "Circle" }).id).toBe("c");
    expect(q.getByRole("shape", { name: /^Circle$/ }).id).toBe("c");
    expect(() => q.getByRole("shape", { name: /^Rect/ })).toThrow(SceneQueryError);
    expect(q.getByRole("shape", { name: "Cir", exact: false }).id).toBe("c");
  });

  it("getBySceneId", () => {
    const q = createSceneQuery(tree);
    expect(q.getBySceneId("b").name).toBe("Rect B");
    expect(() => q.getBySceneId("missing")).toThrow(/no matches/);
  });

  it("getByState predicate", () => {
    const q = createSceneQuery(tree);
    expect(q.getByState((n) => n.state?.["selected"] === true).id).toBe("a");
    expect(() => q.getByState((n) => n.state?.["selected"] === false)).toThrow(
      SceneQueryError,
    );
  });

  it("strict mode lists candidates on multi-match (never first-match)", () => {
    const q = createSceneQuery(tree);
    expect(() => q.getByRole("shape")).toThrow(SceneQueryError);
    try {
      q.getByRole("shape");
    } catch (e) {
      expect(e).toBeInstanceOf(SceneQueryError);
      const err = e as SceneQueryError;
      expect(err.matchCount).toBe(3);
      expect(err.message).toContain("a[role=shape");
      expect(err.message).toContain("b[role=shape");
      expect(err.message).toContain("c[role=shape");
      expect(err.candidates.map((n) => n.id)).toEqual(["a", "b", "c"]);
    }
  });

  it("find / findOne / filter / within", () => {
    const q = createSceneQuery(tree);
    expect(q.find({ role: "layer" })).toHaveLength(2);
    expect(q.findOne({ id: "root" }).role).toBe("group");

    const shapes = q.filter({ role: "shape" });
    expect(shapes.nodes).toHaveLength(3);
    expect(shapes.getByRole("shape", { name: "Circle" }).id).toBe("c");

    const fg = q.within("layer1");
    expect(fg.nodes.map((n) => n.id)).toEqual(["layer1", "a", "b"]);
    expect(fg.getByRole("shape", { name: "Rect B" }).id).toBe("b");
    expect(() => fg.getBySceneId("c")).toThrow(SceneQueryError);
  });

  it("within reconstructs via parentId when childIds absent", () => {
    const flat: SceneNode[] = [
      { id: "p", role: "group", name: "P", bbox: { x: 0, y: 0, width: 1, height: 1 } },
      {
        id: "k",
        role: "shape",
        name: "K",
        bbox: { x: 0, y: 0, width: 1, height: 1 },
        parentId: "p",
      },
    ];
    expect(createSceneQuery(flat).within("p").nodes.map((n) => n.id)).toEqual(["p", "k"]);
  });

  it("queryAdapter snapshots async adapters", async () => {
    const adapter = createFakeAdapter(tree);
    const q = await queryAdapter(adapter);
    expect(q.getBySceneId("a").role).toBe("shape");
  });
});
