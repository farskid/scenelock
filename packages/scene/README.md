# `@scenelock/scene`

Scene contract kit: query retained-model snapshots, aim real pointers via `locate()`, wait for `settled()`, and validate community adapters.

## Public surface

| Export | Role |
| --- | --- |
| `createSceneQuery` / `queryAdapter` | Strict `getByRole` / `getBySceneId` / `getByState`, filter + subtree scope |
| `resolvePointerTarget` | `locate` → bbox center → optional `worldToScreen` |
| `awaitSettled` | Timeout + diagnostic; optional step callback to pump frames |
| `createFakeAdapter` | In-memory reference adapter for unit tests |
| `createAdapterConformanceTests` | Vitest suite adapter authors must pass |
| `defineSceneAdapter` | Validate + return a host adapter |

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
