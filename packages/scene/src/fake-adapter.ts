import type { BBox, RasterSurface, SceneAdapter, SceneNode, SceneNodeId } from "@scenelock/core";
import { bboxContains } from "@scenelock/core";
import { defineSceneAdapter } from "./adapter.js";
import type { WorldToScreen } from "./targeting.js";
import { transformBBox } from "./targeting.js";

/** Mutable in-memory retained model for unit tests. */
export interface FakeSceneModel {
  /** Current nodes (snapshot order). */
  nodes: SceneNode[];
  /**
   * Pending mutation count. `settled()` resolves only when this reaches 0.
   * Each `step(deltaMs)` decrements by 1 (floor at 0).
   */
  pendingMutations: number;
  /** Optional camera transform applied by `locate()` when `locateInScreenSpace` is true. */
  worldToScreen?: WorldToScreen;
  /**
   * When true (default), `locate` returns screen-space bboxes via `worldToScreen`.
   * Snapshot always returns world-space bboxes as authored.
   */
  locateInScreenSpace: boolean;
  /** Last diagnostic string for settled timeouts. */
  mutatingReason: string;
}

export interface CreateFakeAdapterOptions {
  /** Initial pending mutations before settled. Default 0. */
  pendingMutations?: number;
  worldToScreen?: WorldToScreen;
  locateInScreenSpace?: boolean;
  mutatingReason?: string;
  /** Adapter contract version. Default `"fake-v1"`. */
  contractVersion?: string;
  /**
   * When false, omit native `hitTest` (bbox fallback only). Default true —
   * top-most bbox containment in locate()/snapshot space.
   */
  hitTest?: boolean;
}

/**
 * Controllable fake adapter + model — the reference implementation for
 * `@scenelock/scene` tests and for other packages' unit tests.
 */
export interface FakeSceneAdapter extends SceneAdapter {
  readonly model: FakeSceneModel;
  /** Replace the retained model. */
  setNodes(nodes: readonly SceneNode[]): void;
  /** Mark N frames of work remaining before settled. */
  markDirty(pendingMutations?: number, reason?: string): void;
  /** Drive one frame (decrements pendingMutations). */
  step(deltaMs?: number): void;
  /** Optional RGBA surface backed by a solid clear (for RasterSurface helper tests). */
  asRasterSurface(width?: number, height?: number): RasterSurface;
}

function cloneNodes(nodes: readonly SceneNode[]): SceneNode[] {
  return nodes.map((n) => {
    const copy: SceneNode = {
      id: n.id,
      role: n.role,
      name: n.name,
      bbox: { ...n.bbox },
    };
    if (n.state !== undefined) copy.state = { ...n.state };
    if (n.meta !== undefined) copy.meta = { ...n.meta };
    if (n.parentId !== undefined) copy.parentId = n.parentId;
    if (n.childIds !== undefined) copy.childIds = [...n.childIds];
    return copy;
  });
}

function locateBox(model: FakeSceneModel, id: SceneNodeId): BBox | null {
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return null;
  if (model.locateInScreenSpace && model.worldToScreen !== undefined) {
    return transformBBox(node.bbox, model.worldToScreen);
  }
  return { ...node.bbox };
}

/**
 * Create an in-memory {@link SceneAdapter} from a node list.
 *
 * @example
 * ```ts
 * const adapter = createFakeAdapter([
 *   { id: "r1", role: "shape", name: "Rect", bbox: { x: 0, y: 0, width: 10, height: 10 } },
 * ]);
 * ```
 */
export function createFakeAdapter(
  nodes: readonly SceneNode[],
  options?: CreateFakeAdapterOptions,
): FakeSceneAdapter {
  const model: FakeSceneModel = {
    nodes: cloneNodes(nodes),
    pendingMutations: options?.pendingMutations ?? 0,
    locateInScreenSpace: options?.locateInScreenSpace ?? true,
    mutatingReason: options?.mutatingReason ?? "fake pendingMutations > 0",
  };
  if (options?.worldToScreen !== undefined) {
    model.worldToScreen = options.worldToScreen;
  }

  const step = (_deltaMs = 16): void => {
    if (model.pendingMutations > 0) {
      model.pendingMutations -= 1;
    }
  };

  const enableHitTest = options?.hitTest ?? true;

  const hitTest = (point: { x: number; y: number }): SceneNodeId | null => {
    for (let i = model.nodes.length - 1; i >= 0; i--) {
      const node = model.nodes[i]!;
      const box = locateBox(model, node.id) ?? node.bbox;
      if (bboxContains(box, point.x, point.y)) {
        return node.id;
      }
    }
    return null;
  };

  const base = defineSceneAdapter({
    contractVersion: options?.contractVersion ?? "fake-v1",
    snapshot(): SceneNode[] {
      return cloneNodes(model.nodes);
    },
    locate(id: string): BBox | null {
      return locateBox(model, id);
    },
    async settled(): Promise<void> {
      while (model.pendingMutations > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    },
    ...(enableHitTest ? { hitTest } : {}),
  });

  return {
    contractVersion: base.contractVersion,
    snapshot: () => base.snapshot(),
    locate: (id) => base.locate(id),
    settled: () => base.settled(),
    ...(enableHitTest && base.hitTest !== undefined
      ? { hitTest: (point) => base.hitTest!(point) }
      : {}),
    model,
    setNodes(next) {
      model.nodes = cloneNodes(next);
    },
    markDirty(pendingMutations = 1, reason?: string) {
      model.pendingMutations = pendingMutations;
      if (reason !== undefined) model.mutatingReason = reason;
    },
    step,
    asRasterSurface(width = 8, height = 8) {
      return {
        render() {
          return {
            width,
            height,
            pixels: new Uint8ClampedArray(width * height * 4),
          };
        },
      };
    },
  };
}
