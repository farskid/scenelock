# Scenelock

![status](https://img.shields.io/badge/status-wave%202-green)

**Deterministic UI testing for TypeScript/JavaScript apps — canvas-first.**

Flake becomes a seed you can replay. Canvas apps stop being second-class. “What to test” becomes a coverage criterion, not a guess.

---

## Status

**Wave 2** — core v2 contracts ratified; end-to-end proof on the toy canvas host (`examples/toy-canvas-app`): scene flow, bit-exact goldens, discovery walks, seed replay.

Still ahead: real host spikes (Creator / tldraw), recorder, CLI.

---

## The three legs

1. **Deterministic executor** — virtual time, seeded randomness, step-driven render loops, pinned software rasterizer. Every run is a seed; failures are replay tokens. Races are found by *varying* seeds (schedule fuzzing), not tolerated as flake.

2. **Scene contract** — apps expose their retained model through a thin adapter:
   - `snapshot()` → scene nodes (id, role, name, bbox, state)
   - `locate(id)` → bbox for real pointer events
   - `settled()` → kills wait-guessing  
   One DSL spans **DOM chrome** (a11y-primary locators) and **canvas surface** (scene locators).

3. **Model-driven discovery** — statecharts (or agent-inferred models) generate test walks; invariants (undo/redo identity, mirror consistency, …) run on every walk. Variant count is a coverage criterion.

The browser tier wraps **Playwright** (library, not a re-export of `@playwright/test`).

---

## Quickstart (toy host)

```ts
import { createExecutor, createStepLoopDriver } from "@scenelock/executor";
import { awaitSettled, createSceneQuery } from "@scenelock/scene";
import { DirectoryGoldenStore } from "@scenelock/golden";
import {
  ToyCanvasApp,
  TOY_RASTER_FINGERPRINT,
  createToySceneAdapter,
  createToyStepLoop,
} from "@scenelock/toy-canvas-app";

const app = new ToyCanvasApp();
app.add("rect", { name: "Box", x: 8, y: 8, width: 20, height: 16 });

const adapter = createToySceneAdapter(app);
const stepLoop = createToyStepLoop(app);
const ex = createExecutor({ seed: "demo", stepLoop });

await ex.run(async (ctx) => {
  const q = createSceneQuery(await adapter.snapshot());
  const box = q.getByRole("rect", { name: "Box" });
  app.tweenTo(box.id, 20, 20, 48);
  await awaitSettled(adapter, {
    step: (dt) => ctx.stepLoop!.step(dt),
    stepDeltaMs: 16,
  });
});

const store = new DirectoryGoldenStore({
  directory: "./goldens",
  rasterizerFingerprint: TOY_RASTER_FINGERPRINT, // "toy-raster-v1"
});
const result = await store.compare("toy-scene", app.render());
// result.verdict === "match" against committed goldens
```

Integration proofs live in `examples/toy-canvas-app/src/__tests__/integration.test.ts` (flow, golden, discovery, seed replay).

---

## Tier model

| Tier | Where | For |
| --- | --- | --- |
| **Engine** | Node (+ WASM hosts) | Fast scene tests, invariants — no browser |
| **Golden** | Pinned software raster | Bit-exact RGBA goldens (`tier: "golden"`) |
| **Browser** | Chromium via Playwright | Full integration; DOM + canvas; COOP/COEP when SAB is required |
| **Virtual time** | Optional CDP accelerator | Main-thread hosts only — not the default for worker/OffscreenCanvas apps |

---

## Adoption story (canvas apps)

Ship an adapter in **one file**:

```ts
import { defineSceneAdapter } from "@scenelock/scene";

export const adapter = defineSceneAdapter({
  snapshot: () => editor.getNodes().map(/* → SceneNode */),
  locate: (id) => editor.getBbox(id),
  settled: () => editor.whenSettled(),
});
```

Kit helpers (`worldToScreen`, `awaitSettled` options) live in `@scenelock/scene` — not on the minimal `SceneAdapter` surface.

Zero-adapter fallback: deterministic pixel goldens from a software `render()→RGBA` (adoption rung 1). Library adapters (`tldraw`, Konva, …) come next so the ecosystem covers libraries, not each app.

See `examples/toy-canvas-app` for a retained-model host with software raster + step loop.

---

## Packages

| Package | Role |
| --- | --- |
| `@scenelock/core` | Shared types, DSL, failure envelope (JSON schema) |
| `@scenelock/executor` | Seeds, virtual clock, step-loop driver |
| `@scenelock/scene` | Scene adapter kit + queries |
| `@scenelock/browser` | Playwright-wrapped browser tier |
| `@scenelock/discovery` | Statechart walks + invariants |
| `@scenelock/golden` | Bit-exact golden comparison |

Contracts and the work plan: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

---

## Keywords

`deterministic-testing` · `canvas` · `e2e` · `playwright` · `scene-graph` · `statechart` · `model-based-testing` · `seed-replay` · `typescript` · `ui-testing` · `agent-friendly`

## License

MIT
