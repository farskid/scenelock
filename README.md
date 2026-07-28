# Scenelock

![status](https://img.shields.io/badge/status-early%20spike-yellow)

**Deterministic UI testing for TypeScript/JavaScript apps — canvas-first.**

Flake becomes a seed you can replay. Canvas apps stop being second-class. “What to test” becomes a coverage criterion, not a guess.

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

## Tier model

| Tier | Where | For |
| --- | --- | --- |
| **Engine** | Node (+ WASM hosts) | Fast scene tests, invariants, bit-exact goldens — no browser |
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

Zero-adapter fallback: deterministic pixel goldens from a software `render()→RGBA` (adoption rung 1). Library adapters (`tldraw`, Konva, …) come next so the ecosystem covers libraries, not each app.

See `examples/toy-canvas-app` for a minimal retained-model host.

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

Contracts and the parallel-agent work plan: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

---

## Keywords

`deterministic-testing` · `canvas` · `e2e` · `playwright` · `scene-graph` · `statechart` · `model-based-testing` · `seed-replay` · `typescript` · `ui-testing` · `agent-friendly`

---

## Status

**Early spike.** Interfaces are real; implementations are stubs. APIs will move until the toy host and first adopter (LottieFiles Creator) survive contact.

## License

MIT
