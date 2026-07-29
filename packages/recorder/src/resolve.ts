import {
  bboxContains,
  type DomLocator,
  type SceneNode,
} from "@scenelock/core";
import type {
  DomElementInfo,
  DomResolver,
  RecordedSceneLocator,
  RecordedTarget,
  RecorderSceneAdapter,
} from "./types.js";

/**
 * DOM emission ladder (research 03/04): role+name → label → text → testId.
 * Structural CSS is never emitted. Ambiguous (count ≠ 1) → next rung.
 */
export async function resolveDomTarget(
  resolver: DomResolver,
  info: DomElementInfo,
): Promise<RecordedTarget | null> {
  const candidates: DomLocator[] = [];

  if (info.role !== undefined) {
    if (info.name !== undefined && info.name.length > 0) {
      candidates.push({ kind: "role", role: info.role, name: info.name, exact: true });
    } else {
      candidates.push({ kind: "role", role: info.role });
    }
  }
  if (info.label !== undefined && info.label.length > 0) {
    candidates.push({ kind: "label", label: info.label, exact: true });
  }
  if (info.text !== undefined && info.text.length > 0) {
    candidates.push({ kind: "text", text: info.text, exact: true });
  }
  if (info.placeholder !== undefined && info.placeholder.length > 0) {
    candidates.push({ kind: "placeholder", placeholder: info.placeholder, exact: true });
  }
  if (info.alt !== undefined && info.alt.length > 0) {
    candidates.push({ kind: "alt", alt: info.alt, exact: true });
  }
  if (info.testId !== undefined && info.testId.length > 0) {
    candidates.push({ kind: "testId", testId: info.testId });
  }

  for (const locator of candidates) {
    const n = await Promise.resolve(resolver.count(locator));
    if (n === 1) {
      return { kind: "dom", locator };
    }
  }
  return null;
}

/**
 * Hit-test a screen point against the scene adapter.
 * Prefers optional `adapter.hitTest`; else top-most bbox via snapshot/locate.
 */
export async function hitTestScene(
  adapter: RecorderSceneAdapter,
  point: { x: number; y: number },
): Promise<SceneNode | null> {
  if (adapter.hitTest !== undefined) {
    const hit = await Promise.resolve(adapter.hitTest(point));
    if (hit === null || hit === undefined) return null;
    const id = typeof hit === "string" ? hit : hit.id;
    const nodes = await Promise.resolve(adapter.snapshot());
    return nodes.find((n) => n.id === id) ?? null;
  }

  const nodes = await Promise.resolve(adapter.snapshot());
  // Top-most = last in snapshot order whose locate()/bbox contains the point.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const box = (await Promise.resolve(adapter.locate(node.id))) ?? node.bbox;
    if (bboxContains(box, point.x, point.y)) {
      return node;
    }
  }
  return null;
}

/** Prefer unique role(+name); else stable scene id. */
export async function resolveSceneLocator(
  adapter: RecorderSceneAdapter,
  node: SceneNode,
): Promise<RecordedSceneLocator> {
  const nodes = await Promise.resolve(adapter.snapshot());
  const roleHits = nodes.filter((n) => {
    if (n.role !== node.role) return false;
    if (node.name.length === 0) return true;
    return n.name === node.name;
  });
  if (roleHits.length === 1) {
    return node.name.length > 0
      ? { kind: "role", role: node.role, name: node.name }
      : { kind: "role", role: node.role };
  }
  return { kind: "sceneId", id: node.id };
}

export async function resolveSceneTarget(
  adapter: RecorderSceneAdapter,
  point: { x: number; y: number },
): Promise<RecordedTarget | null> {
  const node = await hitTestScene(adapter, point);
  if (node === null) return null;
  const locator = await resolveSceneLocator(adapter, node);
  return { kind: "scene", locator };
}

export interface ResolvePointOptions {
  readonly adapter?: RecorderSceneAdapter;
  readonly domResolver?: DomResolver;
  /** Prefer DOM, canvas, or try DOM then scene. */
  readonly surface?: "dom" | "canvas" | "auto";
}

/**
 * Resolve a pointer position to the best semantic target.
 * Ladder: DOM (when surface allows) → scene hit-test → flagged raw point.
 */
export async function resolvePointTarget(
  point: { x: number; y: number },
  options: ResolvePointOptions,
): Promise<RecordedTarget> {
  const surface = options.surface ?? "auto";

  if (surface !== "canvas" && options.domResolver !== undefined) {
    const info = await Promise.resolve(options.domResolver.atPoint(point.x, point.y));
    if (info !== null) {
      const dom = await resolveDomTarget(options.domResolver, info);
      if (dom !== null) return dom;
      if (surface === "dom") {
        return {
          kind: "point",
          x: point.x,
          y: point.y,
          reason: "no-dom-match",
          flagged: true,
        };
      }
    } else if (surface === "dom") {
      return {
        kind: "point",
        x: point.x,
        y: point.y,
        reason: "no-dom-match",
        flagged: true,
      };
    }
  }

  if (surface !== "dom" && options.adapter !== undefined) {
    const scene = await resolveSceneTarget(options.adapter, point);
    if (scene !== null) return scene;
  }

  return {
    kind: "point",
    x: point.x,
    y: point.y,
    reason: options.adapter !== undefined ? "no-scene-match" : "no-dom-match",
    flagged: true,
  };
}
