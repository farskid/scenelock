# Scenelock

![status](https://img.shields.io/badge/status-harness-green)

**Deterministic UI testing for TypeScript/JavaScript apps — canvas-first.**

Flake becomes a seed you can replay. Canvas apps stop being second-class. “What to test” becomes a coverage criterion, not a guess.

---

## Status

**Harness DSL + recorder** — `@scenelock/harness` unifies scene / browser / golden / smoke behind `createHarness`. `@scenelock/recorder` emits harness DSL files + machine JSON (non-interactive; a11y/scene locators, never Inspector-copy).

Still ahead: CLI, real host spikes (Creator / tldraw).

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

## Install

Packages ship as ESM from `dist/` (`"exports"` → `types` + `import`). Current version: **0.1.0**. npm publish is deferred; consume via packed tarballs:

```bash
pnpm install
pnpm build

# from each packages/<name> (topo order if packing by hand):
pnpm pack
# → e.g. packages/harness/scenelock-harness-0.1.0.tgz
```

Install a consumer (outside this repo) with harness + its dependency tarballs. Because packed manifests rewrite `workspace:*` → `0.1.0`, point nested deps at the tarballs via `pnpm.overrides` (or wait for npm publish):

```bash
mkdir /tmp/scenelock-app && cd /tmp/scenelock-app
# package.json dependencies + pnpm.overrides each set to
# file:/path/to/scenelock/packages/<name>/scenelock-<name>-0.1.0.tgz
# for: core, executor, scene, browser, golden, harness
pnpm install
```

`@scenelock/browser` lists `playwright` as an **optional peer** — scene-tier consumers do not pull browsers. Add `playwright` only for browser/smoke tiers. Adapter conformance lives at `@scenelock/scene/conformance` (optional `vitest` peer), not on the main scene entry.

When publishing to npm later: same `files: ["dist"]` + exports map; replace tarball paths with `@scenelock/<pkg>@0.1.0` (overrides unnecessary once packages are on the registry).

See [CONTRIBUTING.md](./CONTRIBUTING.md) for build/test commands.

---

## Quickstart (toy host)

```ts
import { createHarness } from "@scenelock/harness";
import { DirectoryGoldenStore } from "@scenelock/golden";
import {
  ToyCanvasApp,
  TOY_RASTER_FINGERPRINT,
  createToySceneAdapter,
  createToyStepLoop,
  createToyPointerSink,
} from "@scenelock/toy-canvas-app";

const app = new ToyCanvasApp();
app.add("rect", { name: "Box", x: 8, y: 8, width: 20, height: 16 });

const t = await createHarness({
  tier: "scene",
  adapter: createToySceneAdapter(app),
  seed: "demo",
  stepLoop: createToyStepLoop(app),
  pointer: createToyPointerSink(app),
});

const box = t.scene.getByRole("rect", { name: "Box" });
await t.user.click(box);
app.tweenTo(box.id, 20, 20, 48);
await t.settled();
await t.expect(box).toMatchScene({ role: "rect", name: "Box" });
await t.dispose();

// Golden tier — same shape; t.golden.compare is live
const store = new DirectoryGoldenStore({
  directory: "./goldens",
  rasterizerFingerprint: TOY_RASTER_FINGERPRINT, // "toy-raster-v1"
});
const g = await createHarness({
  tier: "golden",
  adapter: createToySceneAdapter(app),
  goldenStore: store,
  seed: "demo-golden",
});
await g.golden.compare("toy-scene", app.render());
await g.dispose();
```

Integration proofs: `examples/toy-canvas-app/src/__tests__/` (`harness.test.ts`, `harness.golden.test.ts`, `integration.test.ts`).

---

## Tier model

| Tier | Filename | For |
| --- | --- | --- |
| **scene** | `*.test.ts` (default) | Adapter + executor — cheapest honest path; no DOM `ui` |
| **browser** | `*.browser.test.ts` | Chromium via Playwright; DOM + canvas; determinism pack |
| **golden** | `*.golden.test.ts` | Scene + bit-exact RGBA goldens |
| **smoke** | `*.smoke.test.ts` | Browser minus determinism (real clock); quarantined from PR gate |

Accessing a dead subsurface throws `TierPromotionError` naming the required tier + filename suffix. Optional `TierBudget` fails CI when browser+smoke ratios exceed config.

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
| `@scenelock/harness` | Unified `createHarness` DSL + tiering |
| `@scenelock/recorder` | Non-interactive record → harness DSL + machine log |

### Recorder (agent-friendly)

```ts
import { createRecorder, emitTest, emitLog } from "@scenelock/recorder";
import { createFakeAdapter } from "@scenelock/scene";

const adapter = createFakeAdapter([/* … */]);
const rec = createRecorder({ adapter, tier: "scene", seed: "demo" });
await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "canvas" });
await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 16, surface: "canvas" });
rec.checkpoint("after-click");
await rec.flush();

const { source, filename } = emitTest(rec.session()); // e.g. recorded.test.ts
const log = emitLog(rec.session());                   // machine JSON
```

Locator ladder at record time: DOM `role+name` → label/text → testId; canvas → `scene.getByRole` / `getBySceneId` via adapter `hitTest` or bbox; raw `canvas.at(x,y)` only as a flagged fallback.

Contracts and the work plan: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

---

## Keywords

`deterministic-testing` · `canvas` · `e2e` · `playwright` · `scene-graph` · `statechart` · `model-based-testing` · `seed-replay` · `typescript` · `ui-testing` · `agent-friendly`

## License

MIT
