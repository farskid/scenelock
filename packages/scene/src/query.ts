import type { SceneNode, ScenePredicate, SceneQuery } from "@scenelock/core";
import { formatCandidates, SceneQueryError } from "./errors.js";
import { matchName, matchSceneNode } from "./match.js";

/** Options for role queries (a11y-primary ladder step for canvas). */
export interface GetByRoleOptions {
  /** Accessible / display name — string (exact by default) or RegExp. */
  name?: string | RegExp;
  /**
   * When `name` is a string: exact equality (default true) vs substring.
   * Ignored for RegExp names.
   */
  exact?: boolean;
}

/**
 * Rich query surface over a retained-model snapshot.
 * Extends core {@link SceneQuery} with role/id/state helpers and subtree scoping.
 *
 * Strict mode (default): `getBy*` / `findOne` throw {@link SceneQueryError} on
 * 0 or N>1 matches and never return a silent first match.
 */
export interface SceneQueryEngine extends SceneQuery {
  /** All nodes in the current scope (snapshot order). */
  readonly nodes: readonly SceneNode[];

  getByRole(role: string, options?: GetByRoleOptions): SceneNode;
  getBySceneId(id: string): SceneNode;
  /** Strict single match for a state/host predicate. */
  getByState(predicate: (node: SceneNode) => boolean): SceneNode;

  /** Filter to a new scoped engine (retained order). */
  filter(predicate: ScenePredicate): SceneQueryEngine;
  /**
   * Scope to a subtree rooted at `rootId` (includes root).
   * Uses `childIds` when present; otherwise reconstructs via `parentId`.
   */
  within(rootId: string): SceneQueryEngine;
}

function collectSubtree(
  all: readonly SceneNode[],
  rootId: string,
): SceneNode[] {
  const byId = new Map(all.map((n) => [n.id, n]));
  if (!byId.has(rootId)) {
    throw new SceneQueryError(
      `SceneQuery.within: unknown root id ${JSON.stringify(rootId)}`,
      [],
    );
  }

  const childrenByParent = new Map<string, SceneNode[]>();
  for (const n of all) {
    if (n.parentId === undefined) continue;
    const list = childrenByParent.get(n.parentId);
    if (list) list.push(n);
    else childrenByParent.set(n.parentId, [n]);
  }

  const out: SceneNode[] = [];
  const visit = (id: string): void => {
    const node = byId.get(id);
    if (!node) return;
    out.push(node);
    if (node.childIds !== undefined) {
      for (const childId of node.childIds) visit(childId);
      return;
    }
    const kids = childrenByParent.get(id);
    if (kids) {
      for (const kid of kids) visit(kid.id);
    }
  };
  visit(rootId);
  return out;
}

function roleMatches(node: SceneNode, role: string, options?: GetByRoleOptions): boolean {
  if (node.role !== role) return false;
  if (options?.name === undefined) return true;
  return matchName(node.name, options.name, options.exact ?? true);
}

function describePredicate(predicate: ScenePredicate): string {
  if (typeof predicate === "function") return predicate.name || "<predicate>";
  if ("id" in predicate) return `id=${JSON.stringify(predicate.id)}`;
  const namePart =
    predicate.name === undefined
      ? ""
      : typeof predicate.name === "string"
        ? `, name=${JSON.stringify(predicate.name)}`
        : `, name=${predicate.name.toString()}`;
  return `role=${JSON.stringify(predicate.role)}${namePart}`;
}

function throwStrict(label: string, detail: string, hits: readonly SceneNode[]): never {
  const verb = hits.length === 0 ? "no matches" : `${hits.length} matches`;
  throw new SceneQueryError(
    `${label}: expected exactly 1 match, got ${verb} for ${detail}. Candidates: ${formatCandidates(hits)}`,
    hits,
  );
}

class SceneQueryEngineImpl implements SceneQueryEngine {
  constructor(readonly nodes: readonly SceneNode[]) {}

  find(predicate: ScenePredicate): SceneNode[] {
    return this.nodes.filter((n) => matchSceneNode(n, predicate));
  }

  findOne(predicate: ScenePredicate): SceneNode {
    const hits = this.find(predicate);
    if (hits.length !== 1) {
      throwStrict("SceneQuery.findOne", describePredicate(predicate), hits);
    }
    return hits[0]!;
  }

  getByRole(role: string, options?: GetByRoleOptions): SceneNode {
    const hits = this.nodes.filter((n) => roleMatches(n, role, options));
    const nameDesc =
      options?.name === undefined
        ? ""
        : typeof options.name === "string"
          ? `, name=${JSON.stringify(options.name)}`
          : `, name=${options.name.toString()}`;
    if (hits.length !== 1) {
      throwStrict("SceneQuery.getByRole", `role=${JSON.stringify(role)}${nameDesc}`, hits);
    }
    return hits[0]!;
  }

  getBySceneId(id: string): SceneNode {
    const hits = this.nodes.filter((n) => n.id === id);
    if (hits.length !== 1) {
      throwStrict("SceneQuery.getBySceneId", `id=${JSON.stringify(id)}`, hits);
    }
    return hits[0]!;
  }

  getByState(predicate: (node: SceneNode) => boolean): SceneNode {
    const hits = this.nodes.filter(predicate);
    if (hits.length !== 1) {
      throwStrict("SceneQuery.getByState", predicate.name || "<state predicate>", hits);
    }
    return hits[0]!;
  }

  filter(predicate: ScenePredicate): SceneQueryEngine {
    return new SceneQueryEngineImpl(this.find(predicate));
  }

  within(rootId: string): SceneQueryEngine {
    return new SceneQueryEngineImpl(collectSubtree(this.nodes, rootId));
  }
}

/**
 * Build a {@link SceneQueryEngine} over a flat snapshot list.
 * Snapshot order is preserved for deterministic candidate listings.
 */
export function createSceneQuery(nodes: readonly SceneNode[]): SceneQueryEngine {
  return new SceneQueryEngineImpl(nodes);
}

/**
 * Snapshot the adapter (sync or async) and return a query engine.
 */
export async function queryAdapter(
  adapter: { snapshot(): SceneNode[] | Promise<SceneNode[]> },
): Promise<SceneQueryEngine> {
  const nodes = await Promise.resolve(adapter.snapshot());
  return createSceneQuery(nodes);
}
