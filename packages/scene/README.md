# `@scenelock/scene`

Scene contract kit: query retained-model snapshots, aim real pointers via `locate()`, wait for `settled()`, and validate community adapters.

## `SceneAdapter` (core)

Required: `contractVersion`, `snapshot()`, `locate(id)`, `settled()`.
Optional: `hitTest(point) → SceneNodeId | null` (native pick; kits fall back to bbox).

`SceneNode` carries interaction flags in `state` and optional host/engine extras in top-level `meta` (not under `state`).

## Public surface

| Export | Role |
| --- | --- |
| `createSceneQuery` / `queryAdapter` | Strict `getByRole` / `getBySceneId` / `getByState`, filter + subtree scope |
| `resolvePointerTarget` | `locate` → bbox center → optional `worldToScreen` |
| `awaitSettled` | Timeout + diagnostic; optional step callback to pump frames |
| `createFakeAdapter` | In-memory reference adapter for unit tests (`contractVersion: "fake-v1"`, optional hitTest) |
| `createAdapterConformanceTests` | Vitest suite: shape + locate consistency + optional hitTest(center) → self/ancestor |
| `defineSceneAdapter` | Validate + return a host adapter |

## Harness scene queries (`@scenelock/harness`)

`t.scene.*` is **live-by-default**: each query / `snapshot()` re-reads `adapter.snapshot()`.
Call `t.scene.freeze()` to pin; `t.scene.refresh()` forces a new snapshot (updates the pin when frozen).

## Library-adapter distribution

Hosts implement `SceneAdapter` once per graphics library; apps wire it in a single file.

| Package (planned) | Host |
| --- | --- |
| `@scenelock/adapter-tldraw` | tldraw `editor.store` |
| `@scenelock/adapter-excalidraw` | `getSceneElements()` |
| `@scenelock/adapter-konva` / `pixi` | scene graph walk |
| App-local `defineSceneAdapter(...)` | Custom engines (Creator, toys) |

Compatibility seam: run `createAdapterConformanceTests(() => yourAdapter)` in the adapter package CI. Core contracts stay frozen in `@scenelock/core`; this package is the query/targeting/settled kit only.

Zero-adapter fallback (adoption rung 1): expose `RasterSurface` and use `@scenelock/golden` — no scene asserts required.
