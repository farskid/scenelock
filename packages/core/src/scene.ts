import type { BBox } from "./bbox.js";

/**
 * Scene contract (thesis leg 2).
 * Apps expose their retained model via a thin adapter.
 * One DSL spans DOM chrome + canvas surface.
 */

/** Stable id within the host retained model. */
export type SceneNodeId = string;

/** Stable scene node identity + a11y-shaped metadata for agent/AX-cheap traces. */
export interface SceneNode {
  /** Stable id within the host retained model. */
  id: SceneNodeId;
  /** ARIA-like role (e.g. "shape", "layer", "handle", "textbox"). */
  role: string;
  /** Accessible / display name. */
  name: string;
  bbox: BBox;
  /**
   * Host-defined interaction state (selected, locked, opacity, …).
   * Keep engine/host extras on {@link SceneNode.meta}, not here.
   */
  state?: Readonly<Record<string, unknown>>;
  /**
   * Optional host/engine extras (composition id, layer flags, …).
   * Not interaction state — use {@link SceneNode.state} for selected/locked/etc.
   */
  meta?: Readonly<Record<string, unknown>>;
  /** Optional parent id for tree structure. */
  parentId?: SceneNodeId;
  /** Optional children ids (retained order). */
  childIds?: readonly SceneNodeId[];
}

/**
 * Host-provided adapter. Library adapters (tldraw, Konva, …) implement this once;
 * apps wire it in a single file.
 *
 * Required: `snapshot` / `locate` / `settled` / `contractVersion`.
 * Optional: `hitTest` (native pick; recorder falls back to bbox containment).
 *
 * Kit-level helpers (live in `@scenelock/scene`, not on this interface):
 * - **worldToScreen** — camera/viewport transform from locate()-space to pointer
 *   CSS pixels via `resolvePointerTarget` / `TargetingOptions.worldToScreen`.
 * - **settled options** — timeout, step pump, and diagnostics via `awaitSettled`
 *   (`AwaitSettledOptions`: `timeoutMs`, `step`, `stepDeltaMs`, `diagnose`).
 */
export interface SceneAdapter {
  /**
   * Host contract version string (e.g. `"creator-engine-v1"`, `"toy-v1"`).
   * Recorder sessions record this for replay / codegen metadata.
   */
  readonly contractVersion: string;
  /** Full retained-model snapshot for asserts + agent traces. */
  snapshot(): SceneNode[] | Promise<SceneNode[]>;
  /**
   * Resolve an id to a bbox for real pointer events.
   * Returns null when the node is gone / not hittable.
   * Bboxes are typically screen-space; apply kit `worldToScreen` when the host
   * reports world coordinates.
   */
  locate(id: SceneNodeId): BBox | null | Promise<BBox | null>;
  /**
   * Wait until the host is settled (queue drained, frame rendered, mirrors quiet).
   * Kills wait-guessing / fixed sleeps.
   * For timeout + step-pumping, wrap with `@scenelock/scene` `awaitSettled`.
   */
  settled(): Promise<void>;
  /**
   * Optional native hit-test at a screen point.
   * Returns the node id under the point, or null when nothing is hittable.
   * When absent, kits fall back to top-most bbox containment via snapshot/locate.
   */
  hitTest?(
    point: { x: number; y: number },
  ): SceneNodeId | null | Promise<SceneNodeId | null>;
}

export interface SceneQuery {
  /** Find nodes matching role/name/state predicates over the last snapshot. */
  find(predicate: ScenePredicate): SceneNode[];
  /** Strict single match or throw. */
  findOne(predicate: ScenePredicate): SceneNode;
}

export type ScenePredicate =
  | { id: string }
  | { role: string; name?: string | RegExp }
  | ((node: SceneNode) => boolean);

/**
 * Optional pixel surface for golden / zero-adapter fallback (adoption rung 1).
 * Prefer software raster; document pin assumptions in @scenelock/golden.
 */
export interface RasterSurface {
  /** Width × height × RGBA bytes (row-major). */
  render():
    | { width: number; height: number; pixels: Uint8ClampedArray }
    | Promise<{ width: number; height: number; pixels: Uint8ClampedArray }>;
}
