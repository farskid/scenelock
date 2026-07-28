/**
 * `@scenelock/scene` — scene contract kit over {@link SceneAdapter} from `@scenelock/core`.
 *
 * Owns: SceneQuery engine, pointer targeting, settledness waits, fake/reference adapter,
 * and the adapter conformance vitest suite.
 *
 * Library adapters (tldraw, Konva, Excalidraw, …) ship later as `@scenelock/adapter-*`
 * packages that implement `SceneAdapter` and run {@link createAdapterConformanceTests}.
 * Apps wire a one-file adapter via {@link defineSceneAdapter}.
 */

export type {
  BBox,
  RasterSurface,
  SceneAdapter,
  SceneNode,
  ScenePredicate,
  SceneQuery,
} from "@scenelock/core";

export { bboxCenter, bboxContains } from "@scenelock/core";

export {
  SceneQueryError,
  SceneTargetError,
  SceneSettledTimeoutError,
  formatCandidates,
} from "./errors.js";

export { matchSceneNode, matchName } from "./match.js";

export type { GetByRoleOptions, SceneQueryEngine } from "./query.js";
export { createSceneQuery, queryAdapter } from "./query.js";

export type { PointerPoint, WorldToScreen, TargetingOptions } from "./targeting.js";
export {
  isDegenerateBBox,
  resolvePointerTarget,
  transformBBox,
} from "./targeting.js";

export type { SettledStepCallback, AwaitSettledOptions } from "./settled.js";
export { awaitSettled } from "./settled.js";

export { assertSceneAdapter, defineSceneAdapter } from "./adapter.js";

export type {
  FakeSceneModel,
  CreateFakeAdapterOptions,
  FakeSceneAdapter,
} from "./fake-adapter.js";
export { createFakeAdapter } from "./fake-adapter.js";

export type { AdapterFactory, AdapterConformanceOptions } from "./conformance.js";
export { createAdapterConformanceTests } from "./conformance.js";

export type { RasterFrame } from "./raster.js";
export { renderRasterSurface, defineRasterSurface } from "./raster.js";
