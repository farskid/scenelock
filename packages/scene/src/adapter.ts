import type { SceneAdapter } from "@scenelock/core";

/**
 * Runtime guard for host adapters — ensures the three required methods exist.
 *
 * Library adapters (`@scenelock/adapter-tldraw`, …) should call this once at
 * construction; apps typically use {@link defineSceneAdapter} instead.
 */
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
 * Wrap a retained-model getter into a SceneAdapter after validating the shape.
 * Prefer this as the sole export from an app's one-file adapter module.
 */
export function defineSceneAdapter(impl: SceneAdapter): SceneAdapter {
  assertSceneAdapter(impl);
  return impl;
}
