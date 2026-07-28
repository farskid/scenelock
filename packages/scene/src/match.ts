import type { SceneNode, ScenePredicate } from "@scenelock/core";

/**
 * Evaluate a {@link ScenePredicate} against a single node.
 * Role predicates match exact role; name is exact string or RegExp.test.
 */
export function matchSceneNode(node: SceneNode, predicate: ScenePredicate): boolean {
  if (typeof predicate === "function") return predicate(node);
  if ("id" in predicate) return node.id === predicate.id;
  if (node.role !== predicate.role) return false;
  if (predicate.name === undefined) return true;
  if (typeof predicate.name === "string") return node.name === predicate.name;
  return predicate.name.test(node.name);
}

/**
 * Match accessible name with optional exactness (Playwright-style).
 * Non-exact strings are substring matches (case-sensitive).
 */
export function matchName(
  actual: string,
  expected: string | RegExp,
  exact: boolean = true,
): boolean {
  if (typeof expected !== "string") return expected.test(actual);
  if (exact) return actual === expected;
  return actual.includes(expected);
}
