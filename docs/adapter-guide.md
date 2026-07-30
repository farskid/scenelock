# SceneAdapter author guide

Host apps expose their retained model through a thin **SceneAdapter**. SceneLock’s harness, recorder, and golden tiers all speak this contract — one DSL for DOM chrome and canvas.

## Required surface

```ts
import type { SceneAdapter } from "@scenelock/core";
import { defineSceneAdapter } from "@scenelock/scene";

export const adapter = defineSceneAdapter({
  contractVersion: "my-app-v1",
  snapshot: () => [...],
  locate: (id) => bboxOrNull,
  settled: async () => { /* interaction-ready */ },
  // optional:
  // hitTest: (point) => idOrNull,
});
```

| Member | Role |
| --- | --- |
| `contractVersion` | Stable string (e.g. `"creator-engine-v1"`, `"toy-v1"`). Recorder sessions store it for replay/codegen metadata. Bump when locate/snapshot semantics change. |
| `snapshot()` | Full retained-model dump for asserts and agent traces. |
| `locate(id)` | Resolve an id to a CSS-pixel bbox for real pointer events, or `null` if gone / not hittable. |
| `settled()` | Resolve when the host is **interaction-ready** (see below). |
| `hitTest?(point)` | Optional native pick. When absent, kits fall back to top-most bbox containment. |

Wrap with `defineSceneAdapter` (or `assertSceneAdapter`) so shape errors fail at construction.

## Snapshot node schema

Every node must include:

- **`id`** — stable within the retained model  
- **`role`** — ARIA-like role (`"shape"`, `"layer"`, `"handle"`, …)  
- **`bbox`** — `{ x, y, width, height }` in the same space `locate()` returns (typically screen/CSS pixels)

Also required by the core type (and conformance suite):

- **`name`** — accessible / display name (use `""` when unknown)

Put engine extras on **`meta`** (composition id, layer flags, …), not on `state`. Use **`state`** for interaction flags (`selected`, `locked`, opacity, …). Optional `parentId` / `childIds` describe tree structure.

## `locate` and world → screen

`locate(id)` must return the bbox the pointer should aim at. If the host stores **world** coordinates, convert with kit `worldToScreen` (`resolvePointerTarget` / `TargetingOptions.worldToScreen` in `@scenelock/scene`) before emitting events — adapters themselves usually return screen space.

## Settled semantics

`settled()` means **safe to interact**, not “animation finished”:

- Input queue drained, mirrors quiet, next frame committed enough for targeting  
- Do **not** wait for decorative loops, infinite spinners, or ambient animation  
- Prefer host signals (frame fence, “no pending commands”) over fixed sleeps  

For timeouts and virtual-clock step pumping, wrap with `awaitSettled` from `@scenelock/scene`.

## Optional `hitTest`

Implement when the engine has a real pick path (z-order, occlusion, clipping). Recorder and targeting prefer `hitTest` over bbox stacking. Return the node id under the point, or `null`.

## Conformance tests

Ship a vitest file that calls:

```ts
import { createAdapterConformanceTests } from "@scenelock/scene";
import { createMyAdapter } from "../src/adapter.js";

createAdapterConformanceTests(() => createMyAdapter());
```

Checks: adapter shape + `contractVersion`, snapshot node schema, locate↔snapshot bbox consistency, unknown id → `null`, `settled()` resolves, and (when present) `hitTest(center)` returns the node or an ancestor.

## Distribution naming

Publish library adapters as:

- `@scenelock/adapter-<host>` — e.g. `@scenelock/adapter-tldraw`, `@scenelock/adapter-konva`

App-specific one-file adapters stay in the app; they are not published under `@scenelock/*`.

## Composite-frame lesson (goldens)

Goldens must come from the **final composited frame the user sees** — engine render **plus** overlay passes (selection outlines, handles, HUD), not an intermediate buffer from mid-pipeline.

Abstract case: a creator-style host drew selection outlines in a **post-process overlay** after the main scene pass. Capturing the engine framebuffer alone produced green goldens that never matched what users (or screenshot-based failures) saw. Always pin the raster/golden source to the same composite the product presents.
