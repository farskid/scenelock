import type { SceneNode } from "@scenelock/core";

/**
 * Strict-mode query failure: zero or multiple matches.
 * Message always lists candidates so agents/humans can fix selectors without guessing.
 */
export class SceneQueryError extends Error {
  readonly code = "SCENE_QUERY" as const;
  readonly matchCount: number;
  readonly candidates: readonly SceneNode[];

  constructor(message: string, candidates: readonly SceneNode[]) {
    super(message);
    this.name = "SceneQueryError";
    this.matchCount = candidates.length;
    this.candidates = candidates;
  }
}

/** Targeting failure: missing node, degenerate bbox, or offscreen after transform. */
export class SceneTargetError extends Error {
  readonly code = "SCENE_TARGET" as const;
  readonly id: string;

  constructor(message: string, id: string) {
    super(message);
    this.name = "SceneTargetError";
    this.id = id;
  }
}

/** Settledness wait exceeded timeout; includes optional host diagnostic. */
export class SceneSettledTimeoutError extends Error {
  readonly code = "SCENE_SETTLED_TIMEOUT" as const;
  readonly timeoutMs: number;
  readonly diagnostic: string;

  constructor(timeoutMs: number, diagnostic: string) {
    super(
      `SceneAdapter.settled() did not resolve within ${timeoutMs}ms. Still mutating: ${diagnostic}`,
    );
    this.name = "SceneSettledTimeoutError";
    this.timeoutMs = timeoutMs;
    this.diagnostic = diagnostic;
  }
}

/** Format candidate nodes for deterministic error strings (stable id order). */
export function formatCandidates(nodes: readonly SceneNode[]): string {
  if (nodes.length === 0) return "(none)";
  return nodes
    .map((n) => `${n.id}[role=${n.role}, name=${JSON.stringify(n.name)}]`)
    .join(", ");
}
