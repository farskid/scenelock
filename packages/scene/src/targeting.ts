import { bboxCenter, type BBox, type SceneAdapter, type SceneNode } from "@scenelock/core";
import { SceneTargetError } from "./errors.js";

/** Screen-space pointer coordinates (CSS pixels, origin top-left). */
export interface PointerPoint {
  x: number;
  y: number;
}

/**
 * Camera / viewport transform from world (snapshot/locate space) to screen
 * (pointer event space). Identity when the host already reports screen bboxes.
 */
export type WorldToScreen = (point: PointerPoint) => PointerPoint;

/** Optional viewport in screen space for offscreen rejection. */
export interface TargetingOptions {
  /**
   * Transform locate()-space center → pointer coordinates.
   * Default: identity (host already emits screen-space bboxes).
   */
  worldToScreen?: WorldToScreen;
  /**
   * When set, the transformed center must lie inside this screen rect
   * (half-open: `[x, x+width) × [y, y+height)`).
   */
  viewport?: BBox;
}

const IDENTITY: WorldToScreen = (p) => p;

/** True when width/height are non-positive or non-finite. */
export function isDegenerateBBox(b: BBox): boolean {
  return (
    !Number.isFinite(b.x) ||
    !Number.isFinite(b.y) ||
    !Number.isFinite(b.width) ||
    !Number.isFinite(b.height) ||
    b.width <= 0 ||
    b.height <= 0
  );
}

function inViewport(viewport: BBox, p: PointerPoint): boolean {
  return (
    p.x >= viewport.x &&
    p.y >= viewport.y &&
    p.x < viewport.x + viewport.width &&
    p.y < viewport.y + viewport.height
  );
}

/**
 * Resolve a scene node (or id) to pointer coordinates via `adapter.locate()`.
 *
 * Pipeline: locate → validate bbox → bboxCenter → worldToScreen → optional viewport check.
 * Throws {@link SceneTargetError} when the node is missing, bbox is degenerate, or offscreen.
 */
export async function resolvePointerTarget(
  adapter: SceneAdapter,
  nodeOrId: SceneNode | string,
  options?: TargetingOptions,
): Promise<PointerPoint> {
  const id = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
  const bbox = await Promise.resolve(adapter.locate(id));
  if (bbox === null) {
    throw new SceneTargetError(
      `SceneTarget: locate(${JSON.stringify(id)}) returned null (gone or not hittable)`,
      id,
    );
  }
  if (isDegenerateBBox(bbox)) {
    throw new SceneTargetError(
      `SceneTarget: locate(${JSON.stringify(id)}) returned degenerate bbox ` +
        `{x:${bbox.x}, y:${bbox.y}, width:${bbox.width}, height:${bbox.height}}`,
      id,
    );
  }

  const world = bboxCenter(bbox);
  const screen = (options?.worldToScreen ?? IDENTITY)(world);

  if (options?.viewport !== undefined && !inViewport(options.viewport, screen)) {
    throw new SceneTargetError(
      `SceneTarget: target for ${JSON.stringify(id)} is offscreen at ` +
        `(${screen.x}, ${screen.y}) outside viewport ` +
        `{x:${options.viewport.x}, y:${options.viewport.y}, ` +
        `width:${options.viewport.width}, height:${options.viewport.height}}`,
      id,
    );
  }

  return screen;
}

/**
 * Apply world→screen to a bbox (transform all four corners, return AABB).
 * Useful when adapters expose world-space snapshot bboxes but need screen asserts.
 */
export function transformBBox(bbox: BBox, worldToScreen: WorldToScreen = IDENTITY): BBox {
  const corners: PointerPoint[] = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x, y: bbox.y + bbox.height },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
  ].map(worldToScreen);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
