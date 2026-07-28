import type {
  BBox,
  SceneAdapter,
  SceneNode,
  ScenePredicate,
  SceneQuery,
} from "@scenelock/core";

/**
 * @scenelock/scene — adapter kit over the SceneAdapter contract from @scenelock/core.
 * Library adapters (tldraw, Konva, …) live as separate packages later; this package
 * owns query helpers + adapter validation.
 */

export type { SceneAdapter, SceneNode, ScenePredicate, SceneQuery, BBox };

export function matchSceneNode(node: SceneNode, predicate: ScenePredicate): boolean {
  if (typeof predicate === "function") return predicate(node);
  if ("id" in predicate) return node.id === predicate.id;
  if (node.role !== predicate.role) return false;
  if (predicate.name === undefined) return true;
  if (typeof predicate.name === "string") return node.name === predicate.name;
  return predicate.name.test(node.name);
}

export function createSceneQuery(nodes: readonly SceneNode[]): SceneQuery {
  return {
    find(predicate) {
      return nodes.filter((n) => matchSceneNode(n, predicate));
    },
    findOne(predicate) {
      const hits = nodes.filter((n) => matchSceneNode(n, predicate));
      if (hits.length !== 1) {
        throw new Error(
          `SceneQuery.findOne: expected 1 match, got ${hits.length} for ${String(predicate)}`,
        );
      }
      return hits[0]!;
    },
  };
}

/** Runtime guard for host adapters — ensures the three required methods exist. */
export function assertSceneAdapter(value: unknown): asserts value is SceneAdapter {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SceneAdapter).snapshot !== "function" ||
    typeof (value as SceneAdapter).locate !== "function" ||
    typeof (value as SceneAdapter).settled !== "function"
  ) {
    throw new Error(
      "Invalid SceneAdapter: expected { snapshot(), locate(id), settled() }",
    );
  }
}

/**
 * Wrap a retained-model getter into a SceneAdapter.
 * `settled` defaults to a resolved promise (hosts should override).
 */
export function defineSceneAdapter(impl: SceneAdapter): SceneAdapter {
  assertSceneAdapter(impl);
  return impl;
}
